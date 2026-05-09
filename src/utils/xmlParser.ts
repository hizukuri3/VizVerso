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
  return name.replace(/[\[\]]/g, '').trim()
}

/**
 * 統一されたフィールドID正規化ロジック
 */
export function normalizeFieldId(name: string | undefined): string {
  if (!name) return ''
  
  // 1. [Datasource].[Field] のような形式から最後のフィールド名部分だけを取り出す
  const parts = name.split('].[');
  const lastPart = parts[parts.length - 1];
  
  // 2. ブラケットの除去
  let n = lastPart.replace(/[\[\]]/g, '').trim();
  
  // 3. プレフィックス (federated. 等) がまだ残っている場合の除去
  n = n.replace(/^(?:federated|sqlproxy|excel-direct|csv-direct|text-direct)\.[a-z0-9-.]+\./i, '');

  // 4. 集計関数や型の除去
  const typeIds = ['nk', 'qk', 'ok', 'ok2', 'ni', 'oi', 'ni2']
  const aggFns = [
    'sum', 'avg', 'min', 'max', 'count', 'cnt', 'cntd', 'attr', 
    'median', 'stdev', 'stdevp', 'var', 'varp', 'collect',
    'running', 'rank', 'window', 'pct', 'total', 'usr', 'agg',
    'none', 'multiple', 'calculation'
  ]

  const allParts = n.replace(/:/g, '.').split('.')
  const filteredParts = allParts.filter(p => {
    const low = p.toLowerCase()
    return !aggFns.includes(low) && !typeIds.includes(low)
  })
  
  return filteredParts.join('.')
}

