import * as XLSX from 'xlsx'
import type { TableauDocument, TableauField } from '../types/tableau'
import { t, tMark } from './i18n'
import { normalizeFieldId } from './xmlParser'

// ────────────────────────────────────────────
// フィールド解決エンジン
// ────────────────────────────────────────────

interface ResolvedInfo {
  field: TableauField
  parentCaptions: string[]
  resolvedCaption: string
  resolvedDataType?: string
  resolvedFormula?: string
  isCalculated: boolean
  excelId: string
}

class ExcelFieldResolver {
  private fields = new Map<
    string,
    { field: TableauField; parentCaptions: Set<string>; excelId: string }
  >()
  private idCounter = 1

  constructor(doc: TableauDocument) {
    const dsMap = new Map(
      doc.datasources.map((ds) => [ds.name, ds.caption || ds.name]),
    )
    const PARAM_LABEL = t('detail.parameters')
    const DS_FALLBACK = ''

    const getNextId = () => `F${String(this.idCounter++).padStart(4, '0')}`

    // 1. 全フィールドの収集 (標準・グローバル・ローカル)
    doc.datasources.forEach((ds) => {
      const dsCaption =
        ds.name === 'Parameters' ? PARAM_LABEL : ds.caption || ds.name
      ds.fields.forEach((f) => {
        const id = normalizeFieldId(f.column)
        // 物理テーブル名 (parentName) は使用せず、一律でデータソース名を採用
        const sourceCaption = dsCaption

        if (!this.fields.has(id)) {
          this.fields.set(id, {
            field: f,
            parentCaptions: new Set([sourceCaption]),
            excelId: getNextId(),
          })
        } else {
          this.fields.get(id)!.parentCaptions.add(sourceCaption)
        }
      })
    })

    doc.worksheets.forEach((ws) => {
      ws.localFields?.forEach((f) => {
        const id = normalizeFieldId(f.column)
        const dsNameRaw = f.datasourceName || ''
        let caption = DS_FALLBACK
        if (dsNameRaw === 'Parameters') caption = PARAM_LABEL
        else if (dsNameRaw && dsNameRaw !== 'data-source')
          caption = dsMap.get(dsNameRaw) || dsNameRaw

        const sourceCaption = caption

        if (!this.fields.has(id)) {
          this.fields.set(id, {
            field: f,
            parentCaptions: new Set([sourceCaption]),
            excelId: getNextId(),
          })
        } else if (sourceCaption !== DS_FALLBACK) {
          this.fields.get(id)!.parentCaptions.add(sourceCaption)
        }
      })
    })

    // 2. 依存関係の解決 (計算フィールドの再評価)
    for (let i = 0; i < 5; i++) {
      this.fields.forEach((info) => {
        const f = info.field
        if (f.formula || f.class) {
          const newDeps = new Set<string>()
          let hasActualRef = false

          if (f.formula) {
            const crossMatches = f.formula.matchAll(
              /\[([^\]]+)\]\.\[([^\]]+)\]/g,
            )
            for (const match of crossMatches) {
              const dsPart = match[1]
              if (dsPart === 'Parameters' || dsPart === PARAM_LABEL) {
                newDeps.add(PARAM_LABEL)
              } else {
                const dsName =
                  dsMap.get(dsPart) ||
                  (Array.from(dsMap.values()).includes(dsPart) ? dsPart : null)
                if (dsName) newDeps.add(dsName)
              }
              hasActualRef = true
            }
            const simpleMatches = f.formula.matchAll(/\[([^\]]+)\]/g)
            for (const match of simpleMatches) {
              const refId = normalizeFieldId(match[1])
              const refInfo = this.fields.get(refId)
              if (refInfo && refId !== normalizeFieldId(f.column)) {
                refInfo.parentCaptions.forEach((c) => {
                  if (c !== DS_FALLBACK) newDeps.add(c)
                })
                hasActualRef = true
              }
            }
          }

          if (f.class) {
            const classId = normalizeFieldId(f.class)
            const classInfo = this.fields.get(classId)
            if (classInfo) {
              classInfo.parentCaptions.forEach((c) => {
                if (c !== DS_FALLBACK) newDeps.add(c)
              })
              hasActualRef = true
            }
          }

          if (hasActualRef) {
            info.parentCaptions.clear()
            newDeps.forEach((c) => info.parentCaptions.add(c))
            if (info.parentCaptions.size === 0)
              info.parentCaptions.add(DS_FALLBACK)
          } else if (f.formula) {
            info.parentCaptions.clear()
            info.parentCaptions.add(DS_FALLBACK)
          }
        }
      })
    }
  }

  public getFieldInfo(name: string): ResolvedInfo | null {
    const cleanId = normalizeFieldId(name)
    const info = this.fields.get(cleanId)
    if (!info) return null
    let current = info.field
    let caption = current.caption
    let dataType = current.dataType
    let formula = current.formula
    let depth = 0
    const visited = new Set<string>()
    visited.add(cleanId)
    while (depth < 5 && current.class) {
      const classId = normalizeFieldId(current.class)
      const next = this.fields.get(classId)
      if (next && !visited.has(classId)) {
        if (!caption) caption = next.field.caption
        if (!dataType) dataType = next.field.dataType
        if (!formula) formula = next.field.formula
        visited.add(classId)
        current = next.field
      } else break
      depth++
    }
    return {
      field: info.field,
      parentCaptions: Array.from(info.parentCaptions),
      resolvedCaption: caption || normalizeFieldId(info.field.column),
      resolvedDataType: dataType,
      resolvedFormula: formula,
      isCalculated: !!formula,
      excelId: info.excelId,
    }
  }

  public getAllResolvedFields(): ResolvedInfo[] {
    return Array.from(this.fields.keys())
      .map((name) => this.getFieldInfo(name)!)
      .sort((a, b) => a.excelId.localeCompare(b.excelId))
  }
}

