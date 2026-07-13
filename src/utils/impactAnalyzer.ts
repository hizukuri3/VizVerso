import type {
  TableauDocument,
  TableauWorksheet,
  ShelfField,
  WorksheetPane,
} from '../types/tableau'
import { normalizeFieldId, BUILTIN_FIELD_NAMES } from './xmlParser'
import { classifyFormula, type CalcType } from './calcClassifier'
import { buildFieldMap, extractFieldRefs } from './dependencyTree'

const BUILTIN_SET = new Set<string>(BUILTIN_FIELD_NAMES)

/** 依存フィールドID列を正規化し、組み込み疑似フィールド・空を除いて重複排除する */
function sheetFieldIds(deps: string[]): string[] {
  const seen = new Set<string>()
  for (const dep of deps) {
    const id = normalizeFieldId(dep)
    if (id && !BUILTIN_SET.has(id)) seen.add(id)
  }
  return Array.from(seen)
}

/**
 * ワークシートの棚（rows/cols/filters/各ペインのエンコーディング）に
 * 「直接置かれた」フィールドIDだけを返す。計算チェーンの奥（dependencies に
 * 含まれるが棚には無いフィールド）は初期表示せず、±展開で到達させるための起点。
 * 棚情報が無い、または抽出結果が空の場合は dependencies にフォールバックする
 * （この経路は従来挙動を完全に維持する）。
 */
export function directSheetFieldIds(ws: TableauWorksheet): string[] {
  const shelf = ws.shelf
  if (!shelf) return sheetFieldIds(ws.dependencies)

  const seen = new Set<string>()
  const add = (fields: ShelfField[] | undefined) => {
    if (!fields) return
    for (const f of fields) {
      const id = normalizeFieldId(f.name)
      if (id && !BUILTIN_SET.has(id)) seen.add(id)
    }
  }
  const addPane = (pane: WorksheetPane | undefined) => {
    if (!pane) return
    const enc = pane.encodings
    add(enc.color)
    add(enc.size)
    add(enc.label)
    add(enc.detail)
    add(enc.tooltip)
    add(enc.shape)
  }

  add(shelf.rows)
  add(shelf.cols)
  add(shelf.filters)
  shelf.panes?.forEach(addPane)
  addPane(shelf.marks) // 互換メインペイン

  // 棚から何も取れなければ従来どおり dependencies を用いる
  if (seen.size === 0) return sheetFieldIds(ws.dependencies)
  return Array.from(seen)
}

/**
 * 影響分析: 指定フィールドを変更・削除した場合に波及する範囲
 * （下流の計算フィールド → シート → ダッシュボード）を推移的に解析する。
 * SideDrawer の影響サマリと ImpactGraphModal の依存グラフの基礎データとなる。
 */

/** 影響を受ける計算フィールド1件 */
export interface ImpactFieldEntry {
  fieldId: string // 正規化済みフィールドID
  caption: string // 表示名（キャプション未設定時はID）
  calcType: CalcType | null
  isParameter: boolean
  depth: number // ルートからの参照段数（1 = 直接参照）
}

/** 影響を受けるワークシート1件 */
export interface ImpactSheetEntry {
  name: string
  caption?: string
  viaFields: string[] // このシートが直接使用している影響フィールドID
}

/** 影響を受けるダッシュボード1件 */
export interface ImpactDashboardEntry {
  name: string
  caption?: string
  viaSheets: string[] // 影響シート経由
  viaFields: string[] // パラメータコントロール等の直接参照経由
}

export interface ImpactResult {
  rootId: string
  rootCaption: string
  downstreamFields: ImpactFieldEntry[] // depth 昇順
  affectedSheets: ImpactSheetEntry[]
  affectedDashboards: ImpactDashboardEntry[]
}

/**
 * 正規化フィールドID → そのフィールドを計算式内で参照しているフィールドID群
 * の逆引きマップを構築する。
 */
function buildReverseRefMap(doc: TableauDocument): Map<string, Set<string>> {
  const map = buildFieldMap(doc)
  const reverse = new Map<string, Set<string>>()
  map.forEach((field, id) => {
    if (!field.formula) return
    extractFieldRefs(field.formula, id).forEach((ref) => {
      if (!reverse.has(ref)) reverse.set(ref, new Set())
      reverse.get(ref)!.add(id)
    })
  })
  return reverse
}

/**
 * 指定フィールドの下流影響（推移的な参照元・使用シート・ダッシュボード）を解析する。
 * @returns ルートが解決できない場合は null
 */
