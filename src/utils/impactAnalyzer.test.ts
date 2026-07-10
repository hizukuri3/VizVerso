import { describe, it, expect } from 'vitest'
import { analyzeImpact, buildImpactGraph } from './impactAnalyzer'
import type { TableauDocument, WorksheetPane } from '../types/tableau'

// 影響分析の検証用フィクスチャ。
// Sales <- B <- A の参照チェーン、シート・ダッシュボードの使用、
// パラメータコントロール参照、循環参照を網羅する。
const doc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        { column: 'Profit', isCalc: false, dataType: 'real' },
        { column: 'B', isCalc: true, formula: '[Sales] + 1' },
        { column: 'A', isCalc: true, formula: '[B] * 2' },
        {
          column: 'Lod',
          isCalc: true,
          formula: '{ FIXED [Region] : SUM([Sales]) }',
        },
        {
          column: 'Param1',
          isCalc: true,
          formula: '[B]',
          paramDomainType: 'list',
        },
        { column: 'Region', isCalc: false, dataType: 'string' },
        // 循環参照ペア
        { column: 'CycA', isCalc: true, formula: '[CycB]' },
        { column: 'CycB', isCalc: true, formula: '[CycA]' },
      ],
    },
  ],
  worksheets: [
    { name: 'SheetA', caption: 'シートA', dependencies: ['[A]'] },
    { name: 'SheetSales', dependencies: ['[Sales]', '[Profit]'] },
    { name: 'SheetNone', dependencies: ['[Profit]'] },
  ],
  dashboards: [
    {
      name: 'Dash1',
      worksheets: ['SheetA', 'SheetNone'],
      usedFields: [],
    },
    {
      name: 'DashParam',
      worksheets: ['SheetNone'],
      usedFields: ['[Param1]'],
    },
  ],
}

describe('analyzeImpact', () => {
  it('下流の計算フィールドを推移的に depth 付きで収集すること', () => {
    const result = analyzeImpact(doc, 'Sales')
    expect(result).not.toBeNull()
    const byId = new Map(result!.downstreamFields.map((f) => [f.fieldId, f]))
    // Sales <- B (depth1), Lod (depth1), A (depth2), Param1 (depth2)
    expect(byId.get('B')?.depth).toBe(1)
    expect(byId.get('Lod')?.depth).toBe(1)
    expect(byId.get('A')?.depth).toBe(2)
    expect(byId.get('Param1')?.depth).toBe(2)
    expect(byId.has('Profit')).toBe(false)
  })

  it('パラメータを isParameter として識別すること', () => {
    const result = analyzeImpact(doc, 'B')
    const param = result!.downstreamFields.find((f) => f.fieldId === 'Param1')
    expect(param?.isParameter).toBe(true)
  })

  it('影響フィールドを使用しているシートを検出すること', () => {
    const result = analyzeImpact(doc, 'Sales')
    const names = result!.affectedSheets.map((s) => s.name)
    // SheetA は下流 A 経由、SheetSales は Sales 直接使用
    expect(names).toContain('SheetA')
    expect(names).toContain('SheetSales')
    expect(names).not.toContain('SheetNone')

    const sheetA = result!.affectedSheets.find((s) => s.name === 'SheetA')
    expect(sheetA?.viaFields).toEqual(['A'])
  })

  it('影響シート・パラメータ参照経由でダッシュボードを検出すること', () => {
    const result = analyzeImpact(doc, 'Sales')
    const byName = new Map(result!.affectedDashboards.map((d) => [d.name, d]))
    // Dash1 は SheetA 経由
    expect(byName.get('Dash1')?.viaSheets).toEqual(['SheetA'])
    // DashParam は usedFields の Param1 経由（シート経由ではない）
    expect(byName.get('DashParam')?.viaSheets).toEqual([])
    expect(byName.get('DashParam')?.viaFields).toEqual(['Param1'])
  })

  it('循環参照があっても無限ループせず双方を検出すること', () => {
    const result = analyzeImpact(doc, 'CycA')
    const ids = result!.downstreamFields.map((f) => f.fieldId)
    expect(ids).toEqual(['CycB'])
  })

  it('解決できないフィールドは null を返すこと', () => {
    expect(analyzeImpact(doc, 'Nonexistent')).toBeNull()
  })
})

