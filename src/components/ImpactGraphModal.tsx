import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import type { Node, Edge, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  X,
  Hash,
  Sheet,
  LayoutDashboard,
  Crosshair,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Layers,
} from 'lucide-react'
import { t } from '../utils/i18n'
import type { TableauDocument } from '../types/tableau'
import type { CalcType } from '../utils/calcClassifier'
import {
  buildImpactGraph,
  type GraphRootRef,
  type ImpactGraphNode,
} from '../utils/impactAnalyzer'
import { FormulaHighlighter } from './FormulaHighlighter'
import { formatFormulaText } from '../utils/formulaFormatter'
import { normalizeFieldId } from '../utils/xmlParser'

/** キャプションが [ ] で囲まれている場合は括弧を除去して表示名にする */
function stripBracket(caption: string): string {
  return caption.startsWith('[') && caption.endsWith(']')
    ? caption.substring(1, caption.length - 1)
    : caption
}

/** 計算式種別バッジ（SideDrawer と同じ配色） */
function calcTypeBadge(
  calcType: CalcType | null,
): { label: string; className: string } | null {
  switch (calcType) {
    case 'lod':
      return {
        label: t('calctype.lod'),
        className: 'bg-purple-50 text-purple-600 border border-purple-200',
      }
    case 'tableCalc':
      return {
        label: t('calctype.table_calc'),
        className: 'bg-blue-50 text-blue-600 border border-blue-200',
      }
    default:
      return null
  }
}

/** ノード種別ごとの表示名 */
function kindLabel(kind: GraphRootRef['kind']): string {
  if (kind === 'sheet') return t('graph.sheets')
  if (kind === 'dashboard') return t('graph.dashboards')
  return t('graph.fields')
}

// ────────────────────────────────────────
// カスタムノード
// ────────────────────────────────────────

type ImpactFlowNode = Node<
  {
    graphNode: ImpactGraphNode
    onToggleExpand: (nodeId: string) => void
  },
  'impactCard'
>

const NODE_WIDTH = 224
// ノード寸法を明示指定すると DOM 計測を待たずに fitView / MiniMap が正しく描画される
const NODE_HEIGHT = 56

/** ノード種別ごとの見た目（枠色・アイコン背景） */
function nodeAppearance(gn: ImpactGraphNode): {
  card: string
  icon: string
  Icon: typeof Hash
} {
  if (gn.isRoot) {
    return {
      card: 'bg-slate-900 border-slate-900 text-white shadow-lg',
      icon: 'bg-white/10 text-white',
      Icon:
        gn.kind === 'sheet'
          ? Sheet
          : gn.kind === 'dashboard'
            ? LayoutDashboard
            : Crosshair,
    }
  }
  if (gn.kind === 'sheet') {
    return {
      card: 'bg-white border-blue-200 hover:border-blue-400',
      icon: 'bg-blue-50 text-blue-600',
      Icon: Sheet,
    }
  }
  if (gn.kind === 'dashboard') {
    return {
      card: 'bg-white border-rose-200 hover:border-rose-400',
      icon: 'bg-rose-50 text-rose-600',
      Icon: LayoutDashboard,
    }
  }
  if (gn.column < 0) {
    return {
      card: 'bg-white border-purple-200 hover:border-purple-400',
      icon: 'bg-purple-50 text-purple-600',
      Icon: Hash,
    }
  }
  return {
    card: 'bg-white border-emerald-200 hover:border-emerald-400',
    icon: 'bg-emerald-50 text-emerald-600',
    Icon: Hash,
  }
}