export function analyzeImpact(
  doc: TableauDocument,
  rootFieldName: string,
): ImpactResult | null {
  const fieldMap = buildFieldMap(doc)
  const rootId = normalizeFieldId(rootFieldName)
  if (!rootId || !fieldMap.has(rootId)) return null

  const reverse = buildReverseRefMap(doc)

  // BFS で下流の計算フィールドを推移的に収集（循環参照は visited で打ち切り）
  const visited = new Set<string>([rootId])
  const downstreamFields: ImpactFieldEntry[] = []
  let frontier = [rootId]
  let depth = 0
  while (frontier.length > 0) {
    depth++
    const next: string[] = []
    for (const id of frontier) {
      for (const consumer of reverse.get(id) || []) {
        if (visited.has(consumer)) continue
        visited.add(consumer)
        const field = fieldMap.get(consumer)
        downstreamFields.push({
          fieldId: consumer,
          caption: field?.caption || consumer,
          calcType: field?.formula ? classifyFormula(field.formula) : null,
          isParameter: !!field?.paramDomainType,
          depth,
        })
        next.push(consumer)
      }
    }
    frontier = next
  }

  // 影響フィールド集合（ルート自身を含む）を直接使用しているシート
  const affectedSheets: ImpactSheetEntry[] = []
  doc.worksheets.forEach((ws) => {
    const via = new Set<string>()
    ws.dependencies.forEach((dep) => {
      const id = normalizeFieldId(dep)
      if (visited.has(id)) via.add(id)
    })
    if (via.size > 0) {
      affectedSheets.push({
        name: ws.name,
        caption: ws.caption,
        viaFields: Array.from(via),
      })
    }
  })

  // 影響シートを含む、または影響フィールドを直接参照しているダッシュボード
  const affectedSheetNames = new Set(affectedSheets.map((s) => s.name))
  const affectedDashboards: ImpactDashboardEntry[] = []
  doc.dashboards.forEach((db) => {
    const viaSheets = db.worksheets.filter((ws) => affectedSheetNames.has(ws))
    const viaFields = (db.usedFields || [])
      .map((f) => normalizeFieldId(f))
      .filter((id) => visited.has(id))
    if (viaSheets.length > 0 || viaFields.length > 0) {
      affectedDashboards.push({
        name: db.name,
        caption: db.caption,
        viaSheets,
        viaFields: Array.from(new Set(viaFields)),
      })
    }
  })

  const rootField = fieldMap.get(rootId)
  return {
    rootId,
    rootCaption: rootField?.caption || rootId,
    downstreamFields,
    affectedSheets,
    affectedDashboards,
  }
}

// ────────────────────────────────────────
// 依存グラフの構築（フィールド / シート / ダッシュボードを中心にできる）
// ────────────────────────────────────────

export type ImpactNodeKind = 'field' | 'sheet' | 'dashboard'

/** 集約ノードの発火閾値と個別表示枠数（レイヤー内集約） */
const GROUP_LAYER_THRESHOLD = 8
const GROUP_INDIVIDUAL_SLOTS = 7
/** 独立 group にするシグネチャの最大数（超過分は rest にまとめる） */
const GROUP_MAX_SIGNATURES = 3
/** group を作る最小メンバー数。1件では畳む意味がない（節約ゼロで1クリック増えるだけ） */
const GROUP_MIN_MEMBERS = 2

/** 依存グラフのルート参照。name はフィールド名またはシート/ダッシュボード名 */
export interface GraphRootRef {
  kind: ImpactNodeKind
  name: string
}

/** 依存グラフの1ノード。column は左→右のレイヤー位置（0 = ルート） */
export interface ImpactGraphNode {
  id: string // グラフ内で一意なID（kind プレフィックス付き）
  kind: ImpactNodeKind | 'group' // 'group' = ロジックを持たないフィールドを畳んだ集約ノード
  label: string
  column: number // 負 = 上流（参照元・構成要素）、0 = ルート、正 = 下流（影響先）
  isRoot: boolean
  isCalc: boolean
  calcType: CalcType | null
  isParameter: boolean
  isUnresolved: boolean
  fieldId?: string // kind === 'field' の場合の正規化フィールドID
  entityName?: string // kind === 'sheet' | 'dashboard' の場合の実体名
  memberFieldIds?: string[] // kind === 'group' の場合の集約メンバーの正規化フィールドID
  memberLabels?: string[] // kind === 'group' の場合の集約メンバー表示名（memberFieldIds と同順）
  formula?: string // kind === 'field' の計算フィールドの計算式（未整形の原文）
  dataType?: string // kind === 'field' のデータ型
  paramValue?: string // パラメータの現在値
  paramDomainType?: 'list' | 'range' | 'any' // パラメータのドメイン種別
  /** 隠れている外側隣接ノード数（0 または undefined ならその場展開ボタン非表示） */
  expandableCount?: number
  /** expandedNodes に含まれ、外側隣接をマージ済みなら true */
  isExpanded?: boolean
}

