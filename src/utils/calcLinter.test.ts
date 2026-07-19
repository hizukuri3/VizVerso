import { describe, it, expect } from 'vitest'
import { lintWorkbook, RULE_ORDER, type LintRuleId } from './calcLinter'
import type { TableauDocument, TableauField } from '../types/tableau'

/**
 * テスト用ドキュメント組み立てヘルパー。
 * fields は 'ds' データソースに、params は 'Parameters' データソースに配置する。
 * deps を省略した場合は全フィールドを「使用中」にする（未使用系ルールの誤爆防止）。
 */
function makeDoc(
  fields: TableauField[],
  opts: { params?: TableauField[]; deps?: string[] } = {},
): TableauDocument {
  const params = opts.params ?? []
  const allCols = [...fields, ...params].map((f) => f.column)
  const deps = opts.deps ?? allCols
  return {
    datasources: [
      { name: 'ds', fields },
      ...(params.length ? [{ name: 'Parameters', fields: params }] : []),
    ],
    worksheets: [{ name: 'S1', dependencies: deps, localFields: [] }],
    dashboards: [],
  }
}

/** 指定ルールの findings だけ抽出する */
function byRule(doc: TableauDocument, ruleId: LintRuleId) {
  return lintWorkbook(doc).findings.filter((f) => f.ruleId === ruleId)
}

/** ELSEIF を k 回持つ IF 式を生成する */
function makeElseIf(k: number): string {
  let s = 'IF [a] = 1 THEN 1 '
  for (let i = 2; i <= k + 1; i++) s += `ELSEIF [a] = ${i} THEN ${i} `
  return s + 'END'
}

/** WHEN を k 回持つ CASE 式を生成する */
function makeWhen(k: number): string {
  let s = 'CASE [a] '
  for (let i = 1; i <= k; i++) s += `WHEN ${i} THEN ${i} `
  return s + 'END'
}

describe('calcLinter - 基本構造', () => {
  it('計算フィールドが0件なら findings 空・score 100', () => {
    const result = lintWorkbook(
      makeDoc([
        { column: 'Sales', isCalc: false },
        { column: 'Profit', isCalc: false },
      ]),
    )
    expect(result.findings).toEqual([])
    expect(result.calcFieldCount).toBe(0)
    expect(result.score).toBe(100)
  })

  it('rules は RULE_ORDER の順で全ルールを含み count が設定される', () => {
    const result = lintWorkbook(makeDoc([{ column: 'Sales', isCalc: false }]))
    expect(result.rules.map((r) => r.ruleId)).toEqual(
      RULE_ORDER.map((r) => r.ruleId),
    )
    expect(result.rules.every((r) => r.count === 0)).toBe(true)
  })

  it('caption は caption 優先、なければ column の前後ブラケット除去', () => {
    const doc = makeDoc([
      {
        column: '[Raw Col]',
        isCalc: true,
        formula: 'COUNTD([X])',
        caption: 'Nice Name',
      },
      { column: '[Bare Col]', isCalc: true, formula: 'COUNTD([Y])' },
    ])
    const findings = byRule(doc, 'countd')
    const captions = findings.map((f) => f.caption)
    expect(captions).toContain('Nice Name')
    expect(captions).toContain('Bare Col')
  })

  it('calcFieldCount はパラメータを除いた計算フィールド数', () => {
    const result = lintWorkbook(
      makeDoc(
        [
          { column: 'C1', isCalc: true, formula: '[a] + 1' },
          { column: 'C2', isCalc: true, formula: '[b] + 1' },
          { column: 'Plain', isCalc: false },
        ],
        { params: [{ column: 'P1', isCalc: false, value: 5 }] },
      ),
    )
    expect(result.calcFieldCount).toBe(2)
  })
})