function ImpactCardNode({ data }: NodeProps<ImpactFlowNode>) {
  const gn = data.graphNode

  // 集約ノード: ロジックを持たないフィールドを畳んだ破線カード（クリックで展開）
  if (gn.kind === 'group') {
    const count = gn.memberFieldIds?.length ?? 0
    return (
      <div
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 shadow-sm transition-all cursor-pointer hover:border-slate-400 hover:shadow-md"
        title={t('graph.group_label', { count })}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!w-1.5 !h-1.5 !border-none !bg-slate-300"
        />
        <div className="p-1.5 rounded-lg shrink-0 bg-slate-100 text-slate-500">
          <Layers size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate text-slate-600">
            {t('graph.group_label', { count })}
          </p>
          <p className="text-[9px] text-slate-400 truncate">
            {t('graph.group_expand')}
          </p>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          className="!w-1.5 !h-1.5 !border-none !bg-slate-300"
        />
      </div>
    )
  }

  const { card, icon, Icon } = nodeAppearance(gn)
  const badge = gn.isCalc ? calcTypeBadge(gn.calcType) : null
  const label = stripBracket(gn.label)
  const clickable = !gn.isRoot && !gn.isUnresolved
  // その場展開ボタン: field/sheet の非ルートで、隠れた外側隣接があるか展開済みのとき表示
  // （group ノードは早期 return 済みなので gn.kind は field/sheet/dashboard）
  const showExpand =
    !gn.isRoot &&
    gn.kind !== 'dashboard' &&
    ((gn.expandableCount ?? 0) > 0 || gn.isExpanded)

  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border shadow-sm transition-all ${card} ${
        clickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
      } ${gn.isUnresolved ? 'opacity-50' : ''}`}
      title={label}
    >
      {showExpand && (
        <button
          data-testid={`node-expand-${gn.id}`}
          onClick={(e) => {
            e.stopPropagation()
            data.onToggleExpand(gn.id)
          }}
          title={
            gn.isExpanded ? t('graph.collapse_node') : t('graph.expand_node')
          }
          className="absolute top-1/2 -translate-y-1/2 z-10 min-w-5 h-5 px-1 rounded-full bg-white border border-slate-300 shadow-sm text-[9px] font-black text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center"
          style={{ [gn.column < 0 ? 'left' : 'right']: -12 }}
        >
          {gn.isExpanded ? '−' : `+${gn.expandableCount}`}
        </button>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-1.5 !h-1.5 !border-none !bg-slate-300"
      />
      <div className={`p-1.5 rounded-lg shrink-0 ${icon}`}>
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-xs font-bold truncate ${gn.isRoot ? 'text-white' : 'text-slate-700'}`}
        >
          {label}
        </p>
        {(badge || gn.isParameter) && (
          <span
            className={`inline-block mt-0.5 text-[8px] font-bold uppercase tracking-widest px-1 py-px rounded ${
              gn.isParameter
                ? 'bg-violet-50 text-violet-600 border border-violet-200'
                : badge!.className
            }`}
          >
            {gn.isParameter ? t('graph.parameter') : badge!.label}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-1.5 !h-1.5 !border-none !bg-slate-300"
      />
    </div>
  )
}

const nodeTypes = { impactCard: ImpactCardNode }

// ────────────────────────────────────────
// レイヤードレイアウト
// ────────────────────────────────────────

const ROW_GAP = 72
/** 扇形の最内サブ列（ルート側）の行数 */
const FAN_BASE_ROWS = 4
/** サブ列が外側へ1つ進むごとに増やす行数 */
const FAN_STEP_ROWS = 4
/** サブ列あたりの最大行数（外側でも頭打ちにする） */
const FAN_MAX_ROWS = 16
/** 層内サブ列の横ピッチ */
const SUB_COL_PITCH = NODE_WIDTH + 48
/** 層と層の間の余白（エッジ描画用） */
const LAYER_GAP = 140

/**
 * column（依存の深さ）ごとに配置する「扇形」レイヤードレイアウト。
 * - X軸 = 依存の深さ、というエンコーディングは維持する
 * - ルート側のサブ列を内側（細く）、外側ほど太く（行数を増やす）扇状に広げる
 * - 各サブ列内はセンターラインから交互に外へ充填し、常に水平中心に集める
 * - ルート層から外側へ、隣接ノードの平均 y（バリセンタ）で並べ替えて交差を減らす
 * - group ノードは各層の最も外側のサブ列に寄せる
 */
