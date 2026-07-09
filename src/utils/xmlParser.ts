import { XMLParser } from 'fast-xml-parser'
import type {
  TableauDocument,
  TableauDatasource,
  TableauWorksheet,
  TableauField,
  WorksheetShelf,
  WorksheetPane,
  ShelfField,
  DashboardZone,
} from '../types/tableau'

function ensureArray<T>(obj: T | T[] | undefined | null): T[] {
  if (obj === undefined || obj === null) return []
  return Array.isArray(obj) ? obj : [obj]
}

/**
 * Tableau が暗黙的に提供する組み込み疑似フィールド名。
 * パーサーの補完処理と未使用フィールド判定（usageAnalyzer）で共有する。
 */
export const BUILTIN_FIELD_NAMES = [
  'Measure Names',
  'Measure Values',
  'Latitude (generated)',
  'Longitude (generated)',
  'Multiple Values',
] as const

function stripBrackets(name: string | undefined): string {
  if (!name) return ''
  return name.replace(/[[\]]/g, '').trim()
}

/**
 * パース済みXMLノードを再帰的に走査し、param / fieldname 属性が参照する
 * フィールドIDを収集する。パラメータコントロール（zone の param 属性）や
 * 動的ゾーン表示（single-value-field-node の fieldname 属性）は
 * ワークシート依存関係に現れないため、この走査で拾う。
 */
function collectFieldRefs(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return
  Object.entries(node as Record<string, unknown>).forEach(([key, val]) => {
    if (
      (key === '@_param' || key === '@_fieldname') &&
      typeof val === 'string'
    ) {
      const id = normalizeFieldId(val)
      if (id) out.add(id)
    } else if (typeof val === 'object' && val !== null) {
      ensureArray(val).forEach((v) => collectFieldRefs(v, out))
    }
  })
}

/**
 * 統一されたフィールドID正規化ロジック
 */
export function normalizeFieldId(name: string | undefined): string {
  if (!name) return ''

  // 1. [Datasource].[Field] のような形式から最後のフィールド名部分だけを取り出す
  const parts = name.split('].[')
  const lastPart = parts[parts.length - 1]

  // 2. ブラケットの除去
  let n = lastPart.replace(/[[\]]/g, '').trim()

  // 3. プレフィックス (federated. 等) がまだ残っている場合の除去
  n = n.replace(
    /^(?:federated|sqlproxy|excel-direct|csv-direct|text-direct)\.[a-z0-9-.]+\./i,
    '',
  )

  // 4. 集計関数や型、ピルの複製インスタンス番号の除去
  const typeIds = ['nk', 'qk', 'ok', 'ok2', 'ni', 'oi', 'ni2']
  const aggFns = [
    'sum',
    'avg',
    'min',
    'max',
    'count',
    'cnt',
    'cntd',
    'ctd', // COUNTD の別表記
    'attr',
    'median',
    'med', // MEDIAN の別表記
    'stdev',
    'std', // STDEV の別表記
    'stdevp',
    'stdp', // STDEVP の別表記
    'var',
    'varp',
    'collect',
    'clct', // クラスタ分析（COLLECT）の別表記
    'running',
    'rank',
    'window',
    'win', // WINDOW_* テーブル計算の別表記
    'pct',
    'pcto', // 合計に対する割合（PERCENT_OF_TOTAL）
    'pcdf', // 差の割合（PERCENT_DIFFERENCE）
    'diff', // 差（DIFFERENCE）
    'cum', // 累計（RUNNING_SUM 等）
    'first',
    'last',
    'index',
    'size',
    'lookup',
    'script',
    'total',
    'usr',
    'agg',
    'none',
    'multiple',
    'calculation',
    'io', // セットの IN/OUT
    // 日付パーツ（YEAR/QUARTER/MONTH/WEEK/DAY/HOUR 等）
    'yr',
    'qr',
    'mn',
    'wk',
    'dy',
    'hr',
    'mi',
    'sc',
    'wd',
    'md',
    'my',
    'qtr',
    // 日付の切り捨て（TRUNC_YEAR/QUARTER/MONTH/WEEK/DAY/HOUR 等）
    'tyr',
    'tqr',
    'tmn',
    'twk',
    'tdy',
    'thr',
    'tmi',
    'tsc',
  ]

  const allParts = n.replace(/:/g, '.').split('.')
  const filteredParts = allParts.filter((p) => {
    const low = p.toLowerCase()
    // [:Measure Names] のようにロール部分が空のケースを除去
    if (low === '') return false
    // ピルを複数回ドラッグした際に付与される複製インスタンス番号（例: :4）を除去
    if (/^\d+$/.test(low)) return false
    return !aggFns.includes(low) && !typeIds.includes(low)
  })

  const result = filteredParts.join('.')

  // __tableau_internal_object_id__ は論理テーブルの名前空間であって
  // フィールドではないため、依存関係として扱わない（呼び出し側は空文字をスキップする）
  if (result === '__tableau_internal_object_id__') return ''

  return result
}

