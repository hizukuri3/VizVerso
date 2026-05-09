import { XMLParser } from 'fast-xml-parser'
import type {
  TableauDocument,
  TableauDatasource,
  TableauWorksheet,
  TableauField,
  WorksheetShelf,
  WorksheetPane,
  ShelfField,
} from '../types/tableau'

function ensureArray<T>(obj: T | T[] | undefined | null): T[] {
  if (obj === undefined || obj === null) return []
  return Array.isArray(obj) ? obj : [obj]
}

function stripBrackets(name: string | undefined): string {
  if (!name) return ''
  return name.replace(/[[\]]/g, '').trim()
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

  // 4. 集計関数や型の除去
  const typeIds = ['nk', 'qk', 'ok', 'ok2', 'ni', 'oi', 'ni2']
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
    'stdevp',
    'var',
    'varp',
    'collect',
    'running',
    'rank',
    'window',
    'pct',
    'total',
    'usr',
    'agg',
    'none',
    'multiple',
    'calculation',
  ]

  const allParts = n.replace(/:/g, '.').split('.')
  const filteredParts = allParts.filter((p) => {
    const low = p.toLowerCase()
    return !aggFns.includes(low) && !typeIds.includes(low)
  })

  return filteredParts.join('.')
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

export function parseTableauXml(xmlText: string): TableauDocument {
  // XXE攻撃対策および解析エラー防止のため、DOCTYPE宣言を事前に除去する
  const sanitizedXml = xmlText.replace(/<!DOCTYPE[^>]*(\[[^\]]*\])?>/gi, '')

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
                    value: m['@_value'] as string | number,
                    alias: decodeXmlString(
                      (m['@_alias'] as string) || undefined,
                    ),
                  }
                },
              )
            : existing?.paramMembers,
      })
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
        tags.forEach((tag) => {
          ensureArray(enc[tag]).forEach((eNode: unknown) => {
            const e = eNode as Record<string, unknown>
            const f = createShelfField(e?.['@_column'] as string)
            if (f) result.push(f)
          })
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
          label: getEnc(['label', 'text', 'tooltip']),
          detail: getEnc(['lod', 'detail']),
          tooltip: getEnc(['tooltip']),
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
    return {
      name: stripBrackets(db['@_name'] as string),
      worksheets: Array.from(wsNames),
    }
  })

  return { datasources, worksheets, dashboards }
}
