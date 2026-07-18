import { describe, it, expect } from 'vitest'
import type ExcelJS from 'exceljs'
import { buildDiffExcelWorkbook } from './diffExcelExporter'
import { diffWorkbooks } from './workbookDiff'
import { t } from './i18n'
import type { TableauDocument } from '../types/tableau'

// ── 追加/削除/変更を各カテゴリで発生させる合成ドキュメント ──
// fields: 追加(新フィールド) / 削除(旧フィールド) / 変更(利益: 計算式) / 変更なし(売上)
// worksheets: 変更(Sheet 1: 依存フィールド追加)
// dashboards / datasources: 変更なし
const before: TableauDocument = {
  datasources: [
    {
      name: 'DS',
      caption: 'DS',
      fields: [
        { column: 'Sales', caption: '売上' },
        { column: 'OldField', caption: '旧フィールド' },
        {
          column: 'Calc',
          caption: '利益',
          isCalc: true,
          formula: '[Sales] + 1',
        },
      ],
    },
  ],
  worksheets: [{ name: 'Sheet 1', dependencies: ['Sales'] }],
  dashboards: [{ name: 'DB', worksheets: ['Sheet 1'] }],
} as unknown as TableauDocument

const after: TableauDocument = {
  datasources: [
    {
      name: 'DS',
      caption: 'DS',
      fields: [
        { column: 'Sales', caption: '売上' },
        { column: 'NewField', caption: '新フィールド' },
        {
          column: 'Calc',
          caption: '利益',
          isCalc: true,
          formula: '[Sales] + 2',
        },
      ],
    },
  ],
  worksheets: [{ name: 'Sheet 1', dependencies: ['Sales', 'Profit'] }],
  dashboards: [{ name: 'DB', worksheets: ['Sheet 1'] }],
} as unknown as TableauDocument

/** 述語に最初に一致する行を返す。 */
function findRow(
  ws: ExcelJS.Worksheet,
  predicate: (row: ExcelJS.Row) => boolean,
): ExcelJS.Row | undefined {
  let found: ExcelJS.Row | undefined
  ws.eachRow((row) => {
    if (!found && predicate(row)) found = row
  })
  return found
}

const cell = (row: ExcelJS.Row, col: number) => row.getCell(col).value

describe('diffExcelExporter - シート構成', () => {
  it('サマリー + カテゴリ別4シートが生成されること', () => {
    const diff = diffWorkbooks(before, after)
    const wb = buildDiffExcelWorkbook(diff, 'v1', 'v2')

    expect(wb.getWorksheet(t('diff.excel.sheet_summary'))).toBeDefined()
    expect(wb.getWorksheet(t('diff.category.datasources'))).toBeDefined()
    expect(wb.getWorksheet(t('diff.category.fields'))).toBeDefined()
    expect(wb.getWorksheet(t('diff.category.worksheets'))).toBeDefined()
    expect(wb.getWorksheet(t('diff.category.dashboards'))).toBeDefined()

    // シート名は Excel 制約（31文字以内・一意）を満たす
    const names = wb.worksheets.map((w) => w.name)
    expect(new Set(names).size).toBe(names.length)
    names.forEach((n) => expect(n.length).toBeLessThanOrEqual(31))
  })
})

describe('diffExcelExporter - サマリーシートの集計', () => {
  it('メタ情報とカテゴリ別集計値が出力されること', () => {
    const diff = diffWorkbooks(before, after)
    const wb = buildDiffExcelWorkbook(diff, 'v1.twbx', 'v2.twbx')
    const ws = wb.getWorksheet(t('diff.excel.sheet_summary'))!

    // メタ情報（ファイル名）が本文に含まれる
    const beforeMeta = findRow(
      ws,
      (r) => r.getCell(1).value === t('diff.excel.meta_before_file'),
    )
    expect(beforeMeta && cell(beforeMeta, 2)).toBe('v1.twbx')
    const afterMeta = findRow(
      ws,
      (r) => r.getCell(1).value === t('diff.excel.meta_after_file'),
    )
    expect(afterMeta && cell(afterMeta, 2)).toBe('v2.twbx')

    // フィールドカテゴリの集計: 追加1 / 削除1 / 変更1 / 変更なし1
    const fieldsRow = findRow(
      ws,
      (r) => r.getCell(1).value === t('diff.category.fields'),
    )!
    expect(cell(fieldsRow, 2)).toBe(1) // 追加
    expect(cell(fieldsRow, 3)).toBe(1) // 削除
    expect(cell(fieldsRow, 4)).toBe(1) // 変更
    expect(cell(fieldsRow, 5)).toBe(1) // 変更なし
  })
})