describe('buildImpactGraph (field ルート)', () => {
  it('上流・下流・シート・ダッシュボードをレイヤー化した DAG を構築すること', () => {
    const graph = buildImpactGraph(doc, { kind: 'field', name: 'B' })
    expect(graph).not.toBeNull()
    const byId = new Map(graph!.nodes.map((n) => [n.id, n]))

    // ルート
    expect(byId.get('f:B')?.isRoot).toBe(true)
    expect(byId.get('f:B')?.column).toBe(0)
    // 上流（Sales）は負の column
    expect(byId.get('f:Sales')?.column).toBe(-1)
    // 下流（A, Param1）は正の column
    expect(byId.get('f:A')?.column).toBe(1)
    expect(byId.get('f:Param1')?.column).toBe(1)
    // シートはフィールドより右、ダッシュボードはさらに右
    const sheet = byId.get('s:SheetA')!
    const dash = byId.get('d:Dash1')!
    expect(sheet.kind).toBe('sheet')
    expect(dash.kind).toBe('dashboard')
    expect(sheet.column).toBeGreaterThan(byId.get('f:A')!.column)
    expect(dash.column).toBeGreaterThan(sheet.column)
  })

  it('依存の流れ（左→右）でエッジを張ること', () => {
    const graph = buildImpactGraph(doc, { kind: 'field', name: 'B' })
    const edgeIds = new Set(graph!.edges.map((e) => `${e.source}->${e.target}`))
    expect(edgeIds.has('f:Sales->f:B')).toBe(true) // 上流 → ルート
    expect(edgeIds.has('f:B->f:A')).toBe(true) // ルート → 下流
    expect(edgeIds.has('f:A->s:SheetA')).toBe(true) // フィールド → シート
    expect(edgeIds.has('s:SheetA->d:Dash1')).toBe(true) // シート → ダッシュボード
    expect(edgeIds.has('f:Param1->d:DashParam')).toBe(true) // パラメータ → ダッシュボード直接
  })

  it('循環参照でもノード・エッジが重複せず停止すること', () => {
    const graph = buildImpactGraph(doc, { kind: 'field', name: 'CycA' })
    expect(graph).not.toBeNull()
    const fieldNodes = graph!.nodes.filter((n) => n.kind === 'field')
    const ids = fieldNodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('f:CycA')
    expect(ids).toContain('f:CycB')
  })

  it('解決できないフィールドは null を返すこと', () => {
    expect(
      buildImpactGraph(doc, { kind: 'field', name: 'Nonexistent' }),
    ).toBeNull()
  })

  it('ノードにツールチップ用メタデータ（計算式・データ型）が乗ること', () => {
    const graph = buildImpactGraph(doc, { kind: 'field', name: 'A' })
    const byId = new Map(graph!.nodes.map((n) => [n.id, n]))
    expect(byId.get('f:A')?.formula).toBe('[B] * 2')
  })

  it('パラメータノードに paramDomainType が乗ること', () => {
    const graph = buildImpactGraph(doc, { kind: 'field', name: 'B' })
    const byId = new Map(graph!.nodes.map((n) => [n.id, n]))
    expect(byId.get('f:Param1')?.paramDomainType).toBe('list')
  })
})