export interface ImpactGraphEdge {
  id: string
  source: string // 依存の流れ（参照元 → 参照先の逆、左 → 右）
  target: string
}

export interface ImpactGraph {
  nodes: ImpactGraphNode[]
  edges: ImpactGraphEdge[]
  /** ノード数上限に達して省略が発生した場合 true */
  truncated: boolean
}

/** 外側隣接ノードの記述子（展開・expandableCount 算出で共有） */
type OuterDesc =
  | { kind: 'field'; key: string; fieldId: string }
  | { kind: 'sheet'; key: string; name: string; caption?: string }
  | { kind: 'dashboard'; key: string; name: string; caption?: string }

const fieldNodeId = (id: string) => `f:${id}`
const sheetNodeId = (name: string) => `s:${name}`
const dashNodeId = (name: string) => `d:${name}`

/** 上流・下流それぞれの最大展開深度 */
const GRAPH_MAX_DEPTH = 10
/** フィールドノード数の上限（巨大ワークブックでの描画破綻防止） */
const GRAPH_MAX_FIELD_NODES = 200

/**
 * 指定オブジェクトを中心とした依存グラフを構築する。
 *
 * - field ルート: 上流の計算式チェーン ← ルート → 下流の計算式 → シート → ダッシュボード
 *   （影響分析の全体像）
 * - sheet ルート: 使用フィールド ← ルート → 配置先ダッシュボード（局所的な近傍）
 * - dashboard ルート: 使用フィールド ← 構成シート ← ルート（局所的な近傍）
 *
 * sheet / dashboard ルートは計算式チェーンを展開しない。フィールドノードを
 * クリックして中心を切り替えることで深掘りする（インタラクティブ探索）想定。
 * @returns ルートが解決できない場合は null
 */