function getDisplayFormula(
  formula: string | undefined,
  field: TableauField,
  resolver: ExcelFieldResolver,
): string {
  if (formula) {
    let result = formula.replace(
      /\[([^\]]+)\]\.\[([^\]]+)\]/g,
      (match, ds, f) => {
        const info = resolver.getFieldInfo(f)
        if (info) {
          let cap = info.resolvedCaption
          if (cap.startsWith('[') && cap.endsWith(']'))
            cap = cap.substring(1, cap.length - 1)
          return `[${ds}].[${cap}]`
        }
        return match
      },
    )
    result = result.replace(/\[([^\]]+)\]/g, (match, p1) => {
      const info = resolver.getFieldInfo(p1)
      if (info) {
        let cap = info.resolvedCaption
        if (cap.startsWith('[') && cap.endsWith(']'))
          cap = cap.substring(1, cap.length - 1)
        return `[${cap}]`
      }
      return match
    })
    return result
  }
  if (field.class) {
    const info = resolver.getFieldInfo(field.class)
    if (info) {
      let cap = info.resolvedCaption
      if (cap.startsWith('[') && cap.endsWith(']'))
        cap = cap.substring(1, cap.length - 1)
      return `[${cap}]`
    }
  }
  return ''
}

function getDisplayCaption(name: string, info: ResolvedInfo | null): string {
  if (!info) return normalizeFieldId(name)
  let caption = info.resolvedCaption
  if (caption.startsWith('[') && caption.endsWith(']'))
    caption = caption.substring(1, caption.length - 1)
  const fn = name.toLowerCase()
  const isSum = /\bsum:/i.test(fn)
  const isAvg = /\bavg:/i.test(fn)
  const isMin = /\bmin:/i.test(fn)
  const isMax = /\bmax:/i.test(fn)
  const isCount = /\bcnt:|\bcntd:/i.test(fn)
  const isAttr = /\battr:/i.test(fn)
  const isCollect =
    /\bcollect:|\bspatial:|\bagg:/i.test(fn) ||
    info.resolvedDataType === 'spatial'
  const isTableCalc =
    fn.includes('rank:') ||
    fn.includes('running:') ||
    fn.includes('window:') ||
    fn.includes('pct:') ||
    fn.includes('total:')
  let agg = ''
  if (isSum) agg = t('agg.sum')
  else if (isAvg) agg = t('agg.avg')
  else if (isMin) agg = t('agg.min')
  else if (isMax) agg = t('agg.max')
  else if (isCount) agg = t('agg.count')
  else if (isAttr) agg = t('agg.attr')
  else if (isCollect) agg = t('agg.collect')
  let result = agg ? `${agg}(${caption})` : caption
  if (isTableCalc) result = `${result} △`
  return result
}