describe('buildImpactGraph (sheet / dashboard ルート)', () => {
  it('sheet ルート: 使用フィールドが左、配置先ダッシュボードが右に並ぶこと', () => {
    const graph = buildImpactGraph(doc, { kind: 'sheet', name: 'SheetA' })
    expect(graph).not.toBeNull()
    const byId = new Map(graph!.nodes.map((n) => [n.id, n]))

    expect(byId.get('s:SheetA')?.isRoot).toBe(true)
    expect(byId.get('s:SheetA')?.column).toBe(0)
    expect(byId.get('f:A')?.column).toBe(-1)
    expect(byId.get('d:Dash1')?.column).toBe(1)

    const edgeIds = new Set(graph!.edges.map((e) => e.id))
    expect(edgeIds.has('f:A->s:SheetA')).toBe(true)
    expect(edgeIds.has('s:SheetA->d:Dash1')).toBe(true)
  })

  it('dashboard ルート: シートとその使用フィールド・直接参照フィールドが左に並ぶこと', () => {
    const graph = buildImpactGraph(doc, {
      kind: 'dashboard',
      name: 'DashParam',
    })
    expect(graph).not.toBeNull()
    const byId = new Map(graph!.nodes.map((n) => [n.id, n]))

    expect(byId.get('d:DashParam')?.isRoot).toBe(true)
    expect(byId.get('d:DashParam')?.column).toBe(0)
    // 構成シート（SheetNone）とその使用フィールド（Profit）
    expect(byId.get('s:SheetNone')?.column).toBe(-1)
    expect(byId.get('f:Profit')?.column).toBe(-2)
    // パラメータコントロール経由の直接参照
    expect(byId.get('f:Param1')?.column).toBe(-1)

    const edgeIds = new Set(graph!.edges.map((e) => e.id))
    expect(edgeIds.has('s:SheetNone->d:DashParam')).toBe(true)
    expect(edgeIds.has('f:Profit->s:SheetNone')).toBe(true)
    expect(edgeIds.has('f:Param1->d:DashParam')).toBe(true)
  })

  it('組み込み疑似フィールド（Measure Names 等）を除外すること', () => {
    const docWithBuiltin: TableauDocument = {
      ...doc,
      worksheets: [
        {
          name: 'SheetB',
          dependencies: ['[Sales]', '[:Measure Names]', '[Measure Values]'],
        },
      ],
    }
    const graph = buildImpactGraph(docWithBuiltin, {
      kind: 'sheet',
      name: 'SheetB',
    })
    const fieldIds = graph!.nodes
      .filter((n) => n.kind === 'field')
      .map((n) => n.fieldId)
    expect(fieldIds).toContain('Sales')
    expect(fieldIds).not.toContain('Measure Names')
    expect(fieldIds).not.toContain('Measure Values')
  })

  it('存在しないシート・ダッシュボードは null を返すこと', () => {
    expect(buildImpactGraph(doc, { kind: 'sheet', name: 'Nope' })).toBeNull()
    expect(
      buildImpactGraph(doc, { kind: 'dashboard', name: 'Nope' }),
    ).toBeNull()
  })
})