export function buildImpactGraph(
  doc: TableauDocument,
  root: GraphRootRef,
  options: {
    expandedGroups?: ReadonlySet<string>
    expandedNodes?: ReadonlySet<string>
  } = {},
): ImpactGraph | null {
  const fieldMap = buildFieldMap(doc)
  const nodes = new Map<string, ImpactGraphNode>()
  const edges = new Map<string, ImpactGraphEdge>()
  const expandedGroups = options.expandedGroups ?? new Set<string>()
  const expandedNodes = options.expandedNodes ?? new Set<string>()
  // 逆引きマップは重いので展開・下流解析で必要になったとき一度だけ構築する
  let reverseCache: Map<string, Set<string>> | null = null
  const getReverse = () => (reverseCache ??= buildReverseRefMap(doc))
  let truncated = false

  const fieldNodeCount = () =>
    Array.from(nodes.values()).filter((n) => n.kind === 'field').length

  const addFieldNode = (id: string, column: number, isRoot = false): void => {
    const key = fieldNodeId(id)
    if (nodes.has(key)) return
    const field = fieldMap.get(id)
    nodes.set(key, {
      id: key,
      kind: 'field',
      label: field?.caption || id,
      column,
      isRoot,
      isCalc: !!(field?.isCalc && field.formula),
      calcType: field?.formula ? classifyFormula(field.formula) : null,
      isParameter: !!field?.paramDomainType,
      isUnresolved: !field,
      fieldId: id,
      formula: field?.formula,
      dataType: field?.dataType,
      paramValue: field?.value !== undefined ? String(field.value) : undefined,
      paramDomainType: field?.paramDomainType,
    })
  }

  const addEntityNode = (
    kind: 'sheet' | 'dashboard',
    name: string,
    caption: string | undefined,
    column: number,
    isRoot = false,
  ): void => {
    const key = kind === 'sheet' ? sheetNodeId(name) : dashNodeId(name)
    if (nodes.has(key)) return
    nodes.set(key, {
      id: key,
      kind,
      label: caption || name,
      column,
      isRoot,
      isCalc: false,
      calcType: null,
      isParameter: false,
      isUnresolved: false,
      entityName: name,
    })
  }

  const addEdge = (source: string, target: string): void => {
    const id = `${source}->${target}`
    if (!edges.has(id)) edges.set(id, { id, source, target })
  }

  /**
   * ノードの「外側隣接」（ルートから見て一つ外側の依存先）を列挙する。
   * s = sign(column)。s<0 は上流（さらに左）、s>0 は下流（さらに右）へ伸びる。
   * dashboard / group / ルート（column 0）は展開対象外で空を返す。
   */
  const outerNeighbors = (node: ImpactGraphNode): OuterDesc[] => {
    const s = Math.sign(node.column)
    if (s === 0) return []
    const out: OuterDesc[] = []
    if (node.kind === 'field') {
      const fid = node.fieldId
      if (!fid) return []
      if (s < 0) {
        // 上流: 計算式が参照するフィールド
        const field = fieldMap.get(fid)
        if (field?.formula) {
          for (const ref of extractFieldRefs(field.formula, fid)) {
            out.push({ kind: 'field', key: fieldNodeId(ref), fieldId: ref })
          }
        }
      } else {
        // 下流: 参照する計算フィールド + 使用シート + 直接参照ダッシュボード
        for (const consumer of getReverse().get(fid) ?? []) {
          out.push({
            kind: 'field',
            key: fieldNodeId(consumer),
            fieldId: consumer,
          })
        }
        doc.worksheets.forEach((ws) => {
          if (sheetFieldIds(ws.dependencies).includes(fid)) {
            out.push({
              kind: 'sheet',
              key: sheetNodeId(ws.name),
              name: ws.name,
              caption: ws.caption,
            })
          }
        })
        doc.dashboards.forEach((db) => {
          if (sheetFieldIds(db.usedFields || []).includes(fid)) {
            out.push({
              kind: 'dashboard',
              key: dashNodeId(db.name),
              name: db.name,
              caption: db.caption,
            })
          }
        })
      }
    } else if (node.kind === 'sheet') {
      const name = node.entityName
      if (!name) return []
      if (s < 0) {
        // ダッシュボードの構成シート: 棚に直接置かれたフィールドのみ
        // （初期表示と同じ基準に揃える。チェーンの奥はフィールド側の±で掘る）
        const ws = doc.worksheets.find((w) => w.name === name)
        if (ws) {
          directSheetFieldIds(ws).forEach((id) => {
            out.push({ kind: 'field', key: fieldNodeId(id), fieldId: id })
          })
        }
      } else {
        // 下流: このシートを含むダッシュボード
        doc.dashboards.forEach((db) => {
          if (db.worksheets.includes(name)) {
            out.push({
              kind: 'dashboard',
              key: dashNodeId(db.name),
              name: db.name,
              caption: db.caption,
            })
          }
        })
      }
    }
    return out
  }

  /** 外側隣接ノードを column = node.column + s に追加し、依存方向どおりのエッジを張る */
  const addOuterNeighbor = (node: ImpactGraphNode, nb: OuterDesc): void => {
    const s = Math.sign(node.column)
    if (!nodes.has(nb.key)) {
      if (nb.kind === 'field') {
        if (fieldNodeCount() >= GRAPH_MAX_FIELD_NODES) {
          truncated = true
          return
        }
        addFieldNode(nb.fieldId, node.column + s)
      } else {
        addEntityNode(nb.kind, nb.name, nb.caption, node.column + s)
      }
    }
    // 参照元 → 参照先（左 → 右）。上流展開なら新ノードが source。
    if (s < 0) addEdge(nb.key, node.id)
    else addEdge(node.id, nb.key)
  }

  /**
   * expandedNodes に含まれるノードの外側隣接をマージする。
   * 展開で追加したノードがさらに expandedNodes に含まれれば連鎖的に処理する
   * （processed 集合で無限ループを防止）。
   */
  const applyExpansions = (): void => {
    if (expandedNodes.size === 0) return
    const processed = new Set<string>()
    const queue: string[] = []
    nodes.forEach((n) => {
      if (expandedNodes.has(n.id)) queue.push(n.id)
    })
    while (queue.length > 0) {
      const key = queue.shift()!
      if (processed.has(key)) continue
      processed.add(key)
      const node = nodes.get(key)
      // dashboard / group / ルートは展開対象外
      if (!node || (node.kind !== 'field' && node.kind !== 'sheet')) continue
      if (Math.sign(node.column) === 0) continue
      node.isExpanded = true
      for (const nb of outerNeighbors(node)) {
        addOuterNeighbor(node, nb)
        if (expandedNodes.has(nb.key) && !processed.has(nb.key)) {
          queue.push(nb.key)
        }
      }
    }
  }

  /**
   * 集約後の最終ノード集合に対し、各展開可能ノードの expandableCount を算出する。
   * 個別ノードとしても group メンバーとしても存在しない外側隣接だけを数える。
   */
  const computeExpandableCounts = (): void => {
    const groupMembers = new Set<string>()
    nodes.forEach((n) => {
      if (n.kind === 'group') {
        n.memberFieldIds?.forEach((id) => groupMembers.add(id))
      }
    })
    const isHidden = (nb: OuterDesc): boolean => {
      if (nb.kind === 'field') {
        return !nodes.has(nb.key) && !groupMembers.has(nb.fieldId)
      }
      return !nodes.has(nb.key)
    }
    nodes.forEach((n) => {
      if (n.kind !== 'field' && n.kind !== 'sheet') return
      if (n.isRoot || Math.sign(n.column) === 0) return
      let count = 0
      for (const nb of outerNeighbors(n)) if (isHidden(nb)) count++
      if (count > 0) n.expandableCount = count
    })
  }

  /**
   * 表示中のフィールドノード同士の依存参照をエッジとして補完する。
   * sheet / dashboard ルートは「フィールド → 実体」の星形エッジしか張らないため、
   * 棚上の計算フィールドが同じく表示中のフィールドを参照していてもエッジが無い。
   * 集約前に張ることで、group に畳まれたメンバーへの参照も group 宛てに付替えられる。
   */
  const connectVisibleFieldEdges = (): void => {
    nodes.forEach((n) => {
      if (n.kind !== 'field' || !n.fieldId) return
      const field = fieldMap.get(n.fieldId)
      if (!field?.formula) return
      for (const ref of extractFieldRefs(field.formula, n.fieldId)) {
        const key = fieldNodeId(ref)
        if (nodes.has(key)) addEdge(key, n.id)
      }
    })
  }

  const result = () => {
    applyExpansions()
    // 再層化は BFS が張った依存エッジのみを対象にする。
    // connectVisibleFieldEdges は sheet/dashboard ルートで棚上フィールド同士の
    // 同一列エッジを意図的に張る（集約で密度を処理する）設計なので、その前に走らせて
    // 意図的な同一列エッジを押し出さないようにする。
    enforceLayering(nodes, edges)
    connectVisibleFieldEdges()
    aggregateLayers(nodes, edges, expandedGroups)
    computeExpandableCounts()
    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
      truncated,
    }
  }

  // ── sheet ルート: 使用フィールド ← シート → 配置先ダッシュボード ──
  if (root.kind === 'sheet') {
    const ws = doc.worksheets.find((w) => w.name === root.name)
    if (!ws) return null
    addEntityNode('sheet', ws.name, ws.caption, 0, true)
    // 棚に直接置かれたフィールドだけを初期表示（奥の計算チェーンは±展開で到達）
    directSheetFieldIds(ws).forEach((id) => {
      if (fieldNodeCount() >= GRAPH_MAX_FIELD_NODES) {
        truncated = true
        return
      }
      addFieldNode(id, -1)
      addEdge(fieldNodeId(id), sheetNodeId(ws.name))
    })
    doc.dashboards.forEach((db) => {
      if (!db.worksheets.includes(ws.name)) return
      addEntityNode('dashboard', db.name, db.caption, 1)
      addEdge(sheetNodeId(ws.name), dashNodeId(db.name))
    })
    return result()
  }

  // ── dashboard ルート: 使用フィールド ← 構成シート ← ダッシュボード ──
  if (root.kind === 'dashboard') {
    const db = doc.dashboards.find((d) => d.name === root.name)
    if (!db) return null
    addEntityNode('dashboard', db.name, db.caption, 0, true)
    db.worksheets.forEach((wsName) => {
      const ws = doc.worksheets.find((w) => w.name === wsName)
      addEntityNode('sheet', wsName, ws?.caption, -1)
      addEdge(sheetNodeId(wsName), dashNodeId(db.name))
      // 構成シートも棚の直接フィールドのみ（奥の計算チェーンは±展開で到達）
      ;(ws ? directSheetFieldIds(ws) : []).forEach((id) => {
        if (fieldNodeCount() >= GRAPH_MAX_FIELD_NODES) {
          truncated = true
          return
        }
        addFieldNode(id, -2)
        addEdge(fieldNodeId(id), sheetNodeId(wsName))
      })
    })
    // パラメータコントロール・動的ゾーン表示が直接参照するフィールド
    sheetFieldIds(db.usedFields || []).forEach((id) => {
      if (fieldNodeCount() >= GRAPH_MAX_FIELD_NODES) {
        truncated = true
        return
      }
      addFieldNode(id, -1)
      addEdge(fieldNodeId(id), dashNodeId(db.name))
    })
    return result()
  }

  // ── field ルート: 上流チェーン ← ルート → 下流チェーン → シート → ダッシュボード ──
  const rootId = normalizeFieldId(root.name)
  if (!rootId || !fieldMap.has(rootId)) return null

  addFieldNode(rootId, 0, true)

  // 上流: ルートの計算式から参照フィールドを再帰展開（column は負方向）
  {
    const visited = new Set<string>([rootId])
    let frontier = [rootId]
    let depth = 0
    while (frontier.length > 0 && depth < GRAPH_MAX_DEPTH) {
      depth++
      const next: string[] = []
      for (const id of frontier) {
        const field = fieldMap.get(id)
        if (!field?.formula) continue
        for (const ref of extractFieldRefs(field.formula, id)) {
          if (fieldNodeCount() >= GRAPH_MAX_FIELD_NODES) {
            truncated = true
            break
          }
          // 既訪問でもエッジは張る（DAG の合流を表現）。循環はスキップ。
          addFieldNode(ref, -depth)
          addEdge(fieldNodeId(ref), fieldNodeId(id))
          if (!visited.has(ref)) {
            visited.add(ref)
            next.push(ref)
          }
        }
      }
      frontier = next
    }
  }

  // 下流: 逆引きマップで参照元を推移的に展開（column は正方向）
  const reverse = getReverse()
  const impactedIds = new Set<string>([rootId])
  let maxDownstreamColumn = 0
  {
    const visited = new Set<string>([rootId])
    let frontier = [rootId]
    let depth = 0
    while (frontier.length > 0 && depth < GRAPH_MAX_DEPTH) {
      depth++
      const next: string[] = []
      for (const id of frontier) {
        for (const consumer of reverse.get(id) || []) {
          if (fieldNodeCount() >= GRAPH_MAX_FIELD_NODES) {
            truncated = true
            break
          }
          // 上流にも現れたノード（循環等）は位置を動かさずエッジのみ追加
          addFieldNode(consumer, depth)
          addEdge(fieldNodeId(id), fieldNodeId(consumer))
          impactedIds.add(consumer)
          if (!visited.has(consumer)) {
            visited.add(consumer)
            maxDownstreamColumn = Math.max(maxDownstreamColumn, depth)
            next.push(consumer)
          }
        }
      }
      frontier = next
    }
  }

  // シート: 影響フィールドを直接使用しているワークシート
  const sheetColumn = maxDownstreamColumn + 1
  const affectedSheetNames = new Set<string>()
  doc.worksheets.forEach((ws) => {
    const via = new Set<string>()
    ws.dependencies.forEach((dep) => {
      const id = normalizeFieldId(dep)
      if (impactedIds.has(id)) via.add(id)
    })
    if (via.size === 0) return
    affectedSheetNames.add(ws.name)
    addEntityNode('sheet', ws.name, ws.caption, sheetColumn)
    via.forEach((id) => addEdge(fieldNodeId(id), sheetNodeId(ws.name)))
  })

  // ダッシュボード: 影響シートを含む、または影響フィールドを直接参照
  const dashColumn = sheetColumn + 1
  doc.dashboards.forEach((db) => {
    const viaSheets = db.worksheets.filter((ws) => affectedSheetNames.has(ws))
    const viaFields = Array.from(
      new Set(
        (db.usedFields || [])
          .map((f) => normalizeFieldId(f))
          .filter((id) => impactedIds.has(id)),
      ),
    )
    if (viaSheets.length === 0 && viaFields.length === 0) return
    addEntityNode('dashboard', db.name, db.caption, dashColumn)
    viaSheets.forEach((ws) => addEdge(sheetNodeId(ws), dashNodeId(db.name)))
    viaFields.forEach((id) => addEdge(fieldNodeId(id), dashNodeId(db.name)))
  })

  return result()
}

