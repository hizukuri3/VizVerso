import { describe, it, expect } from 'vitest'
import { buildUpstreamTree } from './dependencyTree'
import type { TableauDocument } from '../types/tableau'

// 依存ツリー構築の検証用フィクスチャ。
// A -> B -> Sales の2階層ネスト、循環参照、未解決参照、深さチェーンを網羅する。
const doc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        { column: 'Profit', isCalc: false, dataType: 'real' },
        { column: 'B', isCalc: true, formula: '[Sales] + 1', dataType: 'real' },
        { column: 'A', isCalc: true, formula: '[B] * 2', dataType: 'real' },
        {
          column: 'LodCalc',
          isCalc: true,
          formula: '{ FIXED [Sales] : SUM([Profit]) }',
        },
        {
          column: 'TableCalc',
          isCalc: true,
          formula: 'RUNNING_SUM([Sales])',
        },
        { column: 'Missing Ref', isCalc: true, formula: '[Nope]' },
        // 循環参照ペア
        { column: 'CycA', isCalc: true, formula: '[CycB]' },
        { column: 'CycB', isCalc: true, formula: '[CycA]' },
        // 深さ打ち切り用チェーン D1 -> D2 -> D3 -> Sales
        { column: 'D1', isCalc: true, formula: '[D2]' },
        { column: 'D2', isCalc: true, formula: '[D3]' },
        { column: 'D3', isCalc: true, formula: '[Sales]' },
      ],
    },
  ],
  worksheets: [],
  dashboards: [],
}

describe('buildUpstreamTree', () => {
  it('2階層ネストした計算式を再帰的に展開すること', () => {
    const tree = buildUpstreamTree(doc, 'A')
    expect(tree).not.toBeNull()
    expect(tree!.fieldId).toBe('A')
    expect(tree!.isCalc).toBe(true)
    expect(tree!.children).toHaveLength(1)

    const b = tree!.children[0]
    expect(b.fieldId).toBe('B')
    expect(b.isCalc).toBe(true)
    expect(b.children).toHaveLength(1)

    const sales = b.children[0]
    expect(sales.fieldId).toBe('Sales')
    expect(sales.isCalc).toBe(false)
    expect(sales.children).toHaveLength(0)
  })

  it('循環参照を検出して打ち切ること', () => {
    const tree = buildUpstreamTree(doc, 'CycA')
    expect(tree).not.toBeNull()
    const cycB = tree!.children[0]
    expect(cycB.fieldId).toBe('CycB')
    const cycAAgain = cycB.children[0]
    expect(cycAAgain.fieldId).toBe('CycA')
    expect(cycAAgain.isCircular).toBe(true)
    expect(cycAAgain.children).toHaveLength(0)
  })

  it('ドキュメント内に定義がない参照は isUnresolved になること', () => {
    const tree = buildUpstreamTree(doc, 'Missing Ref')
    expect(tree).not.toBeNull()
    const missing = tree!.children[0]
    expect(missing.fieldId).toBe('Nope')
    expect(missing.isUnresolved).toBe(true)
    expect(missing.isCalc).toBe(false)
    expect(missing.children).toHaveLength(0)
  })

  it('maxDepth を超えた階層は展開しないこと', () => {
    const tree = buildUpstreamTree(doc, 'D1', 1)
    expect(tree).not.toBeNull()
    expect(tree!.fieldId).toBe('D1')
    const d2 = tree!.children[0]
    expect(d2.fieldId).toBe('D2')
    // maxDepth=1 のため D2 の子（D3）は展開されない
    expect(d2.children).toHaveLength(0)
  })

  it('既定の maxDepth ではチェーン全体を展開すること', () => {
    const tree = buildUpstreamTree(doc, 'D1')
    const d2 = tree!.children[0]
    const d3 = d2.children[0]
    expect(d3.fieldId).toBe('D3')
    expect(d3.children[0].fieldId).toBe('Sales')
  })

  it('非計算フィールドは子を持たない葉になること', () => {
    const tree = buildUpstreamTree(doc, 'Sales')
    expect(tree).not.toBeNull()
    expect(tree!.isCalc).toBe(false)
    expect(tree!.children).toHaveLength(0)
  })

  it('計算式の種別（LOD / 表計算 / 通常）を分類すること', () => {
    expect(buildUpstreamTree(doc, 'LodCalc')!.calcType).toBe('lod')
    expect(buildUpstreamTree(doc, 'TableCalc')!.calcType).toBe('tableCalc')
    expect(buildUpstreamTree(doc, 'A')!.calcType).toBe('regular')
  })

  it('ルートフィールドが見つからない場合は null を返すこと', () => {
    expect(buildUpstreamTree(doc, 'Nonexistent')).toBeNull()
  })
})