// レイヤー内集約（8個超のフィールド層を group ノードに畳む）の検証用フィクスチャ。
// BigSheet は 12 フィールド（calc 2・param 1・生フィールド 9）を使用する。
// Base は 12 個の計算フィールド（D1..D12）から参照される（field ルート集約の検証用）。
const rawFieldNames = Array.from({ length: 9 }, (_, i) => `R${i + 1}`)
const downstreamCalcNames = Array.from({ length: 12 }, (_, i) => `D${i + 1}`)
const bigDoc: TableauDocument = {
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
        { column: 'Base', isCalc: false, dataType: 'real' },
        ...downstreamCalcNames.map((name, i) => ({
          column: name,
          isCalc: true,
          formula: `[Base] + ${i + 1}`,
        })),
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

describe('buildImpactGraph (レイヤー内集約)', () => {
  it('(a) 8個超の層は個別7 + group1 の計8ノードに集約されること', () => {
    // BigSheet の生フィールドはすべて s:BigSheet にのみ接続 = 単一シグネチャ
    const graph = buildImpactGraph(bigDoc, { kind: 'sheet', name: 'BigSheet' })!
    const layer = graph.nodes.filter((n) => n.column === -1)
    expect(layer.length).toBe(8)
    const groups = layer.filter((n) => n.kind === 'group')
    expect(groups.length).toBe(1)
    expect(groups[0].id).toBe('g:-1:0')
    expect(layer.filter((n) => n.kind === 'field').length).toBe(7)
  })

  it('(b) calc/param は個別に残り、group メンバーは生フィールドになること', () => {
    const graph = buildImpactGraph(bigDoc, { kind: 'sheet', name: 'BigSheet' })!
    const ids = new Set(graph.nodes.map((n) => n.id))
    // calc/param（優先度高）は個別ノードとして残る
    expect(ids.has('f:C1')).toBe(true)
    expect(ids.has('f:C2')).toBe(true)
    expect(ids.has('f:P1')).toBe(true)
    const group = graph.nodes.find((n) => n.kind === 'group')!
    // メンバーは生フィールドのみ（calc/param を含まない）
    expect(group.memberFieldIds).toBeDefined()
    expect(
      group.memberFieldIds!.every((id) => rawFieldNames.includes(id)),
    ).toBe(true)
    expect(group.memberFieldIds).not.toContain('C1')
    expect(group.memberFieldIds).not.toContain('P1')
    // メンバーは個別ノードから消えている
    group.memberFieldIds!.forEach((id) => {
      expect(ids.has(`f:${id}`)).toBe(false)
    })
    // メンバーラベルも保持する
    expect(group.memberLabels?.length).toBe(group.memberFieldIds!.length)
  })

  it('(c) メンバー宛エッジが group に付替えられ、エッジ id が重複しないこと', () => {
    const graph = buildImpactGraph(bigDoc, { kind: 'sheet', name: 'BigSheet' })!
    const groupEdges = graph.edges.filter((e) => e.source === 'g:-1:0')
    // 全メンバーの field→sheet エッジが 1 本に集約される
    expect(groupEdges.length).toBe(1)
    expect(groupEdges[0].target).toBe('s:BigSheet')
    const edgeIds = graph.edges.map((e) => e.id)
    expect(new Set(edgeIds).size).toBe(edgeIds.length)
  })

  it('(d) expandedGroups 指定の group は全量個別表示になり group が消えること', () => {
    const graph = buildImpactGraph(
      bigDoc,
      { kind: 'sheet', name: 'BigSheet' },
      { expandedGroups: new Set(['g:-1:0']) },
    )!
    const layer = graph.nodes.filter((n) => n.column === -1)
    expect(layer.some((n) => n.kind === 'group')).toBe(false)
    expect(layer.filter((n) => n.kind === 'field').length).toBe(12)
  })

  it('(e) ルートフィールドは集約されないこと', () => {
    const graph = buildImpactGraph(bigDoc, { kind: 'field', name: 'Base' })!
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    // ルートは残る
    expect(byId.get('f:Base')?.isRoot).toBe(true)
    expect(byId.get('f:Base')?.column).toBe(0)
    // 下流12個の層は集約される（個別7 + group1）
    const downstream = graph.nodes.filter((n) => n.column === 1)
    expect(downstream.filter((n) => n.kind === 'group').length).toBe(1)
    expect(downstream.filter((n) => n.kind === 'field').length).toBe(7)
  })
})

// 接続シグネチャ分割の検証用フィクスチャ。
// SheetX / SheetY が互いに素な生フィールド 16 個ずつを使用する。
// フィールド名は "f{nn}_A"（SheetX）/"f{nn}_B"（SheetY）と交互ソートされるため、
// 個別枠 7 を両シートで分け合っても各シートの余剰が 9 個以上あふれる。
const sigXNames = Array.from(
  { length: 16 },
  (_, i) => `f${String(i + 1).padStart(2, '0')}_A`,
)
const sigYNames = Array.from(
  { length: 16 },
  (_, i) => `f${String(i + 1).padStart(2, '0')}_B`,
)
const twoSigDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [...sigXNames, ...sigYNames].map((name) => ({
        column: name,
        isCalc: false,
        dataType: 'real',
      })),
    },
  ],
  worksheets: [
    { name: 'SheetX', dependencies: sigXNames.map((n) => `[${n}]`) },
    { name: 'SheetY', dependencies: sigYNames.map((n) => `[${n}]`) },
  ],
  dashboards: [
    { name: 'DB', worksheets: ['SheetX', 'SheetY'], usedFields: [] },
  ],
}