/**
 * 列割当の再層化（最長路ベース）。
 * BFS は「最初に到達した深さ」で column を確定するため、別経路で先に
 * 浅い列へ置かれたノードが自分の参照先と同列（またはより右）になることがある
 * （例: パラメータが深さの異なる複数の計算式から参照される場合）。
 * エッジは常に 参照元 → 参照先（左 → 右）なので、違反エッジを
 * - 上流側: source を target の1つ左へ押し出す
 * - 下流側: target を source の1つ右へ押し出す
 * ことで解消する。ルートと、側をまたぐエッジ（循環由来）は動かさない。
 * 下流フィールドが右へ押し出されるとシート列と重なりうるため、
 * 最後にシート・ダッシュボード列を最深フィールド列の右へ揃え直す。
 */
function enforceLayering(
  nodes: Map<string, ImpactGraphNode>,
  edges: Map<string, ImpactGraphEdge>,
): void {
  // Bellman-Ford と同様、ノード数が反復回数の上限（循環時の無限ループ防止）
  const maxPasses = nodes.size
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false
    edges.forEach((e) => {
      const s = nodes.get(e.source)
      const t = nodes.get(e.target)
      if (!s || !t || s.column < t.column) return
      if (s.column <= 0 && t.column <= 0 && !s.isRoot && s.kind === 'field') {
        s.column = t.column - 1
        changed = true
      } else if (
        s.column >= 0 &&
        t.column >= 0 &&
        !t.isRoot &&
        t.kind === 'field'
      ) {
        t.column = s.column + 1
        changed = true
      }
    })
    if (!changed) break
  }

  // 下流側のシート層・ダッシュボード層を一枚岩のまま右へずらす
  let maxDownField = 0
  let hasDownSheet = false
  let hasDownDash = false
  nodes.forEach((n) => {
    if (n.column <= 0) return
    if (n.kind === 'field') maxDownField = Math.max(maxDownField, n.column)
    else if (n.kind === 'sheet') hasDownSheet = true
    else if (n.kind === 'dashboard') hasDownDash = true
  })
  if (!hasDownSheet && !hasDownDash) return
  const sheetColumn = maxDownField + 1
  const dashColumn = hasDownSheet ? sheetColumn + 1 : sheetColumn
  nodes.forEach((n) => {
    if (n.column <= 0) return
    if (n.kind === 'sheet') n.column = sheetColumn
    else if (n.kind === 'dashboard') n.column = dashColumn
  })
}