/**
 * XMLの実体参照（&quot; や &#13; など）をデコードする
 */
function decodeXmlString(str: string | undefined): string {
  if (!str) return ''
  let decoded = str.replace(/&amp;/g, '&')
  // 10進数参照
  decoded = decoded.replace(/&#(\d+);/g, (_: string, dec: string) => {
    const charCode = parseInt(dec, 10)
    return charCode === 13 ? '' : String.fromCharCode(charCode)
  })
  // 16進数参照
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => {
    const charCode = parseInt(hex, 16)
    return charCode === 13 ? '' : String.fromCharCode(charCode)
  })
  return decoded
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/**
 * <formatted-text><run>...</run></formatted-text> から先頭の可読テキストを取り出す。
 * run は文字列・オブジェクト（{'#text', '@_...'}）・配列いずれもあり得る。
 */
function extractZoneText(zone: Record<string, unknown>): string {
  const ft = zone['formatted-text'] as Record<string, unknown> | undefined
  if (!ft) return ''
  const runs = ensureArray(ft.run)
  for (const run of runs) {
    if (typeof run === 'string') {
      const t = decodeXmlString(run).trim()
      if (t) return t
    } else if (run && typeof run === 'object') {
      const text = (run as Record<string, unknown>)['#text']
      if (typeof text === 'string' || typeof text === 'number') {
        const t = decodeXmlString(String(text)).trim()
        if (t) return t
      }
    }
  }
  return ''
}

/**
 * zone の type 属性と name の有無から表示種別（kind）を判定する。
 * name があり type 属性が無い zone はワークシート参照。
 */
function classifyZone(
  rawType: string | undefined,
  hasName: boolean,
): DashboardZone['kind'] {
  if (!rawType) return hasName ? 'worksheet' : 'other'
  switch (rawType) {
    case 'worksheet':
      return 'worksheet'
    case 'text':
      return 'text'
    case 'paramctrl':
      return 'paramctrl'
    case 'bitmap':
      return 'image'
    case 'color':
    case 'size':
    case 'shape':
    case 'legend':
      return 'legend'
    case 'filter':
      return 'filter'
    default:
      return 'other'
  }
}

/**
 * ダッシュボードの <zones> を再帰的に走査し、座標を持つ leaf zone を
 * DashboardZone[] として収集する。純粋なレイアウトコンテナ（子 zone を持つ
 * 名前なしの入れ物）自体は描画対象にせず、子だけを拾う。
 */