describe('calcLinter - nestedLod', () => {
  it('LODの入れ子を検出し depth を報告する', () => {
    const doc = makeDoc([
      {
        column: 'Nested',
        isCalc: true,
        formula: '{ FIXED [A] : SUM({ INCLUDE [B] : SUM([C]) }) }',
      },
    ])
    const findings = byRule(doc, 'nestedLod')
    expect(findings.length).toBe(1)
    expect(findings[0].params?.depth).toBe(2)
  })

  it('大文字小文字・空白を無視して入れ子を検出する', () => {
    const doc = makeDoc([
      {
        column: 'Nested2',
        isCalc: true,
        formula: '{fixed [A]:MAX({exclude [B]:SUM([C])})}',
      },
    ])
    expect(byRule(doc, 'nestedLod').length).toBe(1)
  })

  it('単一のLODは検出しない', () => {
    const doc = makeDoc([
      { column: 'Single', isCalc: true, formula: '{ FIXED [A] : SUM([C]) }' },
    ])
    expect(byRule(doc, 'nestedLod').length).toBe(0)
  })

  it('文字列リテラル内の { FIXED は誤検知しない', () => {
    const doc = makeDoc([
      {
        column: 'StrLod',
        isCalc: true,
        formula: '{ FIXED [A] : SUM([C]) } + "{ FIXED nested"',
      },
    ])
    expect(byRule(doc, 'nestedLod').length).toBe(0)
  })
})

describe('calcLinter - countd', () => {
  it('COUNTD の出現回数を報告する', () => {
    const doc = makeDoc([
      {
        column: 'Cd',
        isCalc: true,
        formula: 'COUNTD([A]) + COUNTD([B])',
      },
    ])
    const findings = byRule(doc, 'countd')
    expect(findings.length).toBe(1)
    expect(findings[0].params?.count).toBe(2)
  })

  it('文字列リテラル内の COUNTD( は誤検知しない', () => {
    const doc = makeDoc([
      {
        column: 'NoCd',
        isCalc: true,
        formula: 'IF [x] = "COUNTD(" THEN 1 END',
      },
    ])
    expect(byRule(doc, 'countd').length).toBe(0)
  })

  it('コメント内の COUNTD( は誤検知しない', () => {
    const doc = makeDoc([
      {
        column: 'NoCd2',
        isCalc: true,
        formula: '// COUNTD(\n[A] + 1',
      },
    ])
    expect(byRule(doc, 'countd').length).toBe(0)
  })
})

describe('calcLinter - heavyStringCalc', () => {
  it('行レベルの重い文字列関数を検出し関数名を報告する', () => {
    const doc = makeDoc([
      {
        column: 'Heavy',
        isCalc: true,
        formula: 'CONTAINS([A], "x") OR FIND([B], "y") > 0',
      },
    ])
    const findings = byRule(doc, 'heavyStringCalc')
    expect(findings.length).toBe(1)
    expect(findings[0].params?.functions).toBe('CONTAINS, FIND')
  })

  it('FINDNTH は FIND と混同しない', () => {
    const doc = makeDoc([
      {
        column: 'Fn',
        isCalc: true,
        formula: 'FINDNTH([A], "x", 1) > 0',
      },
    ])
    const findings = byRule(doc, 'heavyStringCalc')
    expect(findings[0].params?.functions).toBe('FINDNTH')
  })

  it('LOD式は heavyStringCalc の対象外（regular のみ）', () => {
    const doc = makeDoc([
      {
        column: 'LodStr',
        isCalc: true,
        formula: '{ FIXED [A] : MAX(IF CONTAINS([B], "x") THEN 1 END) }',
      },
    ])
    expect(byRule(doc, 'heavyStringCalc').length).toBe(0)
  })
})

