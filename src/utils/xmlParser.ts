import { XMLParser } from 'fast-xml-parser'
import type {
  TableauDocument,
  TableauDatasource,
  TableauWorksheet,
  TableauDashboard,
  TableauField,
  WorksheetPane,
} from '../types/tableau'

/**
 * TableauのXML文字列（.twbの中身）をパースし、
 * ダッシュボード、シート、フィールドの依存関係を抽出する。
 *
 * 実データ構造:
 *   - ワークシートのフィールド依存:  worksheet > table > view > datasource-dependencies > column
 *   - ダッシュボードのシート参照:    dashboard > zones(再帰) > zone[@name=シート名]
 *   - データソースのフィールド:      workbook > datasources > datasource > column
 */
export function parseTableauXml(xmlString: string): TableauDocument {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    isArray: (name) =>
      [
        'datasource',
        'worksheet',
        'dashboard',
        'column',
        'column-instance',
        'zone',
      ].includes(name),
  })

  let jsonObj: Record<string, unknown>
  try {
    jsonObj = parser.parse(xmlString) as Record<string, unknown>
  } catch (e: unknown) {
    console.error('XML Parse Error:', e)
    if (xmlString) {
      console.log(
        'Problematic XML Snippet (First 1000 chars):',
        xmlString.substring(0, 1000),
      )
    }
    return { datasources: [], worksheets: [], dashboards: [] }
  }

  const workbook = jsonObj?.workbook
  if (!workbook) {
    return { datasources: [], worksheets: [], dashboards: [] }
  }

  const datasources: TableauDatasource[] = []
  const worksheets: TableauWorksheet[] = []
  const dashboards: TableauDashboard[] = []

  // ────────────────────────────────────────────
  // 1. トップレベルのデータソース → フィールド一覧を抽出
  // ────────────────────────────────────────────
  const dsList = ensureArray(workbook.datasources?.datasource)
  dsList.forEach((ds: Record<string, unknown>) => {
    const name = stripBrackets(ds['@_name'])
    const caption = ds['@_caption'] || undefined
    const fields: TableauField[] = []

    // datasource 直下の column を全て取得
    ensureArray(ds.column).forEach((col: Record<string, unknown>) => {
      const colName = stripBrackets(col['@_name'] as string)
      if (!colName) return

      let formula = col.calculation?.['@_formula']
      if (formula) {
        // 1. まず &amp; をデコード
        let decoded = formula.replace(/&amp;/g, '&')

        // 2. 数値実体参照 (&#10;, &#13; 等) を変換
        decoded = decoded.replace(/&#(\d+);/g, (_: string, dec: string) => {
          const charCode = parseInt(dec, 10)
          if (charCode === 13) return ''
          return String.fromCharCode(charCode)
        })

        // 3. 16進数実体参照 (&#x0A; 等) を変換
        decoded = decoded.replace(
          /&#x([0-9a-fA-F]+);/g,
          (_: string, hex: string) => {
            const charCode = parseInt(hex, 16)
            if (charCode === 13) return ''
            return String.fromCharCode(charCode)
          },
        )

        // 4. その他の主要な実体参照
        formula = decoded
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
      }

      fields.push({
        column: colName,
        caption: col['@_caption'] || undefined,
        formula,
        class: col.calculation?.['@_class'] || undefined,
        role: col['@_role'] || undefined,
        type: col['@_type'] || undefined,
        dataType: col['@_datatype'] || undefined,
      })
    })

    datasources.push({ name, caption, fields })
  })

  // ────────────────────────────────────────────
  // 2. ワークシート → 使用フィールドを抽出
  //    実際のパス:
  //      行/列    : worksheet > table > rows / cols  (テキスト内容)
  //      フィルター: worksheet > table > view > filter[@column]
  //      マーク   : worksheet > table > panes > pane > encodings > color/size/label/detail/tooltip
  //      マーク種類: worksheet > table > panes > pane > mark[@class]
  // ────────────────────────────────────────────
  const wsList = ensureArray(workbook.worksheets?.worksheet)
  wsList.forEach((ws: Record<string, unknown>) => {
    const name = stripBrackets(ws['@_name'])
    const caption = ws['@_caption'] || undefined
    const dependencies: string[] = []
    const datasourceNames: string[] = [] // 依存するデータソース名

    const table = ws?.table
    const view = table?.view

    const localFields: TableauField[] = []
    if (view) {
      // 依存データソース名を収集
      ensureArray(view?.datasources?.datasource).forEach(
        (ds: Record<string, unknown>) => {
          const dsName = stripBrackets(ds['@_name'] as string)
          if (dsName && !datasourceNames.includes(dsName)) {
            datasourceNames.push(dsName)
          }
        },
      )

      // datasource-dependencies 内の column/column-instance を収集
      ensureArray(view['datasource-dependencies']).forEach(
        (dep: Record<string, unknown>) => {
          // 1. column (ローカル計算フィールドなど)
          ensureArray(dep.column).forEach((col: Record<string, unknown>) => {
            const colName = stripBrackets(col['@_name'] as string)
            if (colName) {
              if (!dependencies.includes(colName)) dependencies.push(colName)
              localFields.push({
                column: colName,
                caption: col['@_caption'] || undefined,
                dataType: col['@_datatype'],
                isCalc: !!col.calculation,
                formula: col.calculation?.['@_formula'],
                isContinuous: col['@_role'] === 'measure',
                type: col['@_type'] || undefined,
              })
            }
          })
          // 2. column-instance (集計、ランク等)
          ensureArray(dep['column-instance']).forEach(
            (ci: Record<string, unknown>) => {
              const ciName = stripFieldRef(ci['@_name'] as string)
              const sourceColName = stripBrackets(ci['@_column'] as string)
              if (ciName) {
                if (!dependencies.includes(ciName)) dependencies.push(ciName)
                localFields.push({
                  column: ciName,
                  caption: ci['@_caption'] || undefined,
                  class: sourceColName,
                })
              }
            },
          )
        },
      )
    }

    // ── 棚別フィールドの抽出 ──
    const parseFieldRefObj = (raw: string | undefined) => {
      if (!raw) return null

      // 最後にある [...] を探す
      const bracketMatches = [...raw.matchAll(/\[([^\]]+)\]/g)]
      let inner: string
      if (bracketMatches.length > 0) {
        inner = bracketMatches[bracketMatches.length - 1][1]
      } else {
        // [] がない場合はコロン区切りで型識別子を除いた最後を取る
        const parts = raw.split(':').filter((p) => !/^\d+$/.test(p))
        const typeIdentifiers = ['nk', 'qk', 'ok', 'ok2', 'ni', 'oi']
        const filtered = parts.filter(
          (p) => !typeIdentifiers.includes(p.toLowerCase()),
        )
        inner = filtered[filtered.length - 1] || raw
      }

      let isContinuous: boolean | undefined = undefined
      if (/:qk$/i.test(raw)) isContinuous = true
      else if (/:(nk|ok|ok2)$/i.test(raw)) isContinuous = false

      // stripFieldRef でさらに [] などを除去
      const name = stripFieldRef(inner)
      return name ? { name, isContinuous } : null
    }

    const extractShelfFields = (raw: string | undefined) => {
      if (!raw) return []
      // eslint-disable-next-line security/detect-unsafe-regex
      const regex =
        /(?:[a-z0-9_-]+:)?(?:\[[^\]]+\]\.)?\[[^\]]+\](?::[a-z0-9_-]+)*/gi
      return (raw.match(regex) || [])
        .map((r) => {
          const info = parseFieldRefObj(r)
          return info ? { name: r, isContinuous: info.isContinuous } : null
        })
        .filter((f): f is { name: string; isContinuous: boolean } => f !== null)
    }

    const rowsRaw: string =
      typeof table?.rows === 'string'
        ? table.rows
        : table?.rows?.['#text'] || ''
    const colsRaw: string =
      typeof table?.cols === 'string'
        ? table.cols
        : table?.cols?.['#text'] || ''

    const rowFields = extractShelfFields(rowsRaw)
    const colFields = extractShelfFields(colsRaw)

    // フィルター: view > filter[@column]
    const filterFields: { name: string; isContinuous?: boolean }[] = []
    ensureArray(view?.filter).forEach((f: Record<string, unknown>) => {
      const obj = parseFieldRefObj(f['@_column'] as string)
      if (obj && !filterFields.some((x) => x.name === obj.name))
        filterFields.push(obj)
    })

    // マーク: panes > pane
    const allPanes: WorksheetPane[] = []
    const panes = ensureArray(table?.panes?.pane)

    panes.forEach((p: Record<string, unknown>) => {
      const id = p['@_id'] as string
      const yAxisName = p['@_y-axis-name'] as string
      const xAxisName = p['@_x-axis-name'] as string

      // レイヤー名の取得を大幅強化 (子要素も含めて探索)
      let pName: string | undefined

      // 再帰的に name 属性を探す
      const findName = (obj: Record<string, unknown>): string | undefined => {
        if (!obj || typeof obj !== 'object') return undefined
        // mp. で始まる属性があれば最優先
        for (const k in obj) {
          // eslint-disable-next-line security/detect-object-injection
          const val = obj[k]
          if (typeof val === 'string' && val.includes('mp.')) return val
        }
        if (obj['@_name']) return obj['@_name']
        if (obj['name']) return obj['name']

        for (const key in obj) {
          if (key === 'mark' || key === 'encodings') continue
          // eslint-disable-next-line security/detect-object-injection
          const val = obj[key]
          if (Array.isArray(val)) {
            for (const item of val) {
              const res = findName(item)
              if (res) return res
            }
          } else {
            const res = findName(val)
            if (res) return res
          }
        }
        return undefined
      }

      pName = findName(p)

      const isInternalName = (name: string | undefined) => {
        if (!name) return true
        const internalNames = [
          'selection-relaxation-allow',
          'selection-relaxation-option',
          'none',
          'true',
          'false',
        ]
        return (
          internalNames.includes(name.toLowerCase()) ||
          name.includes('__INTERNAL__')
        )
      }

      // 不自然な内部属性ならIDへフォールバック
      if (isInternalName(pName)) {
        pName = id
      }

      // マークタイプ (XML内部キーをそのまま保持、UI側で日本語変換する)
      const rawMark = p?.mark?.['@_class'] || ''
      const markType = rawMark

      // automatic 時の推定マークタイプ
      let resolvedMarkType: string | undefined = undefined
      if (!rawMark || rawMark.toLowerCase() === 'automatic') {
        // 行/列フィールドの型から推定
        const allShelfNames = [...rowFields, ...colFields].map((f) => f.name)
        const hasDate = allShelfNames.some((n) => {
          const parts = n.split(':')
          const last = parts[parts.length - 1]
            .replace(/^\[/, '')
            .replace(/\]$/, '')
          const localF = localFields.find((f) => f.column === last)
          return localF?.dataType === 'date' || localF?.dataType === 'datetime'
        })
        const hasGeo = allShelfNames.some(
          (n) =>
            n.toLowerCase().includes('latitude') ||
            n.toLowerCase().includes('longitude'),
        )
        const continuousCount = [...rowFields, ...colFields].filter(
          (f) => f.isContinuous,
        ).length

        if (hasGeo) {
          resolvedMarkType = 'map'
        } else if (hasDate) {
          resolvedMarkType = 'line'
        } else if (continuousCount >= 2) {
          resolvedMarkType = 'circle'
        } else if (continuousCount >= 1) {
          resolvedMarkType = 'bar'
        }
      }

      const enc = p?.encodings

      const pane: WorksheetPane = {
        id,
        name: pName,
        yAxisName,
        xAxisName,
        markType,
        resolvedMarkType,
        encodings: {
          color: [],
          size: [],
          label: [],
          detail: [],
          tooltip: [],
        },
      }

      if (enc) {
        const getCols = (v: unknown) =>
          ensureArray(v)
            .map((e: unknown) => {
              const item = e as Record<string, unknown>
              const raw = item['@_column'] as string
              if (!raw) return null
              return {
                name: raw,
                isContinuous:
                  raw.includes(':qk') ||
                  raw.includes(':ok') ||
                  raw.includes(':ok2') ||
                  raw.includes(':ni') ||
                  raw.includes(':oi'),
              }
            })
            .filter(
              (f): f is { name: string; isContinuous: boolean } => f !== null,
            )
        pane.encodings.color = getCols(enc.color)
        pane.encodings.size = getCols(enc.size)
        pane.encodings.label = getCols(enc.text)
        pane.encodings.detail = getCols(enc.lod)
        pane.encodings.tooltip = getCols(enc.tooltip)
      }
      allPanes.push(pane)
    })

    const defaultPane: WorksheetPane = allPanes[0] || {
      markType: '',
      encodings: { color: [], size: [], label: [], detail: [], tooltip: [] },
    }

    worksheets.push({
      name,
      caption,
      dependencies,
      datasourceNames,
      shelf: {
        rows: rowFields,
        cols: colFields,
        filters: filterFields,
        panes: allPanes,
        marks: defaultPane,
      },
      localFields,
    })
  })

  // ────────────────────────────────────────────
  // 3. ダッシュボード → 配置されているシートを抽出
  //    dashboard > zones(再帰) > zone[@name] でシート名を拾う
  // ────────────────────────────────────────────
  const wsNameSet = new Set(worksheets.map((w) => w.name))

  const dbList = ensureArray(workbook.dashboards?.dashboard)
  dbList.forEach((db: unknown) => {
    const d = db as Record<string, unknown>
    const name = stripBrackets(d['@_name'] as string)
    const caption = (d['@_caption'] as string) || undefined
    const wSheets: string[] = []

    const findSheetsInZones = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return
      const o = obj as Record<string, unknown>

      // zone 要素があれば処理
      const zones = ensureArray(o.zone || o)
      zones.forEach((zone: unknown) => {
        if (!zone || typeof zone !== 'object') return
        const z = zone as Record<string, unknown>

        const zoneName = stripBrackets(z['@_name'] as string)
        // type='worksheet' または名前がシート一覧に存在する場合に抽出
        if (zoneName && wsNameSet.has(zoneName)) {
          if (!wSheets.includes(zoneName)) {
            wSheets.push(zoneName)
          }
        }

        // 子要素を再帰的に探索（zone, zones, layout 等）
        for (const key in zone) {
          // eslint-disable-next-line security/detect-object-injection
          const val = zone[key]
          if (typeof val === 'object') {
            findSheetsInZones(val)
          }
        }
      })
    }

    findSheetsInZones(db)

    dashboards.push({ name, caption, worksheets: wSheets })
  })

  return { datasources, worksheets, dashboards }
}

