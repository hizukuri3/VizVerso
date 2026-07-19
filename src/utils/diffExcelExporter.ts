import ExcelJS from 'exceljs'
import { downloadWorkbook } from './excelExporter'
import { t, type TKey } from './i18n'
import type { DiffCategory, LogicalField, WorkbookDiff } from './workbookDiff'
import type {
  TableauDashboard,
  TableauDatasource,
  TableauField,
  TableauWorksheet,
} from '../types/tableau'

/**
 * ワークブック比較（diff）結果を装飾済み Excel ワークブックとして出力する。
 * サマリーシート（メタ情報 + カテゴリ別集計）と、カテゴリ別の詳細シート4枚で構成する。
 * スタイリングは excelExporter.ts の配色・装飾パターンに倣う。
 */

// ────────────────────────────────────────────
// スタイル定義（excelExporter.ts と同系）
// ────────────────────────────────────────────
const THEME = {
  headerText: 'FFFFFFFF',
  border: 'FFE2E8F0',
  metaLabel: 'FF334155',
}
// 状態別の淡色（濃い文字が読める明度。excelExporter.ts の TINT と同系色）
const STATE_TINT = {
  added: 'FFD1FAE5', // 追加 = 薄緑
  removed: 'FFFFE4E6', // 削除 = 薄赤
  changed: 'FFFEF9C3', // 変更 = 薄黄
}
// ヘッダー背景アクセント色（サマリー / カテゴリ別）
const ACCENT = {
  summary: 'FF334155', // slate
  datasources: 'FF2563EB', // blue
  fields: 'FF059669', // emerald
  worksheets: 'FFE11D48', // rose
  dashboards: 'FF7C3AED', // purple
}

type CategoryKey = 'datasources' | 'fields' | 'worksheets' | 'dashboards'

// カテゴリ別シート1行分（状態 / 名前 / プロパティ / 変更前 / 変更後）
type DetailRow = [string, string, string, string, string]

const thinBorder = () => {
  const s = { style: 'thin' as const, color: { argb: THEME.border } }
  return { top: s, left: s, bottom: s, right: s }
}

const setFill = (cell: ExcelJS.Cell, argb: string) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