describe('calcLinter - deepIfChain', () => {
  it('ELSEIF 4回は非検出・5回は検出', () => {
    expect(
      byRule(
        makeDoc([{ column: 'E4', isCalc: true, formula: makeElseIf(4) }]),
        'deepIfChain',
      ).length,
    ).toBe(0)
    const found = byRule(
      makeDoc([{ column: 'E5', isCalc: true, formula: makeElseIf(5) }]),
      'deepIfChain',
    )
    expect(found.length).toBe(1)
    expect(found[0].params?.count).toBe(5)
  })

  it('WHEN 9回は非検出・10回は検出', () => {
    expect(
      byRule(
        makeDoc([{ column: 'W9', isCalc: true, formula: makeWhen(9) }]),
        'deepIfChain',
      ).length,
    ).toBe(0)
    const found = byRule(
      makeDoc([{ column: 'W10', isCalc: true, formula: makeWhen(10) }]),
      'deepIfChain',
    )
    expect(found.length).toBe(1)
    expect(found[0].params?.count).toBe(10)
  })

  it('コメント内の ELSEIF は数えない', () => {
    const lines = Array.from({ length: 6 }, () => '// ELSEIF').join('\n')
    const doc = makeDoc([
      { column: 'Cmt', isCalc: true, formula: `${lines}\nIF [a] THEN 1 END` },
    ])
    expect(byRule(doc, 'deepIfChain').length).toBe(0)
  })
})

describe('calcLinter - deepDependency', () => {
  it('依存深さ4は非検出・5は検出', () => {
    const fields: TableauField[] = [
      { column: 'F0', isCalc: true, formula: '[base] + 0' },
      { column: 'F1', isCalc: true, formula: '[F0] + 1' },
      { column: 'F2', isCalc: true, formula: '[F1] + 2' },
      { column: 'F3', isCalc: true, formula: '[F2] + 3' },
      { column: 'F4', isCalc: true, formula: '[F3] + 4' },
      { column: 'F5', isCalc: true, formula: '[F4] + 5' },
      { column: 'base', isCalc: false },
    ]
    const findings = byRule(makeDoc(fields), 'deepDependency')
    const flagged = findings.map((f) => f.caption)
    expect(flagged).toContain('F5')
    expect(flagged).not.toContain('F4')
    expect(findings.find((f) => f.caption === 'F5')?.params?.depth).toBe(5)
  })

  it('循環参照でも無限ループせず、循環自体は指摘しない', () => {
    const fields: TableauField[] = [
      { column: 'A', isCalc: true, formula: '[B] + 1' },
      { column: 'B', isCalc: true, formula: '[A] + 1' },
    ]
    const doc = makeDoc(fields)
    expect(() => lintWorkbook(doc)).not.toThrow()
    expect(byRule(doc, 'deepDependency').length).toBe(0)
  })
})

describe('calcLinter - duplicateFormula', () => {
  it('10文字以上の同一式を持つフィールドを各1件指摘する', () => {
    const doc = makeDoc([
      { column: 'Dup1', isCalc: true, formula: '[Sales] + [Cost]' },
      { column: 'Dup2', isCalc: true, formula: '[Sales] + [Cost]' },
    ])
    const findings = byRule(doc, 'duplicateFormula')
    expect(findings.length).toBe(2)
    expect(findings.every((f) => f.params?.count === 2)).toBe(true)
    const dup1 = findings.find((f) => f.caption === 'Dup1')
    expect(dup1?.params?.others).toBe('Dup2')
  })

  it('空白の違いは無視して同一式とみなす', () => {
    const doc = makeDoc([
      { column: 'Dup1', isCalc: true, formula: '[Sales]  +   [Cost]' },
      { column: 'Dup2', isCalc: true, formula: '[Sales] + [Cost]' },
    ])
    expect(byRule(doc, 'duplicateFormula').length).toBe(2)
  })

  it('9文字の重複式は非検出', () => {
    const doc = makeDoc([
      { column: 'S1', isCalc: true, formula: '[A] + [B]' },
      { column: 'S2', isCalc: true, formula: '[A] + [B]' },
    ])
    expect(byRule(doc, 'duplicateFormula').length).toBe(0)
  })

  it('同一式が1件だけなら非検出', () => {
    const doc = makeDoc([
      { column: 'Only', isCalc: true, formula: '[Sales] + [Cost]' },
    ])
    expect(byRule(doc, 'duplicateFormula').length).toBe(0)
  })
})