function layoutNodes(
  graphNodes: ImpactGraphNode[],
  edges: { source: string; target: string }[],
): Map<string, { x: number; y: number }> {
  const byColumn = new Map<number, ImpactGraphNode[]>()
  graphNodes.forEach((n) => {
    if (!byColumn.has(n.column)) byColumn.set(n.column, [])
    byColumn.get(n.column)!.push(n)
  })

  // 隣接リスト（無向）
  const neighbors = new Map<string, string[]>()
  edges.forEach((e) => {
    if (!neighbors.has(e.source)) neighbors.set(e.source, [])
    if (!neighbors.has(e.target)) neighbors.set(e.target, [])
    neighbors.get(e.source)!.push(e.target)
    neighbors.get(e.target)!.push(e.source)
  })

  // パス1: ルートに近い層から順に並べ替え、層内グリッドの位置（y とローカル x）を確定
  const processOrder = Array.from(byColumn.keys()).sort(
    (a, b) => Math.abs(a) - Math.abs(b) || b - a,
  )
  const local = new Map<string, { col: number; lx: number; y: number }>()
  const yOf = new Map<string, number>()
  const layerWidth = new Map<number, number>()

  processOrder.forEach((col) => {
    const list = byColumn.get(col)!
    // 非 group ノードのみバリセンタ（隣接の平均 y）で並べ替える。
    // group は既存順のまま非 group の後ろへ回し、必ず外側のサブ列へ落とす（仕様D）。
    const nonGroup = list.filter((n) => n.kind !== 'group')
    const groups = list.filter((n) => n.kind === 'group')
    if (yOf.size > 0) {
      const score = new Map<string, number>()
      nonGroup.forEach((n) => {
        const ys = (neighbors.get(n.id) || [])
          .map((id) => yOf.get(id))
          .filter((y): y is number => y !== undefined)
        score.set(
          n.id,
          ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : 0,
        )
      })
      nonGroup.sort((a, b) => score.get(a.id)! - score.get(b.id)!)
    }
    const ordered = [...nonGroup, ...groups]

    // 扇形の充填: ルート側のサブ列0から順に、サブ列ごとの行数上限まで詰める。
    // 上限はルート側 FAN_BASE_ROWS 行から外へ +FAN_STEP_ROWS 行ずつ、FAN_MAX_ROWS で頭打ち（仕様C）。
    const capOf = (subCol: number) =>
      Math.min(FAN_BASE_ROWS + FAN_STEP_ROWS * subCol, FAN_MAX_ROWS)
    const placed: {
      n: ImpactGraphNode
      subCol: number
      idxInSub: number
    }[] = []
    let subCol = 0
    let idxInSub = 0
    ordered.forEach((n) => {
      // 現サブ列が上限に達したら次の（より外側の）サブ列へ折り返す
      if (idxInSub >= capOf(subCol)) {
        subCol += 1
        idxInSub = 0
      }
      placed.push({ n, subCol, idxInSub })
      idxInSub += 1
    })
    // subCol は単調増加なので、ループ終了時の値 +1 が使用サブ列数
    const subColCount = subCol + 1
    layerWidth.set(col, (subColCount - 1) * SUB_COL_PITCH + NODE_WIDTH)

    placed.forEach(({ n, subCol: sc, idxInSub: j }) => {
      // 垂直: サブ列内はセンターライン(y=0)から交互に外へ充填する（中央→上→下…）。
      // j=0:0, j=1:-1, j=2:+1, j=3:-2, j=4:+2 ... （単位は ROW_GAP）
      const step = Math.ceil(j / 2)
      const centerY = (j % 2 === 1 ? -step : step) * ROW_GAP
      // ブリック配置: 奇数サブ列を半行下げ、水平エッジがノードの隙間を通るようにする
      const y = centerY + (sc % 2 === 1 ? ROW_GAP / 2 : 0)
      // サブ列の向き: ルート側(サブ列0)を層の内側に置く。
      // 上流層(col<0)はサブ列0を層の右端に置き外へ向かって左へ、
      // 下流層(col>0)は左端に置き右へ伸ばす（鏡像）。
      const lx =
        col < 0 ? (subColCount - 1 - sc) * SUB_COL_PITCH : sc * SUB_COL_PITCH
      local.set(n.id, { col, lx, y })
      yOf.set(n.id, y)
    })
  })

  // パス2: 層の幅を考慮して左から順に x を割り当てる。
  // ルート層の左端を x=0 に固定（アンカー）する。左側の層が展開/折りたたみで
  // 増減しても既存ノードの座標が変わらず、画面中央が流れない。
  const ascending = Array.from(byColumn.keys()).sort((a, b) => a - b)
  const layerX = new Map<number, number>()
  let cursor = 0
  ascending.forEach((col) => {
    layerX.set(col, cursor)
    cursor += layerWidth.get(col)! + LAYER_GAP
  })
  const rootAnchor = layerX.get(0) ?? 0

  const pos = new Map<string, { x: number; y: number }>()
  local.forEach((v, id) => {
    pos.set(id, { x: layerX.get(v.col)! + v.lx - rootAnchor, y: v.y })
  })
  return pos
}