function decodeTableauFormula(formula: string): string {
  if (!formula) return ''
  let decoded = formula.replace(/&amp;/g, '&')
  decoded = decoded.replace(/&#(\d+);/g, (_: string, dec: string) => {
    const charCode = parseInt(dec, 10)
    return charCode === 13 ? '' : String.fromCharCode(charCode)
  })
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
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  })
  const workbook = parser.parse(xmlText).workbook

  // 1. データソース
  const datasources: TableauDatasource[] = ensureArray(workbook.datasources?.datasource).map((ds: any) => {
    const fields: TableauField[] = []
    ensureArray(ds.column).forEach((col: any) => {
      const colName = normalizeFieldId(col['@_name'])
      if (!colName) return
      const calc = ensureArray(col.calculation)?.[0]
      const formula = calc?.['@_formula'] || col['@_formula']
      
      const paramDomainType = col['@_param-domain-type']
      const paramMembers = ensureArray(col.members?.member).map((m: any) => ({
        value: m['@_value'],
        alias: m['@_alias'] || undefined,
      }))
      const r = ensureArray(col.range)?.[0]
      const paramRange = r ? {
        min: r['@_min'],
        max: r['@_max'],
        step: r['@_step'],
      } : undefined

      fields.push({
        column: colName,
        caption: col['@_caption'] || undefined,
        dataType: col['@_datatype'],
        isCalc: !!formula,
        formula: formula ? decodeTableauFormula(formula) : undefined,
        isContinuous: col['@_type'] === 'quantitative',
        paramDomainType,
        paramMembers: paramMembers.length > 0 ? paramMembers : undefined,
        paramRange,
      })
    })
    return {
      name: stripBrackets(ds['@_name']),
      caption: ds['@_caption'] || undefined,
      fields,
    }
  })

  // 2. ワークシート
  const worksheets: TableauWorksheet[] = ensureArray(workbook.worksheets?.worksheet).map((ws: any) => {
    const dependencies: string[] = []
    const localFields: TableauField[] = []
    const datasourceNamesSet = new Set<string>()

    const createShelfField = (rawName: string | undefined): ShelfField | null => {
      if (!rawName) return null
      const cleanName = normalizeFieldId(rawName)
      if (cleanName && !dependencies.includes(cleanName)) dependencies.push(cleanName)
      return {
        name: rawName,
        isContinuous: rawName.includes(':qk'),
      }
    }

    const parseShelfList = (raw: any): ShelfField[] => {
      if (!raw) return []
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
      const matches = text.match(/\[[^\]]+\](?:\.\[[^\]]+\])*/g) || []
      return matches.map(m => createShelfField(m)).filter((f): f is ShelfField => f !== null)
    }

    const parsePane = (p: any): WorksheetPane => {
      // encodings が子タグとしてある場合と、pane 直下にある場合の両方を考慮
      const enc = p.encodings || p
      
      const getEnc = (tags: string[]) => {
        const result: ShelfField[] = []
        tags.forEach(tag => {
          ensureArray(enc[tag]).forEach(e => {
            const f = createShelfField(e?.['@_column'])
            if (f) result.push(f)
          })
        })
        return result
      }
      
      return {
        id: p['@_id'],
        name: p['@_generated-title'],
        // 軸名としてさらに多くの可能性をチェック
        yAxisName: p['@_y-axis-name'] || p['@_y-metadata'] || p['@_name'] || p['@_y-axis'],
        xAxisName: p['@_x-axis-name'] || p['@_x-metadata'] || p['@_x-axis'],
        markType: p.mark?.['@_class'] || 'automatic',
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
    const sources = [ws, ws.view, ws.table?.view]
    if (ws.table?.panes?.pane) {
      ensureArray(ws.table.panes.pane).forEach((p: any) => sources.push(p))
    }

    sources.forEach(src => {
      if (!src || !src['datasource-dependencies']) return
      ensureArray(src['datasource-dependencies']).forEach((dd: any) => {
        const dsName = stripBrackets(dd['@_name'])
        if (dsName) datasourceNamesSet.add(dsName)

        ensureArray(dd.column).forEach((col: any) => {
          const colName = normalizeFieldId(col['@_name'])
          if (!colName) return
          const calc = ensureArray(col.calculation)?.[0]
          const formula = calc?.['@_formula'] || col['@_formula']
          localFields.push({
            column: colName,
            caption: col['@_caption'] || undefined,
            dataType: col['@_datatype'],
            isCalc: !!formula,
            formula: formula ? decodeTableauFormula(formula) : undefined,
            isContinuous: col['@_type'] === 'quantitative',
          })
        })
        ensureArray(dd['column-instance']).forEach((ci: any) => {
          const ciName = normalizeFieldId(ci['@_name'])
          const calc = ensureArray(ci.calculation)?.[0]
          const formula = calc?.['@_formula'] || ci['@_formula']
          if (ciName) {
            localFields.push({
              column: ciName,
              caption: ci['@_caption'] || undefined,
              class: stripBrackets(ci['@_column']) || undefined,
              isCalc: !!formula,
              formula: formula ? decodeTableauFormula(formula) : undefined,
            })
          }
        })
      })
    })

    const table = ws.table || {}
    const shelf: WorksheetShelf = {
      rows: parseShelfList(table.rows),
      cols: parseShelfList(table.cols),
      filters: ensureArray(table.view?.filter).map(f => createShelfField(f?.['@_column'])).filter((f): f is ShelfField => f !== null),
      panes: ensureArray(table.panes?.pane).map(parsePane),
      marks: parsePane(ensureArray(table.panes?.pane)[0] || {}),
    }

    return {
      name: stripBrackets(ws['@_name']),
      caption: ws['@_caption'] || undefined,
      dependencies,
      datasourceNames: Array.from(datasourceNamesSet),
      localFields,
      shelf,
    }
  })

  // 3. ダッシュボード
  const dashboards = ensureArray(workbook.dashboards?.dashboard).map((db: any) => {
    const wsNames = new Set<string>()
    const collect = (zones: any) => {
      ensureArray(zones).forEach((z: any) => {
        if (z['@_name']) wsNames.add(stripBrackets(z['@_name']))
        if (z.zone) collect(z.zone)
      })
    }
    collect(db.zones?.zone)
    return { name: stripBrackets(db['@_name']), worksheets: Array.from(wsNames) }
  })

  return { datasources, worksheets, dashboards }
}