function collectZoneLayout(zones: unknown, out: DashboardZone[]): void {
  ensureArray(zones).forEach((zNode: unknown) => {
    const z = zNode as Record<string, unknown>

    // 子 zone を先に再帰（zone または zones ラッパー）
    const childZone = z.zone
    const childWrapper = (z.zones as Record<string, unknown>)?.zone
    const hasChildren = childZone !== undefined || childWrapper !== undefined
    if (childZone !== undefined) collectZoneLayout(childZone, out)
    if (childWrapper !== undefined) collectZoneLayout(childWrapper, out)

    const rawType = z['@_type'] as string | undefined
    const name = z['@_name'] ? stripBrackets(z['@_name'] as string) : undefined

    // 座標が無い、または子を持つ純コンテナ（type/name なし）は描画対象外
    const hasCoords =
      z['@_x'] !== undefined &&
      z['@_y'] !== undefined &&
      z['@_w'] !== undefined &&
      z['@_h'] !== undefined
    if (!hasCoords) return
    if (hasChildren && !rawType && !name) return

    const kind = classifyZone(rawType, Boolean(name))
    const text = extractZoneText(z)
    const param = z['@_param']
      ? decodeXmlString(z['@_param'] as string)
      : undefined

    out.push({
      id: z['@_id'] !== undefined ? String(z['@_id']) : undefined,
      name,
      kind,
      rawType,
      x: Number(z['@_x']),
      y: Number(z['@_y']),
      w: Number(z['@_w']),
      h: Number(z['@_h']),
      title: text || name || undefined,
      param,
    })
  })
}