/**
 * Tableau内部名のブラケット [] を除去して正規化する。
 * シート名やデータソース名など、実体名に使用する。
 */
function stripBrackets(name: string | undefined): string {
  if (!name) return ''
  let n = name.toString().trim()

  // ブラケットの除去
  if (n.startsWith('[') && n.endsWith(']')) {
    n = n.substring(1, n.length - 1).trim()
  }

  // [DS].[Field] 形式の処理
  if (n.includes('].[')) {
    const parts = n.split('].[')
    n = parts[parts.length - 1]
    if (n.endsWith(']')) n = n.substring(0, n.length - 1)
  } else if (n.startsWith('[') && n.includes('].')) {
    const parts = n.split('].')
    n = parts[parts.length - 1]
  }

  return n.trim()
}

/**
 * フィールド参照用の正規化。
 * 集計関数や型識別子（sum:Field:qk 等）を除去する。
 */
function stripFieldRef(name: string | undefined): string {
  if (!name) return ''
  const n = stripBrackets(name)

  // 集計・型の除去 (sum:Field:qk -> Field)
  const pts = n.split(':').filter((p) => !/^\d+$/.test(p))
  const typeIds = ['nk', 'qk', 'ok', 'ok2', 'ni', 'oi']
  const aggFns = [
    'sum',
    'avg',
    'min',
    'max',
    'count',
    'cnt',
    'cntd',
    'attr',
    'median',
    'stdev',
    'var',
    'collect',
  ]
  const filtered = pts.filter(
    (p) =>
      !typeIds.includes(p.toLowerCase()) && !aggFns.includes(p.toLowerCase()),
  )

  return (filtered[filtered.length - 1] || pts[pts.length - 1] || n)
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .trim()
}

function ensureArray<T>(obj: T | T[] | undefined | null): T[] {
  if (!obj) return []
  return Array.isArray(obj) ? obj : [obj]
}
