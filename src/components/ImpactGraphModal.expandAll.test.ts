import { describe, it, expect } from 'vitest'
import { collectFullExpansion } from './ImpactGraphModal'
import { buildImpactGraph } from '../utils/impactAnalyzer'
import type { TableauDocument } from '../types/tableau'

// 多段チェーンのフィクスチャ。
// SheetChain は [A] のみを棚に置く。A = [B] * 2、B = [Sales] + 1、Sales は生フィールド。
// sheet ルートでは初期表示は A のみで、B・Sales は「外側隣接」として順に展開される。
// A を展開すると B が現れ、その B も新たに expandable になる（= 1回では終わらない）。
const chainDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        { column: 'B', isCalc: true, formula: '[Sales] + 1' },
        { column: 'A', isCalc: true, formula: '[B] * 2' },
      ],
    },
  ],
  worksheets: [{ name: 'SheetChain', dependencies: ['[A]'] }],
  dashboards: [],
}

// 集約グループを含むフィクスチャ。
// BigSheet は生フィールド R1..R9（9個）+ 計算 C1,C2 + パラメータ P1 の 12 フィールドを使う。
// 12 > 閾値 8 のため -1 列で集約が発生し group ノードが作られる。
const rawFieldNames = Array.from({ length: 9 }, (_, i) => `R${i + 1}`)
const groupDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        ...rawFieldNames.map((name) => ({
          column: name,
          isCalc: false,
          dataType: 'real',
        })),
        { column: 'C1', isCalc: true, formula: '[R1] + 1' },
        { column: 'C2', isCalc: true, formula: '[R2] + 1' },
        {
          column: 'P1',
          isCalc: true,
          formula: '[R3]',
          paramDomainType: 'list',
        },
      ],
    },
  ],
  worksheets: [
    {
      name: 'BigSheet',
      dependencies: [
        ...rawFieldNames.map((n) => `[${n}]`),
        '[C1]',
        '[C2]',
        '[P1]',
      ],
    },
  ],
  dashboards: [],
}

/** 指定セットで構築したグラフに、未展開の展開余地（ノード or group）が残っていないか */
function hasResidualExpansion(
  doc: TableauDocument,
  root: Parameters<typeof buildImpactGraph>[1],
  groups: ReadonlySet<string>,
  nodes: ReadonlySet<string>,
): boolean {
  const graph = buildImpactGraph(doc, root, {
    expandedGroups: groups,
    expandedNodes: nodes,
  })!
  return graph.nodes.some(
    (n) =>
      n.kind === 'group' || ((n.expandableCount ?? 0) > 0 && !n.isExpanded),
  )
}

describe('collectFullExpansion', () => {
  it('(1a) 多段チェーンで固定点まで展開し、展開余地が残らないこと', () => {
    const root = { kind: 'sheet' as const, name: 'SheetChain' }
    const { groups, nodes } = collectFullExpansion(
      chainDoc,
      root,
      new Set(),
      new Set(),
    )
    // A → B → Sales の連鎖がすべて展開され、A・B が展開集合に入る
    expect(nodes.has('f:A')).toBe(true)
    expect(nodes.has('f:B')).toBe(true)
    // 固定点到達後は展開可能な未展開ノード・未展開 group が残らない
    expect(hasResidualExpansion(chainDoc, root, groups, nodes)).toBe(false)
  })

  it('(1b) group を含む層で全 group が展開され、展開余地が残らないこと', () => {
    const root = { kind: 'sheet' as const, name: 'BigSheet' }
    // まず集約 group が実在することを確認
    const base = buildImpactGraph(groupDoc, root)!
    const baseGroups = base.nodes.filter((n) => n.kind === 'group')
    expect(baseGroups.length).toBeGreaterThan(0)

    const { groups, nodes } = collectFullExpansion(
      groupDoc,
      root,
      new Set(),
      new Set(),
    )
    // 実在した group がすべて展開集合に含まれる
    baseGroups.forEach((g) => expect(groups.has(g.id)).toBe(true))
    // 固定点到達後は group も expandable ノードも残らない
    expect(hasResidualExpansion(groupDoc, root, groups, nodes)).toBe(false)
  })

  it('(2) 引数の base セットを破壊しないこと', () => {
    const baseGroups = new Set<string>(['g:-1:0'])
    const baseNodes = new Set<string>(['f:A'])
    collectFullExpansion(
      chainDoc,
      { kind: 'sheet', name: 'SheetChain' },
      baseGroups,
      baseNodes,
    )
    expect(Array.from(baseGroups)).toEqual(['g:-1:0'])
    expect(Array.from(baseNodes)).toEqual(['f:A'])
  })

  it('(3) 全展開済みの状態で呼んでも冪等（同じ結果）になること', () => {
    const root = { kind: 'sheet' as const, name: 'BigSheet' }
    const first = collectFullExpansion(groupDoc, root, new Set(), new Set())
    const second = collectFullExpansion(
      groupDoc,
      root,
      first.groups,
      first.nodes,
    )
    expect(Array.from(second.groups).sort()).toEqual(
      Array.from(first.groups).sort(),
    )
    expect(Array.from(second.nodes).sort()).toEqual(
      Array.from(first.nodes).sort(),
    )
  })
})
