import ExcelJS from 'exceljs'
import type {
  TableauDocument,
  TableauField,
  DashboardZone,
} from '../types/tableau'
import { t, tMark, type TKey } from './i18n'
import { normalizeFieldId } from './xmlParser'
import { analyzeFieldUsage } from './usageAnalyzer'
import { getWorksheetMarkKind } from './markVisual'
import { classifyFormula } from './calcClassifier'

// 計算種別 → i18n キー
const CALC_TYPE_KEY = {
  lod: 'calctype.lod',
  tableCalc: 'calctype.table_calc',
  regular: 'calctype.regular',
} as const

// zone.kind → i18n キー（種別ラベル）
const ZONE_KIND_KEY: Record<DashboardZone['kind'], TKey> = {
  worksheet: 'detail.zone_worksheet',
  text: 'detail.zone_text',
  paramctrl: 'detail.zone_paramctrl',
  image: 'detail.zone_image',
  legend: 'detail.zone_legend',
  filter: 'detail.zone_filter',
  other: 'detail.zone_other',
}

// Tableau のリテラル値（"East" や #2016-01-01#）から囲み文字を除く
const cleanParamValue = (v?: string | number) =>
  v === undefined || v === null ? '' : String(v).replace(/^["#]+|["#]+$/g, '')

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

// ────────────────────────────────────────────
// スタイル定義（人間が読みやすい配色）
// ────────────────────────────────────────────
const THEME = {
  headerText: 'FFFFFFFF',
  zebra: 'FFF6F8FA', // 偶数行のうっすらグレー
  border: 'FFE2E8F0',
}
// 淡色（セルの塗り分け用。濃い文字が読める明度）
const TINT = {
  emerald: 'FFD1FAE5',
  blue: 'FFDBEAFE',
  indigo: 'FFE0E7FF',
  amber: 'FFFEF3C7',
  violet: 'FFF3E8FF',
  sky: 'FFE0F2FE',
  slate: 'FFF1F5F9',
  rose: 'FFFFE4E6',
  yellow: 'FFFEF9C3',
}

type FillRules = Record<
  number,
  (val: string | number, row: (string | number)[]) => string | undefined
>

interface SheetSpec {
  name: string
  accent: string // ヘッダー背景 ARGB
  aoa: (string | number)[][] // [0] はヘッダー
  fillRules?: FillRules // 列インデックス(0始まり) → 塗り色 ARGB
}

const thinBorder = () => {
  const s = { style: 'thin' as const, color: { argb: THEME.border } }
  return { top: s, left: s, bottom: s, right: s }
}

// Excel のシート名に使えない文字を除去し、31文字・一意に整える
function safeSheetName(base: string, used: Set<string>): string {
  const name =
    base
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet'
  let candidate = name
  let n = 2
  while (used.has(candidate)) {
    const suffix = ` (${n++})`
    candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`
  }
  used.add(candidate)
  return candidate
}

function renderSheet(
  wb: ExcelJS.Workbook,
  spec: SheetSpec,
  usedNames: Set<string>,
) {
  const ws = wb.addWorksheet(safeSheetName(spec.name, usedNames), {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const header = spec.aoa[0].map((h) => String(h))
  const body = spec.aoa.slice(1)

  // 列幅は内容の最大文字数から自動算出（全角も考慮して少し広め）
  ws.columns = header.map((h, ci) => {
    const contentMax = body.reduce(
      (m, r) => Math.max(m, String(r[ci] ?? '').length),
      h.length,
    )
    return { width: Math.min(Math.max(contentMax + 2, 10), 70) }
  })

  // ヘッダー行
  const headerRow = ws.addRow(header)
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: spec.accent },
    }
    cell.font = { bold: true, color: { argb: THEME.headerText }, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = thinBorder()
  })

  // データ行（ゼブラ＋条件付き塗り分け）
  body.forEach((r, ri) => {
    const row = ws.addRow(r)
    row.alignment = { vertical: 'top' }
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = thinBorder()
      let fill: string | undefined = ri % 2 === 1 ? THEME.zebra : undefined
      const rule = spec.fillRules?.[colNumber - 1]
      const custom = rule?.(r[colNumber - 1] ?? '', r)
      if (custom) fill = custom
      if (fill) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fill },
        }
      }
    })
  })

  // オートフィルター
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: header.length },
  }
}

// ブラウザでダウンロードさせる（diff レポート出力からも再利用）
export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 解析結果を装飾済み ExcelJS ワークブックとして構築する。
 * （ダウンロードは exportToExcel、テストはこの関数を直接利用する）
 */
export function buildExcelWorkbook(doc: TableauDocument): ExcelJS.Workbook {
  const sheetSpecs: SheetSpec[] = []
  const pushSheet = (
    name: string,
    accent: string,
    aoa: (string | number)[][],
    fillRules?: FillRules,
  ) => {
    if (aoa.length > 1) sheetSpecs.push({ name, accent, aoa, fillRules })
  }
  // ヘッダー用アクセント色
  const ACCENT = {
    blue: 'FF2563EB',
    indigo: 'FF4F46E5',
    rose: 'FFE11D48',
    purple: 'FF7C3AED',
    emerald: 'FF059669',
    amber: 'FFD97706',
    cyan: 'FF0891B2',
    slate: 'FF475569',
  }
  const resolver = new ExcelFieldResolver(doc)

  // ── 塗り分け用のラベル→色マップ（現在の言語で解決）──
  const zoneKindTint = new Map<string, string>([
    [t('detail.zone_worksheet'), TINT.emerald],
    [t('detail.zone_text'), TINT.slate],
    [t('detail.zone_paramctrl'), TINT.amber],
    [t('detail.zone_image'), TINT.violet],
    [t('detail.zone_legend'), TINT.sky],
    [t('detail.zone_filter'), TINT.sky],
    [t('detail.zone_other'), TINT.slate],
  ])
  const shelfTint = new Map<string, string>([
    [t('detail.columns'), TINT.blue],
    [t('detail.rows'), TINT.indigo],
    [t('detail.filters'), TINT.amber],
  ])
  const calcTint = new Map<string, string>([
    [t('calctype.lod'), TINT.violet],
    [t('calctype.table_calc'), TINT.indigo],
    [t('calctype.regular'), TINT.slate],
  ])
  const roleTint = (v: string | number) => {
    const s = String(v).toLowerCase()
    if (s === 'measure') return TINT.emerald
    if (s === 'dimension') return TINT.blue
    return undefined
  }
  const usageTint = (v: string | number) =>
    v === t('usage.unused_badge')
      ? TINT.amber
      : v === t('usage.used_label')
        ? TINT.emerald
        : undefined

  const dashboardRows: (string | number)[][] = [
    [t('excel.col_dashboard_name'), t('excel.col_sheet_name')],
  ]
  doc.dashboards.forEach((db) =>
    db.worksheets.forEach((ws) => {
      const wsObj = doc.worksheets.find((w) => w.name === ws)
      dashboardRows.push([db.caption || db.name, wsObj?.caption || ws])
    }),
  )
  pushSheet(t('excel.sheet_dashboard'), ACCENT.blue, dashboardRows)

  // ダッシュボード オブジェクト（レイアウト）: zone ごとの配置・種別・内容
  const paramFieldById = new Map<string, TableauField>()
  doc.datasources.forEach((ds) =>
    ds.fields.forEach((f) => {
      if (f.paramDomainType) paramFieldById.set(normalizeFieldId(f.column), f)
    }),
  )
  const objectRows: (string | number)[][] = [
    [
      t('excel.col_dashboard_name'),
      t('excel.col_object_type'),
      t('excel.col_object_name'),
      t('excel.col_mark_type'),
      t('excel.col_object_content'),
      t('excel.col_x'),
      t('excel.col_y'),
      t('excel.col_width'),
      t('excel.col_height'),
    ],
  ]
  // zone 座標は twbx 上 0-100000 の正規化値。ダッシュボードの実サイズ (px) が
  // 分かる場合は実ピクセルへ換算する（例: w=100000 → dashboard 幅 1300px）。
  // サイズ不明時は正規化値のまま出力する。
  const NORM = 100000
  const toPx = (v: number, size?: number) =>
    size ? Math.round((v / NORM) * size) : v
  doc.dashboards.forEach((db) => {
    ;(db.zones || []).forEach((z) => {
      let markType = ''
      let content = ''
      let objectName = z.title || z.name || ''
      if (z.kind === 'worksheet' && z.name) {
        const ws = doc.worksheets.find((w) => w.name === z.name)
        objectName = ws?.caption || z.name
        if (ws) markType = tMark(getWorksheetMarkKind(ws))
      } else if (z.kind === 'paramctrl' && z.param) {
        const pf = paramFieldById.get(normalizeFieldId(z.param))
        content = cleanParamValue(pf?.value)
        if (pf?.caption) objectName = z.title || pf.caption
      } else if (z.kind === 'text') {
        content = z.title || ''
      } else if (z.kind === 'image') {
        content = z.param || ''
      }
      objectRows.push([
        db.caption || db.name,
        t(ZONE_KIND_KEY[z.kind]),
        objectName,
        markType,
        content,
        toPx(z.x, db.width),
        toPx(z.y, db.height),
        toPx(z.w, db.width),
        toPx(z.h, db.height),
      ])
    })
  })
  pushSheet(t('excel.sheet_dashboard_objects'), ACCENT.indigo, objectRows, {
    1: (v) => zoneKindTint.get(String(v)),
  })

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
  pushSheet(t('excel.sheet_worksheet_shelf'), ACCENT.rose, shelfRows, {
    3: (v) => shelfTint.get(String(v)),
  })
  const paramRows: (string | number)[][] = [
    [
      t('excel.col_id'),
      t('excel.col_param_name'),
      t('excel.col_param_type'),
      t('excel.col_current_value'),
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
        cleanParamValue(f.field.value),
        t(
          `detail.${f.field.paramDomainType || 'any'}` as import('./i18n').TKey,
        ),
        config,
      ])
    })
  pushSheet(t('excel.sheet_parameters'), ACCENT.purple, paramRows, {
    3: (v) => (String(v) ? TINT.yellow : undefined), // 現在値をハイライト
  })
  // 未使用フィールドの判定（フィールド一覧の「使用状況」列に出力）
  const fieldUsage = analyzeFieldUsage(doc)
  const usageLabel = (column: string) => {
    const usage = fieldUsage.usage.get(normalizeFieldId(column))
    if (!usage) return ''
    return usage.used ? t('usage.used_label') : t('usage.unused_badge')
  }

  const fieldRows: (string | number)[][] = [
    [
      t('excel.col_id'),
      t('excel.col_datasource'),
      t('excel.col_fieldname'),
      t('excel.col_datatype'),
      t('excel.col_role'),
      t('excel.col_calc_type'),
      t('excel.col_usage'),
      t('excel.col_formula'),
    ],
  ]
  resolver.getAllResolvedFields().forEach((f) => {
    const calcType =
      f.isCalculated && f.resolvedFormula
        ? t(CALC_TYPE_KEY[classifyFormula(f.resolvedFormula) ?? 'regular'])
        : ''
    fieldRows.push([
      f.excelId,
      formatDatasource(f.parentCaptions),
      f.resolvedCaption,
      f.resolvedDataType || '',
      f.field.role || '',
      calcType,
      usageLabel(f.field.column),
      getDisplayFormula(f.resolvedFormula, f.field, resolver),
    ])
  })
  pushSheet(t('excel.sheet_fields'), ACCENT.emerald, fieldRows, {
    4: (v) => roleTint(v), // ロール
    5: (v) => calcTint.get(String(v)), // 計算種別
    6: (v) => usageTint(v), // 使用状況
  })
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
  pushSheet(t('excel.sheet_dependencies'), ACCENT.amber, depRows)
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
  pushSheet(t('excel.sheet_field_dependencies'), ACCENT.cyan, fDepRows)
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
      add(pane.encodings.shape, t('detail.shape'))
      add(pane.encodings.label, t('detail.label'))
      add(pane.encodings.detail, t('detail.detail'))
      add(pane.encodings.tooltip, t('detail.tooltip'))
    })
    pushSheet(ws.caption || ws.name, ACCENT.slate, rows)
  })

  // すべての SheetSpec を装飾しながらワークブック化
  const wb = new ExcelJS.Workbook()
  wb.creator = 'VizVerso'
  wb.created = new Date()
  const usedNames = new Set<string>()
  // 先頭に「使い方」シートを追加
  buildGuideSheet(wb, sheetSpecs, usedNames)
  sheetSpecs.forEach((spec) => renderSheet(wb, spec, usedNames))
  return wb
}

// ────────────────────────────────────────────
// 「使い方 / 凡例」シート（先頭に配置）
// ────────────────────────────────────────────
function buildGuideSheet(
  wb: ExcelJS.Workbook,
  specs: SheetSpec[],
  usedNames: Set<string>,
) {
  const ws = wb.addWorksheet(safeSheetName(t('excel.guide.tab'), usedNames))
  ws.columns = [{ width: 40 }, { width: 96 }]
  ws.getColumn(2).alignment = { wrapText: true, vertical: 'top' }

  const setFill = (cell: ExcelJS.Cell, argb: string) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  }

  // タイトル
  ws.mergeCells('A1:B1')
  const title = ws.getCell('A1')
  title.value = t('excel.guide.title')
  title.font = { bold: true, size: 16, color: { argb: 'FF0F172A' } }
  ws.getRow(1).height = 28

  // イントロ
  ws.mergeCells('A2:B2')
  const intro = ws.getCell('A2')
  intro.value = t('excel.guide.intro')
  intro.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(2).height = 48

  let r = 4
  const sectionHeader = (label: string) => {
    ws.mergeCells(`A${r}:B${r}`)
    const c = ws.getCell(`A${r}`)
    c.value = label
    c.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    setFill(c, 'FF334155')
    ws.getCell(`B${r}`).fill = c.fill
    ws.getRow(r).height = 20
    r++
  }
  const kvRow = (
    a: string | number,
    b: string,
    opts?: { fillA?: string; bold?: boolean },
  ) => {
    const ca = ws.getCell(`A${r}`)
    const cb = ws.getCell(`B${r}`)
    ca.value = a
    cb.value = b
    ca.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }
    cb.alignment = { vertical: 'top', wrapText: true }
    if (opts?.bold) ca.font = { bold: true }
    if (opts?.fillA) setFill(ca, opts.fillA)
    r++
  }

  // シート一覧
  sectionHeader(t('excel.guide.sheets_heading'))
  kvRow(t('excel.guide.col_sheet'), t('excel.guide.col_desc'), { bold: true })
  const descByName = new Map<string, string>([
    [t('excel.sheet_dashboard'), t('excel.guide.desc_dashboard')],
    [t('excel.sheet_dashboard_objects'), t('excel.guide.desc_objects')],
    [t('excel.sheet_worksheet_shelf'), t('excel.guide.desc_shelf')],
    [t('excel.sheet_parameters'), t('excel.guide.desc_parameters')],
    [t('excel.sheet_fields'), t('excel.guide.desc_fields')],
    [t('excel.sheet_dependencies'), t('excel.guide.desc_dependencies')],
    [
      t('excel.sheet_field_dependencies'),
      t('excel.guide.desc_field_dependencies'),
    ],
  ])
  let hasWorksheetSheets = false
  specs.forEach((s) => {
    const desc = descByName.get(s.name)
    if (desc) kvRow(s.name, desc)
    else hasWorksheetSheets = true
  })
  if (hasWorksheetSheets)
    kvRow(`(${t('nav.sheets')} …)`, t('excel.guide.desc_worksheet'))
  r++

  // 共通の見方
  sectionHeader(t('excel.guide.tips_heading'))
  ;[
    t('excel.guide.tip_id'),
    t('excel.guide.tip_coords'),
    t('excel.guide.tip_filter'),
  ].forEach((tip) => {
    ws.mergeCells(`A${r}:B${r}`)
    const c = ws.getCell(`A${r}`)
    c.value = `・ ${tip}`
    c.alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(r).height = 30
    r++
  })
  r++

  // 色の凡例
  sectionHeader(t('excel.guide.colors_heading'))
  kvRow(t('excel.guide.col_color'), t('excel.guide.col_meaning'), {
    bold: true,
  })
  const legend: [string, string][] = [
    [TINT.amber, t('excel.guide.legend_unused')],
    [TINT.emerald, t('excel.guide.legend_measure')],
    [TINT.blue, t('excel.guide.legend_dimension')],
    [TINT.violet, t('excel.guide.legend_lod')],
    [TINT.yellow, t('excel.guide.legend_current')],
  ]
  legend.forEach(([argb, meaning]) => kvRow('', meaning, { fillA: argb }))
}

export async function exportToExcel(
  doc: TableauDocument,
  workbookName: string = 'tableau_analysis',
) {
  const wb = buildExcelWorkbook(doc)
  await downloadWorkbook(
    wb,
    `${workbookName}${t('excel.suffix_analysis_result')}.xlsx`,
  )
}
