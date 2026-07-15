import { describe, it, expect } from 'vitest'
import { diffWorkbooks } from './workbookDiff'
import type {
  TableauDocument,
  TableauField,
  TableauWorksheet,
} from '../types/tableau'

// ── テスト用の最小ドキュメント組み立てヘルパー ──
function field(
  column: string,
  extra: Partial<TableauField> = {},
): TableauField {
  return { column, ...extra }
}

function doc(overrides: Partial<TableauDocument> = {}): TableauDocument {
  return {
    datasources: [],
    worksheets: [],
    dashboards: [],
    ...overrides,
  }
}

function sheet(
  name: string,
  extra: Partial<TableauWorksheet> = {},
): TableauWorksheet {
  return { name, dependencies: [], ...extra }
}

describe('diffWorkbooks - フィールドの追加/削除', () => {
  it('データソースのフィールド追加と削除を検出すること', () => {
    const before = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales'), field('Old Field')] },
      ],
    })
    const after = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales'), field('New Field')] },
      ],
    })

    const result = diffWorkbooks(before, after)
    expect(result.fields.added.map((f) => f.column)).toContain('New Field')
    expect(result.fields.removed.map((f) => f.column)).toContain('Old Field')
    // Sales は両方に存在し変更なし
    expect(result.fields.unchangedCount).toBe(1)
  })
})

describe('diffWorkbooks - formula 変更（空白正規化）', () => {
  it('空白のみの差はフィールド変更として扱わないこと', () => {
    const before = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Calc', { isCalc: true, formula: '[A] + [B]' })],
        },
      ],
    })
    const after = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Calc', { isCalc: true, formula: '[A]   +   [B]  ' })],
        },
      ],
    })
    const result = diffWorkbooks(before, after)
    expect(result.fields.changed).toHaveLength(0)
    expect(result.fields.unchangedCount).toBe(1)
  })

  it('実際に式が変わった場合は formula 変更を検出すること', () => {
    const before = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Calc', { isCalc: true, formula: '[A] + [B]' })],
        },
      ],
    })
    const after = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Calc', { isCalc: true, formula: '[A] - [B]' })],
        },
      ],
    })
    const result = diffWorkbooks(before, after)
    expect(result.fields.changed).toHaveLength(1)
    const change = result.fields.changed[0]
    expect(change.changes.some((c) => c.property === 'formula')).toBe(true)
    const formulaChange = change.changes.find((c) => c.property === 'formula')
    expect(formulaChange?.before).toBe('[A] + [B]')
    expect(formulaChange?.after).toBe('[A] - [B]')
  })
})

describe('diffWorkbooks - caption 変更', () => {
  it('フィールドの caption 変更を検出すること', () => {
    const before = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales', { caption: '売上' })] },
      ],
    })
    const after = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales', { caption: '売上高' })] },
      ],
    })
    const result = diffWorkbooks(before, after)
    expect(result.fields.changed).toHaveLength(1)
    expect(
      result.fields.changed[0].changes.some((c) => c.property === 'caption'),
    ).toBe(true)
  })

  it('データソースの caption 変更を検出すること（フィールドとは別カテゴリ）', () => {
    const before = doc({
      datasources: [{ name: 'DS', caption: '旧DS', fields: [] }],
    })
    const after = doc({
      datasources: [{ name: 'DS', caption: '新DS', fields: [] }],
    })
    const result = diffWorkbooks(before, after)
    expect(result.datasources.changed).toHaveLength(1)
    expect(
      result.datasources.changed[0].changes.some(
        (c) => c.property === 'caption',
      ),
    ).toBe(true)
  })
})

describe('diffWorkbooks - ワークシートの dependencies 変化', () => {
  it('依存フィールドの追加/削除を検出すること', () => {
    const before = doc({
      worksheets: [sheet('Sheet 1', { dependencies: ['Sales', 'Profit'] })],
    })
    const after = doc({
      worksheets: [sheet('Sheet 1', { dependencies: ['Sales', 'Discount'] })],
    })
    const result = diffWorkbooks(before, after)
    expect(result.worksheets.changed).toHaveLength(1)
    const props = result.worksheets.changed[0].changes
    expect(props.some((c) => c.property === 'dependencies')).toBe(true)
    // 追加 Discount / 削除 Profit
    expect(
      props.some(
        (c) => c.property === 'dependencies' && c.after === 'Discount',
      ),
    ).toBe(true)
    expect(
      props.some((c) => c.property === 'dependencies' && c.before === 'Profit'),
    ).toBe(true)
  })
})

describe('diffWorkbooks - ダッシュボードのシート構成変化', () => {
  it('含まれるシートの追加/削除を検出すること', () => {
    const before = doc({
      dashboards: [{ name: 'DB', worksheets: ['Sheet 1', 'Sheet 2'] }],
    })
    const after = doc({
      dashboards: [{ name: 'DB', worksheets: ['Sheet 1', 'Sheet 3'] }],
    })
    const result = diffWorkbooks(before, after)
    expect(result.dashboards.changed).toHaveLength(1)
    const props = result.dashboards.changed[0].changes
    expect(
      props.some((c) => c.property === 'worksheets' && c.after === 'Sheet 3'),
    ).toBe(true)
    expect(
      props.some((c) => c.property === 'worksheets' && c.before === 'Sheet 2'),
    ).toBe(true)
  })
})

describe('diffWorkbooks - 全一致', () => {
  it('同一ドキュメントでは全カテゴリが unchanged となること', () => {
    const base = doc({
      datasources: [
        {
          name: 'DS',
          caption: 'DS',
          fields: [
            field('Sales'),
            field('Calc', { isCalc: true, formula: '[Sales] * 2' }),
          ],
        },
      ],
      worksheets: [sheet('Sheet 1', { dependencies: ['Sales'] })],
      dashboards: [{ name: 'DB', worksheets: ['Sheet 1'] }],
    })
    // ディープコピーで同一内容の別インスタンスを用意
    const clone: TableauDocument = JSON.parse(JSON.stringify(base))
    const result = diffWorkbooks(base, clone)

    for (const category of [
      result.datasources,
      result.fields,
      result.worksheets,
      result.dashboards,
    ]) {
      expect(category.added).toHaveLength(0)
      expect(category.removed).toHaveLength(0)
      expect(category.changed).toHaveLength(0)
    }
    expect(result.datasources.unchangedCount).toBe(1)
    expect(result.fields.unchangedCount).toBe(2)
    expect(result.worksheets.unchangedCount).toBe(1)
    expect(result.dashboards.unchangedCount).toBe(1)
  })
})