// ────────────────────────────────────────
// モーダル本体
// ────────────────────────────────────────

/** グラフノード → ルート参照への変換（クリックによる再センタリング用） */
function nodeToRootRef(gn: ImpactGraphNode): GraphRootRef | null {
  if (gn.kind === 'field') {
    return gn.fieldId ? { kind: 'field', name: gn.fieldId } : null
  }
  // 集約ノードは中心化できない（クリックは展開として別処理される）
  if (gn.kind === 'group') return null
  return gn.entityName ? { kind: gn.kind, name: gn.entityName } : null
}

interface ImpactGraphModalProps {
  doc: TableauDocument
  /** 初期表示の中心オブジェクト */
  root: GraphRootRef
  onClose: () => void
  /** 中心オブジェクトの「詳細を開く」: アプリ本体の該当ビューへ遷移する */
  onOpenObject?: (ref: GraphRootRef) => void
}

export function ImpactGraphModal(props: ImpactGraphModalProps) {
  // useReactFlow を使うため Provider で包む（中心切り替え時のモーフィング更新に必要）
  return (
    <ReactFlowProvider>
      <ImpactGraphModalInner {...props} />
    </ReactFlowProvider>
  )
}

function ImpactGraphModalInner({
  doc,
  root: initialRoot,
  onClose,
  onOpenObject,
}: ImpactGraphModalProps) {
  const [root, setRoot] = useState<GraphRootRef>(initialRoot)
  // グラフ内ナビゲーションの履歴（戻る用）
  const [history, setHistory] = useState<GraphRootRef[]>([])
  // 集約ノードを展開した層（`g:${column}`）の集合。ルート切替時にリセットする
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // その場展開したノード id の集合。ルート切替・戻る時にリセットする
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  // ホバー中のノードとツールチップ表示位置（コンテナ相対座標）。
  // containerWidth/Height は render 中に ref を参照しないよう、
  // ホバー開始時（イベントハンドラ内）にキャプチャして保持する。
  const [hover, setHover] = useState<{
    gn: ImpactGraphNode
    x: number
    y: number
    containerWidth: number
    containerHeight: number
  } | null>(null)

  const graph = useMemo(
    () => buildImpactGraph(doc, root, { expandedGroups, expandedNodes }),
    [doc, root, expandedGroups, expandedNodes],
  )

  // ツールチップの計算式表示用: 物理名 → 表示名（caption）の変換マップ
  const fieldMeta = useMemo(() => {
    const meta = new Map<string, { caption?: string }>()
    doc.datasources.forEach((ds) =>
      ds.fields.forEach((f) => {
        const id = normalizeFieldId(f.column)
        if (id && !meta.has(id)) meta.set(id, { caption: f.caption })
      }),
    )
    doc.worksheets.forEach((ws) =>
      ws.localFields?.forEach((f) => {
        const id = normalizeFieldId(f.column)
        if (id && !meta.has(id)) meta.set(id, { caption: f.caption })
      }),
    )
    return meta
  }, [doc])

  // ノードのその場展開/折りたたみ（中心は変えない）
  const toggleNodeExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  // 中心オブジェクトを切り替える（履歴に積む）。展開状態は新しいルートに引き継がない
  const recenter = useCallback(
    (next: GraphRootRef) => {
      setHistory((prev) => [...prev, root])
      setRoot(next)
      setExpandedGroups(new Set())
      setExpandedNodes(new Set())
    },
    [root],
  )

  const goBack = useCallback(() => {
    setHistory((prev) => {
      const last = prev[prev.length - 1]
      if (last) setRoot(last)
      return prev.slice(0, -1)
    })
    setExpandedGroups(new Set())
    setExpandedNodes(new Set())
  }, [])

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph) return { flowNodes: [], flowEdges: [] }
    const positions = layoutNodes(graph.nodes, graph.edges)
    const rootNodeId = graph.nodes.find((n) => n.isRoot)?.id

    const flowNodes: Node[] = graph.nodes.map((gn) => ({
      id: gn.id,
      type: 'impactCard',
      position: positions.get(gn.id) || { x: 0, y: 0 },
      data: { graphNode: gn, onToggleExpand: toggleNodeExpand },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      draggable: true,
    }))

    const flowEdges: Edge[] = graph.edges.map((e) => {
      const isRootEdge = e.source === rootNodeId || e.target === rootNodeId
      return {
        ...e,
        animated: isRootEdge,
        style: {
          stroke: isRootEdge ? '#3b82f6' : '#cbd5e1',
          strokeWidth: isRootEdge ? 2 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isRootEdge ? '#3b82f6' : '#cbd5e1',
          width: 16,
          height: 16,
        },
      }
    })
    return { flowNodes, flowEdges }
  }, [graph, toggleNodeExpand])

  const { setNodes, setEdges, fitView, setCenter, getNodes } = useReactFlow()
  const containerRef = useRef<HTMLDivElement>(null)

  // カメラ制御: ルートとその直接近傍を画面サイズに合わせて表示する。
  // 近傍が現在のコンテナに収まるならフィットし、収まらない場合は
  // 「ラベルが読める最低ズーム」でルートを中央に置く（あとはパンで探索）。
  const focusCamera = useCallback(
    (duration: number) => {
      const MIN_READABLE_ZOOM = 0.5
      const rootNodeId = graph?.nodes.find((n) => n.isRoot)?.id
      if (!rootNodeId) return
      const focusIds = new Set<string>([rootNodeId])
      graph?.edges.forEach((e) => {
        if (e.source === rootNodeId) focusIds.add(e.target)
        if (e.target === rootNodeId) focusIds.add(e.source)
      })
      const focus = flowNodes.filter((n) => focusIds.has(n.id))
      if (focus.length === 0) return

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      focus.forEach((n) => {
        minX = Math.min(minX, n.position.x)
        minY = Math.min(minY, n.position.y)
        maxX = Math.max(maxX, n.position.x + NODE_WIDTH)
        maxY = Math.max(maxY, n.position.y + NODE_HEIGHT)
      })
      const cw = containerRef.current?.clientWidth ?? 1200
      const ch = containerRef.current?.clientHeight ?? 800
      const fitZoom = Math.min(
        1,
        (cw * 0.85) / (maxX - minX),
        (ch * 0.85) / (maxY - minY),
      )
      if (fitZoom >= MIN_READABLE_ZOOM) {
        void fitView({
          nodes: focus.map((n) => ({ id: n.id })),
          padding: 0.15,
          maxZoom: 1,
          duration,
        })
      } else {
        const root = flowNodes.find((n) => n.id === rootNodeId)
        if (!root) return
        void setCenter(
          root.position.x + NODE_WIDTH / 2,
          root.position.y + NODE_HEIGHT / 2,
          { zoom: MIN_READABLE_ZOOM, duration },
        )
      }
    },
    [graph, flowNodes, fitView, setCenter],
  )

  // 中心切り替え時: 再マウントせず同一キャンバス内でノードを差し替える。
  // 共通ノードは CSS トランジション（index.css）で新しい位置へ滑らかに移動し、
  // 消えるノードは即座に消さずフェードアウトさせてから除去する（モーフィング）。
  // カメラを動かすのはルートが変わったときだけ。展開/折りたたみでは
  // （座標がルートアンカーで安定しているため）視点を一切動かさない。
  const isFirstRender = useRef(true)
  const prevRootKeyRef = useRef(`${root.kind}:${root.name}`)
  useEffect(() => {
    const rootKey = `${root.kind}:${root.name}`
    const rootChanged = prevRootKeyRef.current !== rootKey
    prevRootKeyRef.current = rootKey
    if (isFirstRender.current) {
      // 初回のカメラは onInit で合わせる
      isFirstRender.current = false
      return
    }
    const newIds = new Set(flowNodes.map((n) => n.id))
    const ghosts = getNodes()
      .filter((n) => !newIds.has(n.id))
      .map((n) => ({
        ...n,
        style: { ...n.style, opacity: 0, pointerEvents: 'none' as const },
        selectable: false,
        draggable: false,
      }))
    setNodes([...flowNodes, ...ghosts])
    setEdges(flowEdges)
    const fitId = rootChanged
      ? window.setTimeout(() => focusCamera(500), 50)
      : undefined
    // フェードアウト（opacity 300ms）が終わったらゴーストを実際に取り除く
    const cleanupId = window.setTimeout(() => setNodes(flowNodes), 400)
    return () => {
      if (fitId !== undefined) window.clearTimeout(fitId)
      window.clearTimeout(cleanupId)
    }
  }, [root, flowNodes, flowEdges, setNodes, setEdges, getNodes, focusCamera])

  // どのノードをクリックしても、そのオブジェクトを中心に再描画する
  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      setHover(null)
      const gn = (node.data as { graphNode: ImpactGraphNode }).graphNode
      // 集約ノードは再センタリングせず、その層を展開する（モーフィング effect が発火）
      if (gn.kind === 'group') {
        setExpandedGroups((prev) => new Set(prev).add(node.id))
        return
      }
      if (gn.isRoot || gn.isUnresolved) return
      const ref = nodeToRootRef(gn)
      if (ref) recenter(ref)
    },
    [recenter],
  )

  // Escape で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // サイドパネル用: グラフノードを種別・方向でグループ化
  const panelGroups = useMemo(() => {
    if (!graph) return null
    const rest = graph.nodes.filter((n) => !n.isRoot)
    const fields = rest.filter((n) => n.kind === 'field')
    // 集約ノードはパネルでは行にせず、メンバーを個別フィールド行に展開して混ぜる
    rest
      .filter((n) => n.kind === 'group')
      .forEach((g) => {
        ;(g.memberFieldIds ?? []).forEach((fieldId, i) => {
          fields.push({
            id: `f:${fieldId}`,
            kind: 'field',
            label: g.memberLabels?.at(i) ?? fieldId,
            column: g.column,
            isRoot: false,
            isCalc: false,
            calcType: null,
            isParameter: false,
            isUnresolved: false,
            fieldId,
          })
        })
      })
    return {
      upstreamFields: fields
        .filter((n) => n.column < 0)
        .sort((a, b) => a.column - b.column || a.label.localeCompare(b.label)),
      downstreamFields: fields
        .filter((n) => n.column > 0)
        .sort((a, b) => a.column - b.column || a.label.localeCompare(b.label)),
      sheets: rest.filter((n) => n.kind === 'sheet'),
      dashboards: rest.filter((n) => n.kind === 'dashboard'),
      fieldCount: fields.length,
    }
  }, [graph])

  if (!graph || !panelGroups) return null

  const rootNode = graph.nodes.find((n) => n.isRoot)
  const rootLabel = stripBracket(rootNode?.label || root.name)

  const legend = [
    { color: 'bg-purple-400', label: t('graph.upstream') },
    { color: 'bg-slate-900', label: t('graph.root') },
    { color: 'bg-emerald-400', label: t('graph.downstream') },
    { color: 'bg-blue-400', label: t('graph.sheets') },
    { color: 'bg-rose-400', label: t('graph.dashboards') },
  ]

  /** パネルの1行（クリックでそのオブジェクトを中心に再描画） */
  const panelRow = (gn: ImpactGraphNode, hoverClass: string) => {
    const ref = nodeToRootRef(gn)
    const RowIcon =
      gn.kind === 'sheet'
        ? Sheet
        : gn.kind === 'dashboard'
          ? LayoutDashboard
          : Hash
    const iconColor =
      gn.kind === 'sheet'
        ? 'text-blue-500'
        : gn.kind === 'dashboard'
          ? 'text-rose-500'
          : gn.column < 0
            ? 'text-purple-500'
            : 'text-emerald-500'
    return (
      <button
        key={gn.id}
        disabled={!ref || gn.isUnresolved}
        onClick={() => ref && recenter(ref)}
        className={`w-full flex items-center gap-2 px-3 py-2 bg-white border border-slate-100 rounded-xl transition-all text-left ${
          ref && !gn.isUnresolved
            ? `${hoverClass} hover:shadow-sm`
            : 'opacity-50 cursor-not-allowed'
        }`}
      >
        <RowIcon size={12} className={`${iconColor} shrink-0`} />
        <span className="text-xs font-bold text-slate-700 truncate">
          {stripBracket(gn.label)}
        </span>
        {gn.kind === 'field' && gn.column !== 0 && (
          <span className="ml-auto text-[9px] font-black text-slate-300 shrink-0">
            {gn.column < 0 ? '↑' : '↓'}
            {Math.abs(gn.column)}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="impact-modal fixed inset-0 z-[80] flex flex-col bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="m-3 sm:m-6 flex-1 flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* ヘッダー */}
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            {history.length > 0 && (
              <button
                onClick={goBack}
                data-testid="graph-back-button"
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600 group shrink-0"
                title={t('button.back')}
              >
                <ArrowLeft
                  size={18}
                  className="group-hover:-translate-x-0.5 transition-transform"
                />
              </button>
            )}
            <div className="p-2 bg-slate-900 text-white rounded-xl shrink-0">
              {root.kind === 'sheet' ? (
                <Sheet size={16} />
              ) : root.kind === 'dashboard' ? (
                <LayoutDashboard size={16} />
              ) : (
                <Crosshair size={16} />
              )}
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {t('graph.title')} — {kindLabel(root.kind)}
              </p>
              <h2
                className="text-lg font-black text-slate-800 tracking-tight truncate"
                title={rootLabel}
              >
                {rootLabel}
              </h2>
            </div>
            {onOpenObject && (
              <button
                onClick={() => onOpenObject(root)}
                data-testid="graph-open-detail"
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                {t('graph.open_detail')}
                <ArrowUpRight size={12} />
              </button>
            )}
          </div>
          <div className="hidden lg:flex items-center gap-4 shrink-0">
            {legend.map((item) => (
              <span
                key={item.label}
                className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                {item.label}
              </span>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all text-slate-400 shrink-0"
            title={t('graph.close')}
          >
            <X size={22} />
          </button>
        </header>

        {/* 本体: グラフ + サマリパネル */}
        <div className="flex-1 flex overflow-hidden">
          <div ref={containerRef} className="flex-1 relative bg-slate-50">
            <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-md px-3 py-2 rounded-xl shadow-sm border border-slate-200 text-[11px] text-slate-500 font-medium">
              💡 {t('graph.hint')}
            </div>
            {graph.truncated && (
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-xl text-[11px] font-bold">
                <AlertTriangle size={12} />
                {t('graph.truncated')}
              </div>
            )}
            {/* 非制御（defaultNodes/defaultEdges）+ useReactFlow の setNodes で更新する。
                制御モードは onNodesChange なしだと計測サイズが反映されず MiniMap が描画されない。
                key での再マウントは行わず、中心切り替えはモーフィングで表現する */}
            <ReactFlow
              defaultNodes={flowNodes}
              defaultEdges={flowEdges}
              nodeTypes={nodeTypes}
              onNodeClick={handleNodeClick}
              onNodeMouseEnter={(e, node) => {
                const gn = (node.data as { graphNode: ImpactGraphNode })
                  .graphNode
                const container = containerRef.current
                const rect = container?.getBoundingClientRect()
                if (!rect || !container) return
                setHover({
                  gn,
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  containerWidth: container.clientWidth,
                  containerHeight: container.clientHeight,
                })
              }}
              onNodeMouseLeave={() => setHover(null)}
              onInit={() => focusCamera(0)}
              minZoom={0.05}
              maxZoom={2.5}
              panOnScroll
              proOptions={{ hideAttribution: false }}
              nodesConnectable={false}
            >
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => {
                  const gn = (n.data as { graphNode: ImpactGraphNode })
                    .graphNode
                  if (gn.isRoot) return '#0f172a'
                  if (gn.kind === 'sheet') return '#93c5fd'
                  if (gn.kind === 'dashboard') return '#fda4af'
                  return gn.column < 0 ? '#d8b4fe' : '#6ee7b7'
                }}
                style={{ borderRadius: '12px' }}
              />
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1}
                color="#cbd5e1"
              />
            </ReactFlow>
            {hover && (
              <div
                data-testid="graph-node-tooltip"
                className="absolute z-20 pointer-events-none w-80 max-w-[70%] bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-2"
                style={{
                  left: Math.min(hover.x + 16, hover.containerWidth - 340),
                  top: Math.min(hover.y + 16, hover.containerHeight - 200),
                }}
              >
                {hover.gn.kind === 'group' ? (
                  (() => {
                    const labels = hover.gn.memberLabels ?? []
                    const rest = labels.length - 8
                    return (
                      <>
                        <p className="text-sm font-bold text-slate-800">
                          {t('graph.group_label', { count: labels.length })}
                        </p>
                        <div className="space-y-0.5">
                          {labels.slice(0, 8).map((lbl, i) => (
                            <p
                              key={i}
                              className="text-xs text-slate-600 truncate"
                            >
                              {stripBracket(lbl)}
                            </p>
                          ))}
                          {rest > 0 && (
                            <p className="text-[10px] text-slate-400">
                              {t('graph.group_more', { count: rest })}
                            </p>
                          )}
                        </div>
                      </>
                    )
                  })()
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {stripBracket(hover.gn.label)}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {hover.gn.kind === 'sheet' && (
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {t('graph.sheets')}
                        </span>
                      )}
                      {hover.gn.kind === 'dashboard' && (
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {t('graph.dashboards')}
                        </span>
                      )}
                      {hover.gn.kind === 'field' && (
                        <>
                          {hover.gn.isParameter && (
                            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-200">
                              {t('graph.parameter')}
                            </span>
                          )}
                          {hover.gn.isCalc &&
                            (() => {
                              const badge = calcTypeBadge(hover.gn.calcType)
                              return badge ? (
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              ) : null
                            })()}
                          {hover.gn.dataType && (
                            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                              {hover.gn.dataType}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {hover.gn.kind === 'field' && hover.gn.formula && (
                      <div>
                        <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {t('drawer.formula')}
                        </h5>
                        <div className="max-h-44 overflow-hidden text-xs">
                          <FormulaHighlighter
                            formula={
                              formatFormulaText(hover.gn.formula, fieldMeta) ??
                              hover.gn.formula
                            }
                          />
                        </div>
                      </div>
                    )}
                    {hover.gn.kind === 'field' && hover.gn.paramValue && (
                      <div>
                        <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {t('detail.current_value')}
                        </h5>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-bold">
                          {hover.gn.paramValue}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* サマリパネル: グラフ内容の一覧（クリックで中心を切り替え） */}
          <aside className="w-72 xl:w-80 border-l border-slate-100 overflow-y-auto p-5 space-y-6 hidden md:block shrink-0">
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  count: panelGroups.fieldCount,
                  label: t('graph.fields'),
                  className: 'bg-emerald-50 text-emerald-700',
                },
                {
                  count: panelGroups.sheets.length,
                  label: t('graph.sheets'),
                  className: 'bg-blue-50 text-blue-700',
                },
                {
                  count: panelGroups.dashboards.length,
                  label: t('graph.dashboards'),
                  className: 'bg-rose-50 text-rose-700',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`rounded-2xl p-3 text-center ${s.className}`}
                >
                  <p className="text-xl font-black leading-none">{s.count}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider mt-1 opacity-70">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            {panelGroups.upstreamFields.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-purple-500 rounded-full" />
                  {t('graph.upstream')}
                </h4>
                {panelGroups.upstreamFields.map((gn) =>
                  panelRow(gn, 'hover:border-purple-300'),
                )}
              </section>
            )}

            {panelGroups.downstreamFields.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-emerald-500 rounded-full" />
                  {t('graph.downstream')}
                </h4>
                {panelGroups.downstreamFields.map((gn) =>
                  panelRow(gn, 'hover:border-emerald-300'),
                )}
              </section>
            )}

            {panelGroups.sheets.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-blue-500 rounded-full" />
                  {t('graph.sheets')}
                </h4>
                {panelGroups.sheets.map((gn) =>
                  panelRow(gn, 'hover:border-blue-300'),
                )}
              </section>
            )}

            {panelGroups.dashboards.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-rose-500 rounded-full" />
                  {t('graph.dashboards')}
                </h4>
                {panelGroups.dashboards.map((gn) =>
                  panelRow(gn, 'hover:border-rose-300'),
                )}
              </section>
            )}

            {panelGroups.fieldCount === 0 &&
              panelGroups.sheets.length === 0 &&
              panelGroups.dashboards.length === 0 && (
                <p className="text-xs text-slate-400 italic">
                  {t('drawer.impact_none')}
                </p>
              )}
          </aside>
        </div>
      </div>
    </div>
  )
}
