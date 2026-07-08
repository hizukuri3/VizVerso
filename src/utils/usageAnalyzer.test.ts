import { describe, it, expect } from 'vitest'
import { analyzeFieldUsage } from './usageAnalyzer'
import type { TableauDocument } from '../types/tableau'

/** テスト用の最小ドキュメントを組み立てるヘルパー */
function makeDoc(): TableauDocument {
  return {
    datasources: [
      {
        name: 'ds1',
        fields: [
          // シートから直接使用される標準フィールド
          { column: 'Sales', isCalc: false },
          // 使用中の計算フィールドから参照される標準フィールド（推移的使用）
          { column: 'Profit', isCalc: false },
          // シートで直接使用される計算フィールド
          {
            column: 'Profit Ratio',
            isCalc: true,
            formula: '[Profit] / [Sales]',
          },
          // どこからも参照されない計算フィールド
          { column: 'Orphan Calc', isCalc: true, formula: '[Sales] * 2' },
          // 未使用の計算フィールドからのみ参照されるフィールド（これも未使用）
          { column: 'Dead Base', isCalc: false },
          {
            column: 'Dead Chain',
            isCalc: true,
            formula: '[Dead Base] + 1',
          },
          // 組み込み疑似フィールド（未使用扱いにしない）
          { column: 'Measure Names', isCalc: false },
        ],
      },
      {
        name: 'Parameters',
        fields: [
          // 計算式から参照されるパラメータ
          { column: 'Target', isCalc: false },
          // どこからも参照されないパラメータ
          { column: 'Unused Param', isCalc: false },
        ],
      },
    ],
    worksheets: [
      {
        name: 'Sheet 1',
        dependencies: ['Sales', 'Profit Ratio', 'Goal Check'],
        localFields: [],
      },
    ],
    dashboards: [],
  }
}

describe('usageAnalyzer', () => {
  it('シートから直接使用されているフィールドは used=true になること', () => {
    const doc = makeDoc()
    // Goal Check はパラメータ Target を参照する計算フィールドとして追加
    doc.datasources[0].fields.push({
      column: 'Goal Check',
      isCalc: true,
      formula: '[Sales] > [Target]',
    })
    const result = analyzeFieldUsage(doc)
    expect(result.usage.get('Sales')?.used).toBe(true)
    expect(result.usage.get('Sales')?.directSheets).toContain('Sheet 1')
  })

  it('使用中の計算フィールドから参照されるフィールドは推移的に used=true になること', () => {
    const result = analyzeFieldUsage(makeDoc())
    // Profit は Profit Ratio（直接使用）経由でのみ使われる
    expect(result.usage.get('Profit')?.used).toBe(true)
    expect(result.usage.get('Profit')?.viaFields).toContain('Profit Ratio')
  })

  it('どこからも参照されない計算フィールドは unused になること', () => {
    const result = analyzeFieldUsage(makeDoc())
    expect(result.usage.get('Orphan Calc')?.used).toBe(false)
    expect(result.unusedFields).toContain('Orphan Calc')
  })

  it('未使用の計算フィールドからのみ参照されるフィールドも unused になること', () => {
    const result = analyzeFieldUsage(makeDoc())
    // Dead Chain は未使用 → Dead Base も未使用（推移が伝播しない）
    expect(result.usage.get('Dead Chain')?.used).toBe(false)
    expect(result.usage.get('Dead Base')?.used).toBe(false)
    expect(result.unusedFields).toContain('Dead Base')
  })

  it('計算式から参照されるパラメータは used=true になること', () => {
    const doc = makeDoc()
    doc.datasources[0].fields.push({
      column: 'Goal Check',
      isCalc: true,
      formula: '[Sales] > [Parameters].[Target]',
    })
    const result = analyzeFieldUsage(doc)
    expect(result.usage.get('Target')?.used).toBe(true)
    expect(result.usage.get('Unused Param')?.used).toBe(false)
    expect(result.unusedFields).toContain('Unused Param')
  })

  it('組み込み疑似フィールドは unusedFields に含まれないこと', () => {
    const result = analyzeFieldUsage(makeDoc())
    expect(result.unusedFields).not.toContain('Measure Names')
  })

  it('2つの計算フィールドが同じフィールドを参照する場合、referencedBy 集約が両方の参照元を記録すること', () => {
    const doc = makeDoc()
    // Profit を参照する2つ目の計算フィールドを追加し、
    // Sheet 1 の依存関係にも加えて used=true（直接使用）にする
    doc.datasources[0].fields.push({
      column: 'Profit Doubled',
      isCalc: true,
      formula: '[Profit] * 2',
    })
    doc.worksheets[0].dependencies.push('Profit Doubled')
    const result = analyzeFieldUsage(doc)
    // Profit は Profit Ratio と Profit Doubled の両方から参照される
    const viaFields = result.usage.get('Profit')?.viaFields ?? []
    expect(viaFields).toContain('Profit Ratio')
    expect(viaFields).toContain('Profit Doubled')
    expect(viaFields.length).toBe(2)
  })

  it('ダッシュボードのみで使用されるフィールド（パラメータコントロール等）は used=true になること', () => {
    const doc = makeDoc()
    // Unused Param はダッシュボードのパラメータコントロールで使用される
    doc.dashboards.push({
      name: 'Dashboard 1',
      worksheets: ['Sheet 1'],
      usedFields: ['Unused Param', 'Dead Chain'],
    })
    const result = analyzeFieldUsage(doc)
    expect(result.usage.get('Unused Param')?.used).toBe(true)
    // ダッシュボードで使用中の計算フィールドの参照先も推移的に使用扱いになる
    expect(result.usage.get('Dead Chain')?.used).toBe(true)
    expect(result.usage.get('Dead Base')?.used).toBe(true)
  })
})