// Excel のシート名に使えない文字を除去し、31文字・一意に整える（excelExporter.ts と同ロジック）
function safeSheetName(base: string, used: Set<string>): string {
  const name =
    base
      // 文字クラスはリテラル正規表現のため security/detect-non-literal-regexp の対象外
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

// ────────────────────────────────────────────
// 表示名の導出（DiffView.tsx と同じルール）
// ────────────────────────────────────────────

/** 前後のブラケットを外した表示名にする。 */
function stripBrackets(value?: string): string {
  if (!value) return ''
  // 先頭 '[' と末尾 ']' のみを除去（リテラル正規表現）
  return value.replace(/^\[/, '').replace(/\]$/, '')
}

/** フィールドの表示名（caption 優先、なければ物理名）。 */
function fieldDisplayName(f: TableauField): string {
  return stripBrackets(f.caption) || stripBrackets(f.column)
}

function labelOfDatasource(ds: TableauDatasource): string {
  return stripBrackets(ds.caption) || ds.name
}
function labelOfWorksheet(ws: TableauWorksheet): string {
  return stripBrackets(ws.caption) || ws.name
}
function labelOfDashboard(db: TableauDashboard): string {
  return db.name
}

// ────────────────────────────────────────────
// カテゴリ別の行データ構築
// ────────────────────────────────────────────

/**
 * 1カテゴリ分の diff を「状態 / 名前 / プロパティ / 変更前 / 変更後」の行列に変換する。
 * - added/removed は1エンティティ1行（プロパティ・前後は空）。
 * - changed は PropertyChange 1件につき1行（before/after は生値、undefined は ''）。
 */
function buildCategoryRows<T>(
  cat: DiffCategory<T>,
  labelOf: (entity: T) => string,
): DetailRow[] {
  const rows: DetailRow[] = []
  const added = t('diff.summary_added')
  const removed = t('diff.summary_removed')
  const changed = t('diff.summary_changed')

  for (const entity of cat.added) {
    rows.push([added, labelOf(entity), '', '', ''])
  }
  for (const entity of cat.removed) {
    rows.push([removed, labelOf(entity), '', '', ''])
  }
  for (const entry of cat.changed) {
    const name = labelOf(entry.after)
    for (const change of entry.changes) {
      rows.push([
        changed,
        name,
        t(`diff.prop.${change.property}` as TKey),
        change.before ?? '',
        change.after ?? '',
      ])
    }
  }
  return rows
}

// ────────────────────────────────────────────
// シート描画
// ────────────────────────────────────────────

/** サマリーシート（メタ情報 + カテゴリ別集計表）。 */
function renderSummarySheet(
  wb: ExcelJS.Workbook,
  diff: WorkbookDiff,
  beforeName: string,
  afterName: string,
  used: Set<string>,
) {
  const ws = wb.addWorksheet(safeSheetName(t('diff.excel.sheet_summary'), used))
  ws.columns = [
    { width: 22 },
    { width: 24 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ]

  // メタ情報（ラベルを太字で強調）
  const meta: [string, string][] = [
    [t('diff.excel.meta_before_file'), beforeName],
    [t('diff.excel.meta_after_file'), afterName],
    [t('diff.excel.meta_generated'), new Date().toLocaleString()],
  ]
  meta.forEach(([label, value]) => {
    const row = ws.addRow([label, value])
    row.getCell(1).font = { bold: true, color: { argb: THEME.metaLabel } }
  })

  ws.addRow([]) // メタ情報と集計表の間の余白

  // カテゴリ別集計表のヘッダー
  const header = ws.addRow([
    t('diff.excel.col_category'),
    t('diff.summary_added'),
    t('diff.summary_removed'),
    t('diff.summary_changed'),
    t('diff.excel.col_unchanged'),
  ])
  header.height = 22
  header.eachCell((cell) => {
    setFill(cell, ACCENT.summary)
    cell.font = { bold: true, color: { argb: THEME.headerText }, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = thinBorder()
  })

  // カテゴリ行（4カテゴリ）
  const cats: { key: CategoryKey; cat: DiffCategory<unknown> }[] = [
    { key: 'datasources', cat: diff.datasources },
    { key: 'fields', cat: diff.fields },
    { key: 'worksheets', cat: diff.worksheets },
    { key: 'dashboards', cat: diff.dashboards },
  ]
  cats.forEach(({ key, cat }) => {
    const row = ws.addRow([
      t(`diff.category.${key}` as TKey),
      cat.added.length,
      cat.removed.length,
      cat.changed.length,
      cat.unchangedCount,
    ])
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder()
    })
  })
}

/** カテゴリ別詳細シート（状態で行を色分け）。 */
function renderCategorySheet(
  wb: ExcelJS.Workbook,
  name: string,
  accent: string,
  rows: DetailRow[],
  used: Set<string>,
) {
  const ws = wb.addWorksheet(safeSheetName(name, used), {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const header = [
    t('diff.excel.col_state'),
    t('diff.excel.col_name'),
    t('diff.excel.col_property'),
    t('diff.excel.col_before'),
    t('diff.excel.col_after'),
  ]

  // 列幅は内容の最大文字数から自動算出（excelExporter.ts と同様）
  ws.columns = header.map((h, ci) => {
    // ci は header（固定長5）の添字であり DetailRow の範囲内なので安全
    // eslint-disable-next-line security/detect-object-injection
    const readCell = (r: DetailRow) => String(r[ci] ?? '')
    const contentMax = rows.reduce(
      (m, r) => Math.max(m, readCell(r).length),
      h.length,
    )
    return { width: Math.min(Math.max(contentMax + 2, 10), 70) }
  })

  // ヘッダー行
  const headerRow = ws.addRow(header)
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    setFill(cell, accent)
    cell.font = { bold: true, color: { argb: THEME.headerText }, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = thinBorder()
  })

  // 状態ラベル → 行の塗り色
  const stateTint = new Map<string, string>([
    [t('diff.summary_added'), STATE_TINT.added],
    [t('diff.summary_removed'), STATE_TINT.removed],
    [t('diff.summary_changed'), STATE_TINT.changed],
  ])

  // データ行（状態別に行全体を塗り分け）
  rows.forEach((r) => {
    const row = ws.addRow(r)
    row.alignment = { vertical: 'top' }
    const fill = stateTint.get(r[0])
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder()
      if (fill) setFill(cell, fill)
    })
  })

  // オートフィルター
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: header.length },
  }
}

// ────────────────────────────────────────────
// エントリポイント
// ────────────────────────────────────────────

/**
 * diff 結果を装飾済み ExcelJS ワークブックとして構築する。
 * （ダウンロードは exportDiffToExcel、テストはこの関数を直接利用する）
 */
export function buildDiffExcelWorkbook(
  diff: WorkbookDiff,
  beforeName: string,
  afterName: string,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'VizVerso'
  wb.created = new Date()
  const used = new Set<string>()

  renderSummarySheet(wb, diff, beforeName, afterName, used)
  renderCategorySheet(
    wb,
    t('diff.category.datasources'),
    ACCENT.datasources,
    buildCategoryRows(diff.datasources, labelOfDatasource),
    used,
  )
  renderCategorySheet(
    wb,
    t('diff.category.fields'),
    ACCENT.fields,
    buildCategoryRows(diff.fields, (lf: LogicalField) =>
      fieldDisplayName(lf.field),
    ),
    used,
  )
  renderCategorySheet(
    wb,
    t('diff.category.worksheets'),
    ACCENT.worksheets,
    buildCategoryRows(diff.worksheets, labelOfWorksheet),
    used,
  )
  renderCategorySheet(
    wb,
    t('diff.category.dashboards'),
    ACCENT.dashboards,
    buildCategoryRows(diff.dashboards, labelOfDashboard),
    used,
  )
  return wb
}

/**
 * diff 結果を Excel ファイルとしてブラウザにダウンロードさせる。
 * ファイル名は `${beforeName}_vs_${afterName}${suffix}.xlsx`。
 */
export async function exportDiffToExcel(
  diff: WorkbookDiff,
  beforeName: string,
  afterName: string,
) {
  const wb = buildDiffExcelWorkbook(diff, beforeName, afterName)
  await downloadWorkbook(
    wb,
    `${beforeName}_vs_${afterName}${t('diff.excel.suffix')}.xlsx`,
  )
}