/** 集約グループの定義（expandedGroups 適用前に確定する） */
interface GroupDef {
  id: string
  column: number
  members: ImpactGraphNode[]
}

/**
 * グラフ構築の最後に、各レイヤーのフィールドノードを集約する。
 * ロジック（計算式・パラメータ）を持たない生フィールドが 1 層に大量に並ぶと
 * 一覧性が損なわれるため、優先度の低いものを group ノードに畳む。
 *
 * - 集約対象はフィールドノードのみ。sheet/dashboard・ルートは絶対に畳まない。
 * - 層のフィールド数が閾値以下なら何もしない。
 * - あふれたメンバーは「接続シグネチャ」（付替え前のエッジで接続する相手ノードID群を
 *   方向無視でソート連結した文字列）で分割し、上位 3 シグネチャを独立 group
 *   （`g:${column}:${idx}`）に、4 番目以降を rest group（`g:${column}:rest`）にまとめる。
 * - id の安定性のため、シグネチャ計算と idx 割当は expandedGroups 適用前に行い、
 *   そのあとで展開対象の group だけメンバー個別ノードへ戻す。
 * - エッジはメンバー宛のものを group ノードへ付替え、重複排除する。
 *   メンバー間の内部エッジ（付替え後に source === target）は捨てる。
 */