describe('buildImpactGraph (接続シグネチャによる複数グループ化)', () => {
  it('(a) 互いに素なシートごとに別 group ができ、エッジが自分のシートにだけ向くこと', () => {
    const graph = buildImpactGraph(twoSigDoc, {
      kind: 'dashboard',
      name: 'DB',
    })!
    const groups = graph.nodes.filter(
      (n) => n.kind === 'group' && n.column === -2,
    )
    expect(groups.length).toBe(2)
    // 各 group のエッジは 1 シートにのみ向く
    const targetsByGroup = groups.map((g) => {
      const targets = new Set(
        graph.edges.filter((e) => e.source === g.id).map((e) => e.target),
      )
      return Array.from(targets)
    })
    targetsByGroup.forEach((targets) => expect(targets.length).toBe(1))
    const allTargets = new Set(targetsByGroup.flat())
    expect(allTargets).toEqual(new Set(['s:SheetX', 's:SheetY']))
    // メンバーはシートごとに分かれる（X/Y の混在なし）
    groups.forEach((g) => {
      const suffixes = new Set(g.memberFieldIds!.map((id) => id.slice(-1)))
      expect(suffixes.size).toBe(1)
    })
  })

  it('(c) 1 つの group を展開しても他の group の id・メンバーが変わらないこと', () => {
    const base = buildImpactGraph(twoSigDoc, { kind: 'dashboard', name: 'DB' })!
    const baseGroups = new Map(
      base.nodes
        .filter((n) => n.kind === 'group')
        .map((g) => [g.id, g.memberFieldIds!]),
    )
    // メンバー数最大のシグネチャが idx 0
    expect(baseGroups.has('g:-2:0')).toBe(true)
    expect(baseGroups.has('g:-2:1')).toBe(true)

    const expanded = buildImpactGraph(
      twoSigDoc,
      { kind: 'dashboard', name: 'DB' },
      { expandedGroups: new Set(['g:-2:0']) },
    )!
    // 展開した group は消える
    expect(expanded.nodes.some((n) => n.id === 'g:-2:0')).toBe(false)
    // もう一方の group は id・メンバーとも不変
    const other = expanded.nodes.find((n) => n.id === 'g:-2:1')!
    expect(other.kind).toBe('group')
    expect(other.memberFieldIds).toEqual(baseGroups.get('g:-2:1'))
  })

  it('(d) 展開したメンバーが個別フィールドノードとして元のエッジを持つこと', () => {
    const base = buildImpactGraph(twoSigDoc, { kind: 'dashboard', name: 'DB' })!
    const g0 = base.nodes.find((n) => n.id === 'g:-2:0')!
    const memberId = g0.memberFieldIds![0]
    // memberId がどちらのシート由来かを判定
    const sheetNode = memberId.endsWith('_A') ? 's:SheetX' : 's:SheetY'

    const expanded = buildImpactGraph(
      twoSigDoc,
      { kind: 'dashboard', name: 'DB' },
      { expandedGroups: new Set(['g:-2:0']) },
    )!
    const ids = new Set(expanded.nodes.map((n) => n.id))
    // 展開メンバーは個別フィールドノードとして復元
    expect(ids.has(`f:${memberId}`)).toBe(true)
    const node = expanded.nodes.find((n) => n.id === `f:${memberId}`)!
    expect(node.kind).toBe('field')
    expect(node.column).toBe(-2)
    // 元のエッジ（フィールド → シート）を持つ
    const edgeIds = new Set(expanded.edges.map((e) => e.id))
    expect(edgeIds.has(`f:${memberId}->${sheetNode}`)).toBe(true)
  })
})

