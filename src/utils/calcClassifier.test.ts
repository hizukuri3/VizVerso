import { describe, it, expect } from 'vitest'
import { classifyFormula } from './calcClassifier'

describe('calcClassifier', () => {
  it('計算式がない場合は null を返すこと', () => {
    expect(classifyFormula(undefined)).toBeNull()
    expect(classifyFormula('')).toBeNull()
  })

  it('LOD表現（FIXED / INCLUDE / EXCLUDE）を判定できること', () => {
    expect(classifyFormula('{ FIXED [Region] : SUM([Sales]) }')).toBe('lod')
    expect(classifyFormula('{FIXED [Region]: SUM([Sales])}')).toBe('lod')
    expect(classifyFormula('{ INCLUDE [Customer] : AVG([Profit]) }')).toBe(
      'lod',
    )
    expect(classifyFormula('{ EXCLUDE [Date] : SUM([Sales]) }')).toBe('lod')
    // 小文字でも判定できる
    expect(classifyFormula('{ fixed [Region] : SUM([Sales]) }')).toBe('lod')
  })

  it('表計算関数を判定できること', () => {
    expect(classifyFormula('WINDOW_SUM(SUM([Sales]))')).toBe('tableCalc')
    expect(classifyFormula('RUNNING_SUM(SUM([Sales]))')).toBe('tableCalc')
    expect(classifyFormula('INDEX()')).toBe('tableCalc')
    expect(classifyFormula('FIRST()')).toBe('tableCalc')
    expect(classifyFormula('LAST()')).toBe('tableCalc')
    expect(classifyFormula('SIZE()')).toBe('tableCalc')
    expect(classifyFormula('RANK(SUM([Sales]))')).toBe('tableCalc')
    expect(classifyFormula('RANK_DENSE(SUM([Sales]))')).toBe('tableCalc')
    expect(classifyFormula('LOOKUP(SUM([Sales]), -1)')).toBe('tableCalc')
    expect(classifyFormula('PREVIOUS_VALUE(0)')).toBe('tableCalc')
    expect(classifyFormula('TOTAL(SUM([Sales]))')).toBe('tableCalc')
    expect(classifyFormula('SCRIPT_REAL("...", SUM([Sales]))')).toBe(
      'tableCalc',
    )
  })

  it('通常の計算式は regular と判定されること', () => {
    expect(classifyFormula('[Profit] / [Sales]')).toBe('regular')
    expect(classifyFormula('IF [Sales] > 100 THEN "High" ELSE "Low" END')).toBe(
      'regular',
    )
    expect(classifyFormula('SUM([Sales])')).toBe('regular')
    expect(classifyFormula('DATETRUNC("month", [Order Date])')).toBe('regular')
  })

  it('表計算とLODが混在する場合は表計算を優先すること', () => {
    // 表計算関数を含む時点でそのフィールドは表計算として動作する
    expect(
      classifyFormula('WINDOW_SUM(SUM([Sales])) + { FIXED : SUM([Profit]) }'),
    ).toBe('tableCalc')
  })

  it('文字列リテラル内のキーワードは無視されること', () => {
    expect(classifyFormula('"FIXED" + [Category]')).toBe('regular')
    expect(classifyFormula("'WINDOW_SUM(' + [Category]")).toBe('regular')
  })

  it('コメント内のキーワードは無視されること', () => {
    expect(classifyFormula('// { FIXED } を使う予定\n[Sales] * 2')).toBe(
      'regular',
    )
  })

  it('INDEX という名前のフィールド参照は表計算と誤判定されないこと', () => {
    expect(classifyFormula('[INDEX] + 1')).toBe('regular')
  })
})