function aggregateLayers(
  nodes: Map<string, ImpactGraphNode>,
  edges: Map<string, ImpactGraphEdge>,
  expandedGroups: ReadonlySet<string>,
): void {
  // 付替え前（原エッジ）の無向隣接。シグネチャ算出と優先度の第2キーに使う
  const neighbors = new Map<string, Set<string>>()
  const edgeCount = new Map<string, number>()
  edges.forEach((e) => {
    if (!neighbors.has(e.source)) neighbors.set(e.source, new Set())
    if (!neighbors.has(e.target)) neighbors.set(e.target, new Set())
    neighbors.get(e.source)!.add(e.target)
    neighbors.get(e.target)!.add(e.source)
    edgeCount.set(e.source, (edgeCount.get(e.source) ?? 0) + 1)
    edgeCount.set(e.target, (edgeCount.get(e.target) ?? 0) + 1)
  })

  // column ごとに非ルートのフィールドノードを収集。
  // パラメータは専用レーンに描画するため集約対象に含めない
  const byColumn = new Map<number, ImpactGraphNode[]>()
  nodes.forEach((n) => {
    if (n.kind !== 'field' || n.isRoot || n.isParameter) return
    if (!byColumn.has(n.column)) byColumn.set(n.column, [])
    byColumn.get(n.column)!.push(n)
  })

  // グループ分割（シグネチャ計算・idx 割当）を expandedGroups 適用前に確定する
  const groupDefs: GroupDef[] = []
  byColumn.forEach((fieldNodes, column) => {
    if (fieldNodes.length <= GROUP_LAYER_THRESHOLD) return

    // 優先度順: (a) calc/param 優先 → (b) 接続エッジ数の多い順 → (c) label 昇順。
    // calc/param が個別枠を超える場合も、この並びで上位 7 個を残せば
    // あふれた calc/param は自然に集約対象へ回る。
    const sorted = [...fieldNodes].sort((a, b) => {
      const pa = a.isCalc || a.isParameter ? 0 : 1
      const pb = b.isCalc || b.isParameter ? 0 : 1
      if (pa !== pb) return pa - pb
      const ea = edgeCount.get(a.id) ?? 0
      const eb = edgeCount.get(b.id) ?? 0
      if (ea !== eb) return eb - ea
      return a.label.localeCompare(b.label)
    })

    const overflow = sorted.slice(GROUP_INDIVIDUAL_SLOTS)
    if (overflow.length === 0) return

    // 接続シグネチャごとにメンバーをまとめる
    const bySig = new Map<string, ImpactGraphNode[]>()
    overflow.forEach((n) => {
      const sig = Array.from(neighbors.get(n.id) ?? [])
        .sort()
        .join(',')
      if (!bySig.has(sig)) bySig.set(sig, [])
      bySig.get(sig)!.push(n)
    })

    // メンバー数 desc → シグネチャ文字列 asc の決定的順序
    const sigOrder = Array.from(bySig.entries()).sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length
      return a[0].localeCompare(b[0])
    })

    // 上位 3 シグネチャは独立 group、4 番目以降は rest に集約。
    // メンバー数が GROUP_MIN_MEMBERS 未満のものは group にせず個別表示のまま残す
    // （idx はスキップしても採番を維持し、他 group の id 安定性を保つ）
    const restMembers: ImpactGraphNode[] = []
    sigOrder.forEach(([, members], idx) => {
      if (idx < GROUP_MAX_SIGNATURES) {
        if (members.length >= GROUP_MIN_MEMBERS) {
          groupDefs.push({ id: `g:${column}:${idx}`, column, members })
        }
      } else {
        restMembers.push(...members)
      }
    })
    if (restMembers.length >= GROUP_MIN_MEMBERS) {
      groupDefs.push({ id: `g:${column}:rest`, column, members: restMembers })
    }
  })

  // expandedGroups に含まれる group は作らず、メンバーを個別表示のまま残す
  const memberToGroup = new Map<string, string>()
  groupDefs.forEach((def) => {
    if (expandedGroups.has(def.id)) return
    def.members.forEach((m) => memberToGroup.set(m.id, def.id))
  })
  if (memberToGroup.size === 0) return // 集約対象なし（全展開含む）

  // メンバー個別ノードを除去し group ノードを追加
  groupDefs.forEach((def) => {
    if (expandedGroups.has(def.id)) return
    def.members.forEach((m) => nodes.delete(m.id))
    nodes.set(def.id, {
      id: def.id,
      kind: 'group',
      label: '',
      column: def.column,
      isRoot: false,
      isCalc: false,
      calcType: null,
      isParameter: false,
      isUnresolved: false,
      memberFieldIds: def.members.map((n) => n.fieldId ?? n.id),
      memberLabels: def.members.map((n) => n.label),
    })
  })

  // エッジ付替え: メンバー端点を group id に置換し、内部・重複エッジを排除
  const remap = (id: string) => memberToGroup.get(id) ?? id
  const remapped = new Map<string, ImpactGraphEdge>()
  edges.forEach((e) => {
    const source = remap(e.source)
    const target = remap(e.target)
    if (source === target) return // メンバー間の内部エッジは捨てる
    const id = `${source}->${target}`
    if (!remapped.has(id)) remapped.set(id, { id, source, target })
  })
  edges.clear()
  remapped.forEach((e, id) => edges.set(id, e))
}