describe('diffExcelExporter - カテゴリ別シートの行内容', () => {
  it('追加/削除/変更行が状態・名前・プロパティ・前後値を持つこと', () => {
    const diff = diffWorkbooks(before, after)
    const wb = buildDiffExcelWorkbook(diff, 'v1', 'v2')
    const ws = wb.getWorksheet(t('diff.category.fields'))!

    // 追加行: 状態=追加 / 名前=新フィールド（プロパティ・前後は空）
    const added = findRow(ws, (r) => r.getCell(2).value === '新フィールド')!
    expect(cell(added, 1)).toBe(t('diff.summary_added'))
    expect(cell(added, 3) ?? '').toBe('')
    expect(cell(added, 4) ?? '').toBe('')
    expect(cell(added, 5) ?? '').toBe('')

    // 削除行: 状態=削除 / 名前=旧フィールド
    const removed = findRow(ws, (r) => r.getCell(2).value === '旧フィールド')!
    expect(cell(removed, 1)).toBe(t('diff.summary_removed'))

    // 変更行: 状態=変更 / 名前=利益 / プロパティ=計算式 / 前後=生の式
    const changed = findRow(
      ws,
      (r) =>
        r.getCell(1).value === t('diff.summary_changed') &&
        r.getCell(3).value === t('diff.prop.formula'),
    )!
    expect(cell(changed, 2)).toBe('利益')
    expect(cell(changed, 4)).toBe('[Sales] + 1')
    expect(cell(changed, 5)).toBe('[Sales] + 2')
  })

  it('ワークシートの依存フィールド追加が変更行として出力されること', () => {
    const diff = diffWorkbooks(before, after)
    const wb = buildDiffExcelWorkbook(diff, 'v1', 'v2')
    const ws = wb.getWorksheet(t('diff.category.worksheets'))!

    const depChange = findRow(
      ws,
      (r) => r.getCell(3).value === t('diff.prop.dependencies'),
    )!
    expect(cell(depChange, 1)).toBe(t('diff.summary_changed'))
    expect(cell(depChange, 2)).toBe('Sheet 1')
    // 追加された依存フィールドは after 側のみ値を持つ
    expect(cell(depChange, 5)).toBe('Profit')
  })
})

describe('diffExcelExporter - フィールド表示名ルール', () => {
  it('caption を優先し物理名（column）は表示しないこと', () => {
    const capBefore: TableauDocument = {
      datasources: [{ name: 'DS', fields: [] }],
      worksheets: [],
      dashboards: [],
    } as unknown as TableauDocument
    const capAfter: TableauDocument = {
      datasources: [
        {
          name: 'DS',
          fields: [
            {
              column: 'Calculation_12345',
              caption: '利益率',
              isCalc: true,
              formula: '[Sales]/[Cost]',
            },
          ],
        },
      ],
      worksheets: [],
      dashboards: [],
    } as unknown as TableauDocument

    const diff = diffWorkbooks(capBefore, capAfter)
    const wb = buildDiffExcelWorkbook(diff, 'v1', 'v2')
    const ws = wb.getWorksheet(t('diff.category.fields'))!

    // caption「利益率」が名前列に出て、物理名 Calculation_12345 は現れない
    const added = findRow(ws, (r) => r.getCell(2).value === '利益率')
    expect(added).toBeDefined()
    const generated = findRow(ws, (r) =>
      String(r.getCell(2).value ?? '').includes('Calculation_'),
    )
    expect(generated).toBeUndefined()
  })
})