export function parseTableauXml(xmlText: string): TableauDocument {
  // XXE攻撃対策および解析エラー防止のため、DOCTYPE宣言を事前に除去する
  // eslint-disable-next-line security/detect-unsafe-regex
  const sanitizedXml = xmlText.replace(/<!DOCTYPE[^>]*?(\[[^\]]*?\])?>/gi, '')

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
    ignoreDeclaration: true,
  })
  const workbook = parser.parse(sanitizedXml).workbook as Record<
    string,
    unknown
  >

  // 1. データソース
  const datasources: TableauDatasource[] = ensureArray(
    workbook.datasources
      ? (workbook.datasources as Record<string, unknown>).datasource
      : [],
  ).map((dsNode: unknown) => {
    const ds = dsNode as Record<string, unknown>
    const dsName = stripBrackets(ds['@_name'] as string)
    // 1.1 <metadata-record> からの抽出 (物理的な出所を最優先で確保)
    const fieldMap = new Map<string, TableauField>()
    const connection = ds.connection as Record<string, unknown> | undefined
    const mds = connection?.['metadata-records']
      ? (connection['metadata-records'] as Record<string, unknown>)?.[
          'metadata-record'
        ]
      : undefined
    ensureArray(mds).forEach((recNode: unknown) => {
      const rec = recNode as Record<string, unknown>
      if (rec['@_class'] === 'column') {
        const localNameNode = (rec['local-name'] || rec['remote-name']) as
          | string
          | Record<string, unknown>
        const localName =
          typeof localNameNode === 'string'
            ? localNameNode
            : (localNameNode?.['#text'] as string)
        const parentNameNode = rec['parent-name'] as
          | string
          | Record<string, unknown>
          | undefined
        const parentNameRaw =
          typeof parentNameNode === 'string'
            ? parentNameNode
            : (parentNameNode?.['#text'] as string)
        const parentName = stripBrackets(parentNameRaw || '')
        const normId = normalizeFieldId(localName)
        fieldMap.set(normId, {
          column: normId,
          datasourceName: dsName,
          parentName: parentName || undefined,
          caption: decodeXmlString(localName || undefined),
          dataType:
            ((rec['local-type'] as Record<string, unknown> | undefined)?.[
              '#text'
            ] as string) || (rec['local-type'] as string),
          role: 'dimension',
          isCalc: false,
        })
      }
    })

    // 1.2 <column> からの抽出 (キャプションや計算式を上書きマージ)
    ensureArray(ds.column).forEach((colNode: unknown) => {
      const col = colNode as Record<string, unknown>
      const colName = normalizeFieldId(col['@_name'] as string)
      if (!colName) return

      const calc = ensureArray(col.calculation)?.[0] as
        | Record<string, unknown>
        | undefined
      const formula = (calc?.['@_formula'] || col['@_formula']) as
        | string
        | undefined
      const existing = fieldMap.get(colName)

      fieldMap.set(colName, {
        column: colName,
        datasourceName: dsName,
        parentName: existing?.parentName, // 物理テーブル名を保持
        caption: decodeXmlString(
          (col['@_caption'] as string) || existing?.caption,
        ),
        dataType: (col['@_datatype'] as string) || existing?.dataType,
        role:
          (col['@_role'] as string) ||
          (col['@_type'] as string) ||
          existing?.role,
        isCalc: !!formula,
        formula: formula ? decodeXmlString(formula) : existing?.formula,
        isContinuous:
          col['@_type'] === 'quantitative' || existing?.isContinuous,
        paramDomainType: col['@_param-domain-type'] as
          | 'list'
          | 'range'
          | 'any'
          | undefined,
        paramMembers:
          ensureArray((col.members as Record<string, unknown>)?.member).length >
          0
            ? ensureArray((col.members as Record<string, unknown>)?.member).map(
                (mNode: unknown) => {
                  const m = mNode as Record<string, unknown>
                  return {
                    value:
                      typeof m['@_value'] === 'string'
                        ? decodeXmlString(m['@_value'])
                        : (m['@_value'] as string | number),
                    alias: decodeXmlString(
                      (m['@_alias'] as string) || undefined,
                    ),
                  }
                },
              )
            : existing?.paramMembers,
        paramRange: col.range
          ? {
              min: decodeXmlString(
                ((col.range as Record<string, unknown>)?.['@_min'] as string) ||
                  undefined,
              ),
              max: decodeXmlString(
                ((col.range as Record<string, unknown>)?.['@_max'] as string) ||
                  undefined,
              ),
              step: decodeXmlString(
                ((col.range as Record<string, unknown>)?.[
                  '@_step'
                ] as string) || undefined,
              ),
            }
          : existing?.paramRange,
        value:
          typeof col['@_value'] === 'string'
            ? decodeXmlString(col['@_value'] as string)
            : (col['@_value'] as string | number),
      })
    })

    // 1.3 <group> からの抽出（グループフィールド／アクション用の自動生成フィールド）
    // <column> には現れないため、これがないとグループを参照するワークシートの
    // 依存関係が解決できず、系統図が途切れる原因になる
    ensureArray(ds.group).forEach((groupNode: unknown) => {
      const group = groupNode as Record<string, unknown>
      const groupName = normalizeFieldId(group['@_name'] as string)
      if (!groupName) return
      const existing = fieldMap.get(groupName)

      fieldMap.set(groupName, {
        column: groupName,
        datasourceName: dsName,
        parentName: existing?.parentName,
        caption: decodeXmlString(
          (group['@_caption'] as string) || existing?.caption,
        ),
        dataType: existing?.dataType,
        role: existing?.role || 'dimension',
        isCalc: existing?.isCalc || false,
        formula: existing?.formula,
      })
    })

    // 1.4 Tableau が暗黙的に提供する組み込み疑似フィールドを補完
    // （<column> として明示定義されないことが多く、未補完だと参照元の
    // 系統関係が解決できなくなる）
    BUILTIN_FIELD_NAMES.forEach((name) => {
      if (!fieldMap.has(name)) {
        fieldMap.set(name, {
          column: name,
          datasourceName: dsName,
          caption: name,
          role: 'dimension',
          isCalc: false,
        })
      }
    })

    const fields = Array.from(fieldMap.values())
    return {
      name: dsName,
      caption: decodeXmlString((ds['@_caption'] as string) || undefined),
      fields,
    }
  })

  // 2. ワークシート
  const worksheets: TableauWorksheet[] = ensureArray(
    workbook.worksheets
      ? (workbook.worksheets as Record<string, unknown>).worksheet
      : [],
  ).map((wsNode: unknown) => {
    const ws = wsNode as Record<string, unknown>
    const dependencies: string[] = []
    const localFields: TableauField[] = []
    const datasourceNamesSet = new Set<string>()

    const createShelfField = (
      rawName: string | undefined,
    ): ShelfField | null => {
      if (!rawName) return null
      const cleanName = normalizeFieldId(rawName)
      if (cleanName && !dependencies.includes(cleanName))
        dependencies.push(cleanName)
      return {
        name: rawName,
        isContinuous: rawName.includes(':qk'),
      }
    }

    const parseShelfList = (raw: unknown): ShelfField[] => {
      if (!raw) return []
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
      // [ds].[ns].[field] のような3セグメント以上の参照も1つのフィールドとして
      // マッチさせる（分断すると名前空間部分が幻の依存関係になる）
      // 各繰り返しはリテラル "].[" 区切りを要求し文字クラスが ] を除外するため
      // バックトラッキング爆発は発生しない
      // eslint-disable-next-line security/detect-unsafe-regex
      const matches = text.match(/\[[^\]]+\](?:\.\[[^\]]+\])*/g) || []
      return matches
        .map((m) => createShelfField(m))
        .filter((f): f is ShelfField => f !== null)
    }

    const parsePane = (pNode: unknown): WorksheetPane => {
      const p = pNode as Record<string, unknown>
      // encodings が子タグとしてある場合と、pane 直下にある場合の両方を考慮
      const enc = (p.encodings || p) as Record<string, unknown>

      const getEnc = (tags: string[]) => {
        const result: ShelfField[] = []
        // 動的なキーインデックスアクセスを避け、Object.entries でループする
        Object.entries(enc).forEach(([key, val]) => {
          if (tags.includes(key)) {
            ensureArray(val).forEach((eNode: unknown) => {
              const e = eNode as Record<string, unknown>
              const f = createShelfField(e?.['@_column'] as string)
              if (f) result.push(f)
            })
          }
        })
        return result
      }

      return {
        id: p['@_id'] as string,
        name: p['@_generated-title'] as string,
        // 軸名としてさらに多くの可能性をチェック
        yAxisName: (p['@_y-axis-name'] ||
          p['@_y-metadata'] ||
          p['@_name'] ||
          p['@_y-axis']) as string,
        xAxisName: (p['@_x-axis-name'] ||
          p['@_x-metadata'] ||
          p['@_x-axis']) as string,
        markType:
          ((p.mark as Record<string, unknown> | undefined)?.[
            '@_class'
          ] as string) || 'automatic',
        encodings: {
          color: getEnc(['color']),
          size: getEnc(['size']),
          // tooltip は独立したバケットなので label には含めない
          label: getEnc(['label', 'text']),
          detail: getEnc(['lod', 'detail']),
          tooltip: getEnc(['tooltip']),
          shape: getEnc(['shape']),
        },
      }
    }

    // 依存関係収集 (ws直下, ws.view, ws.table.view, ws.table.panes.pane など広範囲を探索)
    const tableNode = ws.table as Record<string, unknown> | undefined
    const sources = [ws, ws.view, tableNode?.view]
    if (tableNode?.panes && (tableNode.panes as Record<string, unknown>).pane) {
      ensureArray((tableNode.panes as Record<string, unknown>).pane).forEach(
        (p: unknown) => sources.push(p as Record<string, unknown>),
      )
    }

    sources.forEach((srcNode) => {
      const src = srcNode as Record<string, unknown>
      if (!src || !src['datasource-dependencies']) return
      ensureArray(src['datasource-dependencies']).forEach((ddNode: unknown) => {
        const dd = ddNode as Record<string, unknown>
        const dsName = stripBrackets(
          (dd['@_datasource'] || dd['@_name']) as string,
        )
        if (dsName) datasourceNamesSet.add(dsName)

        ensureArray(dd.column).forEach((colNode: unknown) => {
          const col = colNode as Record<string, unknown>
          const colName = normalizeFieldId(col['@_name'] as string)
          if (!colName) return
          if (!dependencies.includes(colName)) dependencies.push(colName)
          const calc = ensureArray(col.calculation)?.[0] as
            | Record<string, unknown>
            | undefined
          const formula = (calc?.['@_formula'] || col['@_formula']) as
            | string
            | undefined
          localFields.push({
            column: colName,
            datasourceName: dsName,
            caption: decodeXmlString((col['@_caption'] as string) || undefined),
            dataType: col['@_datatype'] as string,
            role: (col['@_role'] || col['@_type']) as string,
            isCalc: !!formula,
            formula: formula ? decodeXmlString(formula) : undefined,
            isContinuous: col['@_type'] === 'quantitative',
          })
        })
        ensureArray(dd['column-instance']).forEach((ciNode: unknown) => {
          const ci = ciNode as Record<string, unknown>
          const ciName = normalizeFieldId(ci['@_name'] as string)
          const calc = ensureArray(ci.calculation)?.[0] as
            | Record<string, unknown>
            | undefined
          const formula = (calc?.['@_formula'] || ci['@_formula']) as
            | string
            | undefined
          if (ciName) {
            if (!dependencies.includes(ciName)) dependencies.push(ciName)
            localFields.push({
              column: ciName,
              datasourceName: dsName,
              caption: decodeXmlString(
                (ci['@_caption'] as string) || undefined,
              ),
              dataType: ci['@_datatype'] as string,
              role: (ci['@_role'] || ci['@_type']) as string,
              class: stripBrackets(ci['@_column'] as string) || undefined,
              isCalc: !!formula,
              formula: formula ? decodeXmlString(formula) : undefined,
            })
          }
        })
      })
    })

    const table = (ws.table || {}) as Record<string, unknown>
    const tablePanes = table.panes as Record<string, unknown>
    const tableView = table.view as Record<string, unknown>
    const shelf: WorksheetShelf = {
      rows: parseShelfList(table.rows),
      cols: parseShelfList(table.cols),
      filters: ensureArray(tableView?.filter)
        .map((fNode) => {
          const f = fNode as Record<string, unknown>
          return createShelfField(f?.['@_column'] as string)
        })
        .filter((f): f is ShelfField => f !== null),
      panes: ensureArray(tablePanes?.pane).map(parsePane),
      marks: parsePane(ensureArray(tablePanes?.pane)[0] || {}),
    }

    return {
      name: stripBrackets(ws['@_name'] as string),
      caption: decodeXmlString((ws['@_caption'] as string) || undefined),
      dependencies,
      datasourceNames: Array.from(datasourceNamesSet),
      localFields,
      shelf,
    }
  })

  // 3. ダッシュボード
  const dashboards = ensureArray(
    workbook.dashboards
      ? (workbook.dashboards as Record<string, unknown>).dashboard
      : [],
  ).map((dbNode: unknown) => {
    const db = dbNode as Record<string, unknown>
    const wsNames = new Set<string>()
    const collect = (zones: unknown) => {
      ensureArray(zones).forEach((zNode: unknown) => {
        const z = zNode as Record<string, unknown>
        if (z['@_name']) wsNames.add(stripBrackets(z['@_name'] as string))
        // zone または zones タグの再帰
        if (z.zone) collect(z.zone)
        if (z.zones) {
          const zs = z.zones as Record<string, unknown>
          if (zs.zone) collect(zs.zone)
        }
      })
    }
    collect((db.zones as Record<string, unknown>)?.zone)

    // レイアウトマップ描画用に、座標付きの zone を収集する
    const zoneLayout: DashboardZone[] = []
    collectZoneLayout((db.zones as Record<string, unknown>)?.zone, zoneLayout)

    // ダッシュボードが直接参照するフィールド（パラメータコントロール等）の収集
    const usedFieldsSet = new Set<string>()
    collectFieldRefs(db, usedFieldsSet)

    return {
      name: stripBrackets(db['@_name'] as string),
      worksheets: Array.from(wsNames),
      usedFields: Array.from(usedFieldsSet),
      zones: zoneLayout,
    }
  })

  // 4. ワークブックレベルのフィールド参照
  //    （datagraph = 動的ゾーン表示のフィールド→ゾーンのグラフ定義）
  const workbookUsedFields = new Set<string>()
  if (workbook.datagraph) {
    collectFieldRefs(workbook.datagraph, workbookUsedFields)
  }

  return {
    datasources,
    worksheets,
    dashboards,
    usedFields: Array.from(workbookUsedFields),
  }
}