function formatDatasource(captions: string[]): string {
  if (captions.length === 0) return ''
  const unique = Array.from(new Set(captions)).filter((c) => c !== '')
  return unique.sort().join(', ')
}

export function exportToExcel(
  doc: TableauDocument,
  workbookName: string = 'tableau_analysis',
) {
  const wb = XLSX.utils.book_new()
  const resolver = new ExcelFieldResolver(doc)
  const dashboardRows: (string | number)[][] = [
    [t('excel.col_dashboard_name'), t('excel.col_sheet_name')],
  ]
  doc.dashboards.forEach((db) =>
    db.worksheets.forEach((ws) => {
      const wsObj = doc.worksheets.find((w) => w.name === ws)
      dashboardRows.push([db.caption || db.name, wsObj?.caption || ws])
    }),
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(dashboardRows),
    t('excel.sheet_dashboard'),
  )
  const shelfRows: (string | number)[][] = [
    [
      t('excel.col_id'),
      t('excel.col_sheet_name'),
      t('excel.col_datasource'),
      t('excel.col_shelf'),
      t('excel.col_fieldname'),
    ],
  ]
  doc.worksheets.forEach((ws) => {
    const addShelf = (
      fields: import('../types/tableau').ShelfField[],
      type: string,
    ) =>
      fields.forEach((f) => {
        const info = resolver.getFieldInfo(f.name)
        shelfRows.push([
          info?.excelId || '',
          ws.caption || ws.name,
          formatDatasource(info?.parentCaptions || []),
          type,
          getDisplayCaption(f.name, info),
        ])
      })
    addShelf(ws.shelf?.cols || [], t('detail.columns'))
    addShelf(ws.shelf?.rows || [], t('detail.rows'))
    addShelf(ws.shelf?.filters || [], t('detail.filters'))
  })
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(shelfRows),
    t('excel.sheet_worksheet_shelf'),
  )
  const paramRows: (string | number)[][] = [
    [
      t('excel.col_id'),
      t('excel.col_param_name'),
      t('excel.col_param_type'),
      t('excel.col_param_domain'),
      t('excel.col_param_config'),
    ],
  ]
  resolver
    .getAllResolvedFields()
    .filter((f) => f.field.paramDomainType)
    .forEach((f) => {
      const config =
        f.field.paramDomainType === 'list'
          ? f.field.paramMembers?.map((m) => m.alias || m.value).join(', ') ||
            ''
          : f.field.paramDomainType === 'range'
            ? `${t('detail.min')}:${f.field.paramRange?.min} ${t('detail.max')}:${f.field.paramRange?.max}`
            : t('detail.all_values')
      paramRows.push([
        f.excelId,
        f.resolvedCaption,
        f.resolvedDataType || '',
        t(
          `detail.${f.field.paramDomainType || 'any'}` as import('./i18n').TKey,
        ),
        config,
      ])
    })
  if (paramRows.length > 1)
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(paramRows),
      t('excel.sheet_parameters'),
    )
  const fieldRows: (string | number)[][] = [
    [
      t('excel.col_id'),
      t('excel.col_datasource'),
      t('excel.col_fieldname'),
      t('excel.col_datatype'),
      t('excel.col_role'),
      t('excel.col_formula'),
    ],
  ]
  resolver.getAllResolvedFields().forEach((f) => {
    fieldRows.push([
      f.excelId,
      formatDatasource(f.parentCaptions),
      f.resolvedCaption,
      f.resolvedDataType || '',
      f.field.role || '',
      getDisplayFormula(f.resolvedFormula, f.field, resolver),
    ])
  })
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(fieldRows),
    t('excel.sheet_fields'),
  )
  const depRows: (string | number)[][] = [
    [
      t('excel.col_id'),
      t('excel.col_sheet_name'),
      t('excel.col_datasource'),
      t('excel.col_used_field' as import('./i18n').TKey),
    ],
  ]
  doc.worksheets.forEach((ws) =>
    ws.dependencies.forEach((dep) => {
      const info = resolver.getFieldInfo(dep)
      depRows.push([
        info?.excelId || '',
        ws.caption || ws.name,
        formatDatasource(info?.parentCaptions || []),
        getDisplayCaption(dep, info),
      ])
    }),
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(depRows),
    t('excel.sheet_dependencies'),
  )
  const colIdLabel = t('excel.col_id')
  const fDepRows: (string | number)[][] = [
    [
      t('excel.col_datasource'),
      t('excel.col_fieldname'),
      `${colIdLabel}(Target)`,
      `${colIdLabel}(Source)`,
      t('excel.col_referenced_field'),
    ],
  ]
  resolver.getAllResolvedFields().forEach((f) => {
    const formula =
      f.resolvedFormula || (f.field.class ? `[${f.field.class}]` : '')
    if (!formula) return
    const matches = formula.matchAll(/\[([^\]]+)\]/g)
    const seen = new Set<string>()
    for (const match of matches) {
      const refName = match[1]
      const refId = normalizeFieldId(refName)
      if (seen.has(refId)) continue
      seen.add(refId)
      const refInfo = resolver.getFieldInfo(refName)
      fDepRows.push([
        formatDatasource(f.parentCaptions),
        f.resolvedCaption,
        f.excelId,
        refInfo?.excelId || '',
        getDisplayCaption(refName, refInfo),
      ])
    }
  })
  if (fDepRows.length > 1)
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(fDepRows),
      t('excel.sheet_field_dependencies'),
    )
  doc.worksheets.forEach((ws) => {
    const rows: (string | number)[][] = [
      [
        t('excel.col_id'),
        t('excel.col_layer_axis'),
        t('excel.col_mark_type'),
        t('excel.col_datasource'),
        t('excel.col_role'),
        t('excel.col_agg'),
        t('excel.col_fieldname'),
      ],
    ]
    ws.shelf?.panes.forEach((pane, i) => {
      const layer = ws.shelf?.panes.some((p) => p.name?.includes('mp.'))
        ? pane.name || `Layer ${i + 1}`
        : `${t('detail.marks')} ${i + 1}`
      const mark = tMark(pane.markType)
      const add = (
        fields: import('../types/tableau').ShelfField[],
        role: string,
      ) =>
        fields.forEach((f) => {
          const info = resolver.getFieldInfo(f.name)
          let agg = t('agg.none')
          const fn = f.name.toLowerCase()
          if (fn.includes('sum:')) agg = t('agg.sum')
          else if (fn.includes('avg:')) agg = t('agg.avg')
          else if (fn.includes('min:')) agg = t('agg.min')
          else if (fn.includes('max:')) agg = t('agg.max')
          else if (fn.includes('cnt:')) agg = t('agg.count')
          else if (fn.includes('attr:')) agg = t('agg.attr')
          else if (
            fn.includes('collect:') ||
            info?.resolvedDataType === 'spatial'
          )
            agg = t('agg.collect')
          rows.push([
            info?.excelId || '',
            layer,
            mark,
            formatDatasource(info?.parentCaptions || []),
            role,
            agg,
            getDisplayCaption(f.name, info),
          ])
        })
      add(pane.encodings.color, t('detail.color'))
      add(pane.encodings.size, t('detail.size'))
      add(pane.encodings.label, t('detail.label'))
      add(pane.encodings.detail, t('detail.detail'))
      add(pane.encodings.tooltip, t('detail.tooltip'))
    })
    if (rows.length > 1)
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(rows),
        (ws.caption || ws.name).slice(0, 31),
      )
  })
  XLSX.writeFile(wb, `${workbookName}${t('excel.suffix_analysis_result')}.xlsx`)
}