// 4 シグネチャ以上の検証用。4 シートが交互ソートされる生フィールド 8 個ずつを使用。
const fourSigNames: string[] = []
for (let i = 0; i < 8; i++) {
  for (let k = 1; k <= 4; k++) {
    fourSigNames.push(`n${i}_s${k}`)
  }
}
const fourSigDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: fourSigNames.map((name) => ({
        column: name,
        isCalc: false,
        dataType: 'real',
      })),
    },
  ],
  worksheets: [1, 2, 3, 4].map((k) => ({
    name: `Sheet${k}`,
    dependencies: fourSigNames
      .filter((n) => n.endsWith(`_s${k}`))
      .map((n) => `[${n}]`),
  })),
  dashboards: [
    {
      name: 'DB4',
      worksheets: ['Sheet1', 'Sheet2', 'Sheet3', 'Sheet4'],
      usedFields: [],
    },
  ],
}

describe('buildImpactGraph (4 シグネチャ以上の rest 集約)', () => {
  it('(b) 上位 3 シグネチャが独立 group、4 番目以降が rest に入ること', () => {
    const graph = buildImpactGraph(fourSigDoc, {
      kind: 'dashboard',
      name: 'DB4',
    })!
    const ids = new Set(graph.nodes.map((n) => n.id))
    // 上位 3 は独立 group
    expect(ids.has('g:-2:0')).toBe(true)
    expect(ids.has('g:-2:1')).toBe(true)
    expect(ids.has('g:-2:2')).toBe(true)
    // 4 番目以降は rest にまとまる（g:-2:3 は作らない）
    expect(ids.has('g:-2:rest')).toBe(true)
    expect(ids.has('g:-2:3')).toBe(false)
    // rest group も 1 シートにのみ向く
    const restTargets = new Set(
      graph.edges.filter((e) => e.source === 'g:-2:rest').map((e) => e.target),
    )
    expect(restTargets.size).toBe(1)
  })
})