describe('calcLinter - unusedCalc / unusedParam', () => {
  it('未使用の計算フィールドを unusedCalc として指摘する', () => {
    const doc = makeDoc(
      [
        { column: 'Used', isCalc: true, formula: '[a] + 1' },
        { column: 'Orphan', isCalc: true, formula: '[b] + 1' },
      ],
      { deps: ['Used'] },
    )
    const findings = byRule(doc, 'unusedCalc')
    expect(findings.map((f) => f.caption)).toEqual(['Orphan'])
  })

  it('未使用のパラメータを unusedParam として指摘する（unusedCalc には出さない）', () => {
    const doc = makeDoc(
      [{ column: 'Used', isCalc: true, formula: '[a] + 1' }],
      {
        params: [
          { column: 'UsedParam', isCalc: false, value: 1 },
          { column: 'DeadParam', isCalc: false, value: 2 },
        ],
        deps: ['Used', 'UsedParam'],
      },
    )
    const paramFindings = byRule(doc, 'unusedParam')
    expect(paramFindings.map((f) => f.caption)).toEqual(['DeadParam'])
    expect(byRule(doc, 'unusedCalc').length).toBe(0)
  })
})

describe('calcLinter - パラメータ除外', () => {
  it('Parameters データソースのフィールドは計算式系ルールの対象外', () => {
    const doc = makeDoc([{ column: 'Plain', isCalc: false }], {
      params: [
        {
          column: 'FakeParam',
          isCalc: true,
          formula: 'COUNTD([A]) + COUNTD([B])',
          value: 1,
        },
      ],
    })
    const result = lintWorkbook(doc)
    expect(result.calcFieldCount).toBe(0)
    expect(byRule(doc, 'countd').length).toBe(0)
  })
})

describe('calcLinter - スコアと並び順', () => {
  it('score = 100 -(warning×5 + info×2)', () => {
    const doc = makeDoc([
      // warning: nestedLod
      {
        column: 'Nested',
        isCalc: true,
        formula: '{ FIXED [A] : SUM({ INCLUDE [B] : SUM([C]) }) }',
      },
      // warning: deepIfChain
      { column: 'BigIf', isCalc: true, formula: makeElseIf(5) },
      // info: countd
      { column: 'Cd', isCalc: true, formula: 'COUNTD([X])' },
    ])
    const result = lintWorkbook(doc)
    // warning 2件 (nestedLod, deepIfChain) + info 1件 (countd)
    expect(result.score).toBe(100 - (2 * 5 + 1 * 2))
  })

  it('findings は RULE_ORDER 順 → 同一ルール内は表示名昇順', () => {
    const doc = makeDoc([
      { column: 'Zebra', isCalc: true, formula: 'COUNTD([X])' },
      { column: 'Apple', isCalc: true, formula: 'COUNTD([Y])' },
      {
        column: 'Nested',
        isCalc: true,
        formula: '{ FIXED [A] : SUM({ INCLUDE [B] : SUM([C]) }) }',
      },
    ])
    const order = lintWorkbook(doc).findings.map((f) => [f.ruleId, f.caption])
    // nestedLod が countd より先（RULE_ORDER 順）、countd 内は Apple → Zebra
    expect(order).toEqual([
      ['nestedLod', 'Nested'],
      ['countd', 'Apple'],
      ['countd', 'Zebra'],
    ])
  })

  it('ルール集計 count が findings 件数と一致する', () => {
    const doc = makeDoc([
      { column: 'Cd1', isCalc: true, formula: 'COUNTD([X])' },
      { column: 'Cd2', isCalc: true, formula: 'COUNTD([Y])' },
    ])
    const result = lintWorkbook(doc)
    const countdRule = result.rules.find((r) => r.ruleId === 'countd')
    expect(countdRule?.count).toBe(2)
  })
})
