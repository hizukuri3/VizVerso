import { describe, it, expect } from 'vitest'
import { formatFormulaText } from './formulaFormatter'

describe('formatFormulaText', () => {
  it('rawFormula が undefined の場合は undefined を返すこと', () => {
    const fieldMeta = new Map<string, { caption?: string }>()
    expect(formatFormulaText(undefined, fieldMeta)).toBeUndefined()
  })

  it('rawFormula が空文字の場合も undefined を返すこと', () => {
    const fieldMeta = new Map<string, { caption?: string }>()
    // 空文字は falsy のため !rawFormula 分岐に入る
    expect(formatFormulaText('', fieldMeta)).toBeUndefined()
  })

  it('&amp; を & にデコードすること（二重エンコード対策）', () => {
    const fieldMeta = new Map<string, { caption?: string }>()
    const result = formatFormulaText('"A &amp;&amp; B"', fieldMeta)
    expect(result).toBe('"A && B"')
  })

  it('数値実体参照のうち &#13;（CR）は除去されること', () => {
    const fieldMeta = new Map<string, { caption?: string }>()
    const result = formatFormulaText('A&#13;B', fieldMeta)
    expect(result).toBe('AB')
  })

  it('数値実体参照のうち CR 以外（例: &#10;）は対応する文字に変換されること', () => {
    const fieldMeta = new Map<string, { caption?: string }>()
    const result = formatFormulaText('A&#10;B', fieldMeta)
    expect(result).toBe('A\nB')
  })

  it('16進数実体参照のうち &#xD;（CR）は除去されること', () => {
    const fieldMeta = new Map<string, { caption?: string }>()
    const result = formatFormulaText('A&#xD;B', fieldMeta)
    expect(result).toBe('AB')
  })

  it('16進数実体参照のうち CR 以外（例: &#x41;）は対応する文字に変換されること', () => {
    const fieldMeta = new Map<string, { caption?: string }>()
    const result = formatFormulaText('A&#x41;B', fieldMeta)
    expect(result).toBe('AAB')
  })

  it('その他の主要な実体参照（quot, apos, lt, gt, nbsp, tab）をデコードすること', () => {
    const fieldMeta = new Map<string, { caption?: string }>()
    const result = formatFormulaText(
      '&quot;&apos;&lt;&gt;&nbsp;&#9;',
      fieldMeta,
    )
    expect(result).toBe('"\'<> \t')
  })

  it('fieldMeta に caption が存在するフィールドはキャプションに置換されること', () => {
    const fieldMeta = new Map<string, { caption?: string }>([
      ['Calculation_1', { caption: '売上比率' }],
    ])
    const result = formatFormulaText('[Calculation_1] * 2', fieldMeta)
    expect(result).toBe('[売上比率] * 2')
  })

  it('fieldMeta に該当エントリが無い場合はフィールド名をそのまま使用すること', () => {
    const fieldMeta = new Map<string, { caption?: string }>()
    const result = formatFormulaText('[Sales]', fieldMeta)
    expect(result).toBe('[Sales]')
  })

  it('fieldMeta にエントリはあるが caption が未設定の場合はフィールド名をそのまま使用すること', () => {
    const fieldMeta = new Map<string, { caption?: string }>([['Sales', {}]])
    const result = formatFormulaText('[Sales]', fieldMeta)
    expect(result).toBe('[Sales]')
  })

  it('データソース修飾付きフィールド参照（[ds].[field]）も正しく置換されること', () => {
    const fieldMeta = new Map<string, { caption?: string }>([
      ['Profit', { caption: '利益' }],
    ])
    const result = formatFormulaText('[federated.abc].[Profit]', fieldMeta)
    expect(result).toBe('[利益]')
  })

  it('caption が既に角括弧で囲まれている場合は二重に囲まないこと', () => {
    const fieldMeta = new Map<string, { caption?: string }>([
      ['Calculation_2', { caption: '[特殊フィールド]' }],
    ])
    const result = formatFormulaText('[Calculation_2]', fieldMeta)
    expect(result).toBe('[特殊フィールド]')
  })
})