// ノードのその場展開（expandedNodes）の検証。
// トップの doc（A=[B]*2, B=[Sales]+1, SheetA が [A] 使用, Dash1 が SheetA 含む）を使う。
// sheet/dashboard ルートは近傍2層のみ表示するため、上流 calc フィールドの
// 参照先が「未表示の外側隣接」として展開対象になる。
describe('buildImpactGraph (ノードのその場展開)', () => {
  it('(a) sheet ルートの上流 calc フィールドに未表示参照先の expandableCount が乗ること', () => {
    const graph = buildImpactGraph(doc, { kind: 'sheet', name: 'SheetA' })!
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    // f:A は column -1 の calc（[B] 参照）。B は sheet ルートでは未表示 → 1
    expect(byId.get('f:A')?.column).toBe(-1)
    expect(byId.get('f:A')?.expandableCount).toBe(1)
    expect(byId.get('f:A')?.isExpanded).toBeFalsy()
  })

  it('(b) expandedNodes 指定で外側列へノードが追加され、連鎖展開されること', () => {
    // f:A を展開 → f:B が column -2 に、エッジ f:B->f:A、f:A.isExpanded=true
    const g1 = buildImpactGraph(
      doc,
      { kind: 'sheet', name: 'SheetA' },
      { expandedNodes: new Set(['f:A']) },
    )!
    const byId1 = new Map(g1.nodes.map((n) => [n.id, n]))
    expect(byId1.get('f:B')?.column).toBe(-2)
    expect(byId1.get('f:A')?.isExpanded).toBe(true)
    const edges1 = new Set(g1.edges.map((e) => e.id))
    expect(edges1.has('f:B->f:A')).toBe(true)

    // さらに f:B も展開 → f:Sales が column -3 に追加（連鎖展開）
    const g2 = buildImpactGraph(
      doc,
      { kind: 'sheet', name: 'SheetA' },
      { expandedNodes: new Set(['f:A', 'f:B']) },
    )!
    const byId2 = new Map(g2.nodes.map((n) => [n.id, n]))
    expect(byId2.get('f:Sales')?.column).toBe(-3)
    expect(byId2.get('f:B')?.isExpanded).toBe(true)
    const edges2 = new Set(g2.edges.map((e) => e.id))
    expect(edges2.has('f:Sales->f:B')).toBe(true)
  })

  it('(c) dashboard ルートの末端 calc フィールドに expandableCount が乗ること', () => {
    const graph = buildImpactGraph(doc, { kind: 'dashboard', name: 'Dash1' })!
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    // f:A は column -2（SheetA 経由）。参照先 B は未表示 → 1
    expect(byId.get('f:A')?.column).toBe(-2)
    expect(byId.get('f:A')?.expandableCount).toBe(1)
  })

  it('(d) 展開済みノードの expandableCount が 0 になること', () => {
    const graph = buildImpactGraph(
      doc,
      { kind: 'sheet', name: 'SheetA' },
      { expandedNodes: new Set(['f:A']) },
    )!
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    // 展開後は B が表示済みなので f:A の外側隣接は残らない
    expect(byId.get('f:A')?.expandableCount ?? 0).toBe(0)
    expect(byId.get('f:A')?.isExpanded).toBe(true)
    // 新たに現れた f:B は Sales が未表示なので expandableCount=1
    expect(byId.get('f:B')?.expandableCount).toBe(1)
  })

  it('(e) 存在しないノード id は無視され例外にならないこと', () => {
    expect(() =>
      buildImpactGraph(
        doc,
        { kind: 'sheet', name: 'SheetA' },
        { expandedNodes: new Set(['f:DoesNotExist', 's:Nope']) },
      ),
    ).not.toThrow()
    const graph = buildImpactGraph(
      doc,
      { kind: 'sheet', name: 'SheetA' },
      { expandedNodes: new Set(['f:DoesNotExist']) },
    )!
    // 展開なしと同じ（f:A は未展開のまま）
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    expect(byId.get('f:A')?.isExpanded).toBeFalsy()
    expect(byId.has('f:B')).toBe(false)
  })

  it('field ルートの下流シートは隣接表示済みでボタンが出ない（expandableCount=0/undefined）', () => {
    // field ルートは下流のシート・ダッシュボードを全展開するため、
    // 下流シートの外側隣接（含むダッシュボード）は常に表示済み。
    const graph = buildImpactGraph(doc, { kind: 'field', name: 'A' })!
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    expect(byId.get('s:SheetA')?.column).toBe(1)
    expect(byId.get('s:SheetA')?.expandableCount ?? 0).toBe(0)
  })
})

// 棚（shelf）ベースの直接フィールド抽出の検証。
// CalcX = '[Base] * 2'。dependencies は推移閉包で [CalcX],[Sales],[Base] を含むが、
// 棚に直接置かれているのは rows: [CalcX] と color: [Sales] のみ。
// Base（CalcX の参照先）は棚に無く、初期表示されず ±展開で到達する。
const makePane = (
  enc: Partial<WorksheetPane['encodings']> = {},
): WorksheetPane => ({
  markType: '',
  encodings: {
    color: [],
    size: [],
    label: [],
    detail: [],
    tooltip: [],
    shape: [],
    ...enc,
  },
})

const shelfDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        { column: 'Base', isCalc: false, dataType: 'real' },
        { column: 'CalcX', isCalc: true, formula: '[Base] * 2' },
        { column: 'Sales', isCalc: false, dataType: 'real' },
      ],
    },
  ],
  worksheets: [
    {
      name: 'ShelfWS',
      dependencies: ['[CalcX]', '[Sales]', '[Base]'],
      shelf: {
        rows: [{ name: '[CalcX]' }],
        cols: [],
        filters: [],
        panes: [makePane({ color: [{ name: '[Sales]' }] })],
        marks: makePane(),
      },
    },
    {
      // 棚情報なし = dependencies フォールバック経路
      name: 'PlainWS',
      dependencies: ['[CalcX]', '[Sales]', '[Base]'],
    },
  ],
  dashboards: [{ name: 'ShelfDash', worksheets: ['ShelfWS'], usedFields: [] }],
}

describe('buildImpactGraph (棚ベースの直接フィールド抽出)', () => {
  it('(a) sheet ルートで -1 に棚の直接フィールドのみ並び、参照先 Base は現れないこと', () => {
    const graph = buildImpactGraph(shelfDoc, {
      kind: 'sheet',
      name: 'ShelfWS',
    })!
    const layer = graph.nodes.filter((n) => n.column === -1)
    const ids = new Set(layer.map((n) => n.id))
    expect(ids.has('f:CalcX')).toBe(true)
    expect(ids.has('f:Sales')).toBe(true)
    expect(ids.has('f:Base')).toBe(false)
    // -1 は直接フィールド 2 個のみ
    expect(layer.filter((n) => n.kind === 'field').length).toBe(2)
  })

  it('(b) 棚の計算フィールド CalcX に隠れ参照先 Base 分の expandableCount=1 が乗ること', () => {
    const graph = buildImpactGraph(shelfDoc, {
      kind: 'sheet',
      name: 'ShelfWS',
    })!
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    expect(byId.get('f:CalcX')?.column).toBe(-1)
    expect(byId.get('f:CalcX')?.expandableCount).toBe(1)
    expect(byId.get('f:CalcX')?.isExpanded).toBeFalsy()
  })

  it('(c) expandedNodes: f:CalcX で参照先 Base が -2 に追加されること', () => {
    const graph = buildImpactGraph(
      shelfDoc,
      { kind: 'sheet', name: 'ShelfWS' },
      { expandedNodes: new Set(['f:CalcX']) },
    )!
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    expect(byId.get('f:Base')?.column).toBe(-2)
    expect(byId.get('f:CalcX')?.isExpanded).toBe(true)
    const edgeIds = new Set(graph.edges.map((e) => e.id))
    expect(edgeIds.has('f:Base->f:CalcX')).toBe(true)
  })

  it('(d) 棚の無いシートは dependencies フォールバックで全依存が -1 に並ぶこと', () => {
    const graph = buildImpactGraph(shelfDoc, {
      kind: 'sheet',
      name: 'PlainWS',
    })!
    const layer = graph.nodes.filter((n) => n.column === -1)
    const ids = new Set(layer.map((n) => n.id))
    expect(ids.has('f:CalcX')).toBe(true)
    expect(ids.has('f:Sales')).toBe(true)
    expect(ids.has('f:Base')).toBe(true)
    expect(layer.filter((n) => n.kind === 'field').length).toBe(3)
  })

  it('(e) dashboard ルートでも構成シートの -2 が棚の直接フィールドのみになること', () => {
    const graph = buildImpactGraph(shelfDoc, {
      kind: 'dashboard',
      name: 'ShelfDash',
    })!
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    expect(byId.get('s:ShelfWS')?.column).toBe(-1)
    const layer = graph.nodes.filter((n) => n.column === -2)
    const ids = new Set(layer.map((n) => n.id))
    expect(ids.has('f:CalcX')).toBe(true)
    expect(ids.has('f:Sales')).toBe(true)
    expect(ids.has('f:Base')).toBe(false)
  })
})
