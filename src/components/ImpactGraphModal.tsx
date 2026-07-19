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
  LayoutGrid,
  SlidersHorizontal,
  Expand,
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
    onRecenter: (gn: ImpactGraphNode) => void
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
  // パラメータは上部レーンに置かれる入力値。淡い紫地で計算フィールドと区別する
  if (gn.isParameter) {
    return {
      card: 'bg-violet-50 border-violet-300 hover:border-violet-500',
      icon: 'bg-violet-100 text-violet-700',
      Icon: SlidersHorizontal,
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
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 shadow-sm transition cursor-pointer hover:border-slate-400 hover:shadow-md"
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
          <p className="text-[9px] text-slate-500 truncate">
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
  // クリック = 開く/閉じる。開ける先も展開もないノードはクリック不能表示
  // （group ノードは早期 return 済みなので gn.kind は field/sheet/dashboard）
  const expandable =
    !gn.isRoot &&
    gn.kind !== 'dashboard' &&
    ((gn.expandableCount ?? 0) > 0 || gn.isExpanded)
  // ◎（中心に表示）はルート以外の解決済みノードすべてに出す
  const showRecenter = !gn.isRoot && !gn.isUnresolved

  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={`group/card relative flex items-center gap-2 px-3 py-2.5 rounded-xl border shadow-sm transition ${card} ${
        expandable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
      } ${gn.isUnresolved ? 'opacity-50' : ''}`}
      title={label}
    >
      {expandable && (
        <button
          data-testid={`node-expand-${gn.id}`}
          onClick={(e) => {
            e.stopPropagation()
            data.onToggleExpand(gn.id)
          }}
          title={
            gn.isExpanded ? t('graph.collapse_node') : t('graph.expand_node')
          }
          className="absolute top-1/2 -translate-y-1/2 z-10 min-w-5 h-5 px-1 rounded-full bg-white border border-slate-300 shadow-sm text-[9px] font-black text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition flex items-center justify-center"
          style={{ [gn.column < 0 ? 'left' : 'right']: -12 }}
        >
          {gn.isExpanded ? '−' : `+${gn.expandableCount}`}
        </button>
      )}
      {showRecenter && (
        <button
          data-testid={`node-center-${gn.id}`}
          onClick={(e) => {
            e.stopPropagation()
            data.onRecenter(gn)
          }}
          title={t('graph.recenter')}
          className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-white border border-slate-300 shadow-sm text-slate-500 hover:text-blue-600 hover:border-blue-400 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 transition flex items-center justify-center"
        >
          <Crosshair size={11} />
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
                ? 'bg-white/70 text-violet-700 border border-violet-300'
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
/** 扇形の上端からパラメータレーンまでの余白 */
const PARAM_LANE_GAP = 128

/**
 * レイアウトのピン留め状態。差分レイアウト（layoutNodes の第3引数）に渡すと、
 * 前回の座標をそのまま引き継いで「展開しても既存ノードを動かさない」配置になる。
 * - positions: 全ノードの確定座標（id → x/y/所属 column）
 * - columnX: 列ごとの「ルート側の基準バンド」の絶対x（列の代表x）
 * - bandXs: 列ごとに実際に使われているバンド（サブ列）の絶対x昇順リスト
 * - fanTop: パラメータレーンの基準となる扇形上端y（差分では再計算しない）
 */
export interface LayoutPinState {
  positions: Map<string, { x: number; y: number; column: number }>
  columnX: Map<number, number>
  bandXs: Map<number, number[]>
  fanTop: number
}

/** field かつパラメータ かつ 非ルート（＝専用レーンに積むパラメータ）か */
function isLaneParam(n: ImpactGraphNode): boolean {
  return n.kind === 'field' && n.isParameter && !n.isRoot
}

/**
 * 確定座標からピン留め状態を構築する。bandXs/columnX は扇形ノード（非パラメータ）の
 * 実座標から再導出し、次回の差分でスロットの占有・空きを判定できるようにする。
 */
function buildPin(
  nodes: ImpactGraphNode[],
  positions: Map<string, { x: number; y: number }>,
  fanTop: number,
): LayoutPinState {
  const posWithCol = new Map<string, { x: number; y: number; column: number }>()
  const bandSet = new Map<number, Set<number>>()
  nodes.forEach((n) => {
    const p = positions.get(n.id)
    if (!p) return
    posWithCol.set(n.id, { x: p.x, y: p.y, column: n.column })
    if (!isLaneParam(n)) {
      if (!bandSet.has(n.column)) bandSet.set(n.column, new Set())
      bandSet.get(n.column)!.add(p.x)
    }
  })
  const bandXs = new Map<number, number[]>()
  const columnX = new Map<number, number>()
  bandSet.forEach((set, col) => {
    const xs = [...set].sort((a, b) => a - b)
    bandXs.set(col, xs)
    // ルート側の基準バンド: 上流層(col<0)は右端、下流層(col>=0)は左端
    columnX.set(col, col < 0 ? xs.at(-1)! : xs[0])
  })
  // パラメータしか居ない列の columnX を補完する
  nodes.forEach((n) => {
    if (isLaneParam(n) && !columnX.has(n.column)) {
      const p = positions.get(n.id)
      if (p) columnX.set(n.column, p.x)
    }
  })
  return { positions: posWithCol, columnX, bandXs, fanTop }
}

/**
 * 差分レイアウト。前回のピン（prev）を基準に、展開で増減したノードだけを動かす。
 * 契約（詳細は layoutNodes の doc コメント参照）:
 * 1. 生存（prev にあり column も同じ）→ 座標はビット同一
 * 2. column が変わった生存 → y 維持・x のみ新しい列へ
 * 3. 新規 → 同じ列の既存バンドの、目標y に最も近い空きスロットへ（下方向優先）
 * 4. 新規の列 → 既存レイアウトの外側（上流は左、下流は右）へ積む
 * 5. パラメータ → 専用レーンの流儀を維持（新規は列の既存パラメータの上へ）
 * 生存が1つも無い場合は差分を諦めて null を返す（呼び出し側がフルへフォールバック）。
 */
function diffLayout(
  nodes: ImpactGraphNode[],
  edges: { source: string; target: string }[],
  prev: LayoutPinState,
): {
  positions: Map<string, { x: number; y: number }>
  pin: LayoutPinState
} | null {
  // 無向隣接（新規ノードの目標y算出に使う）
  const neighbors = new Map<string, string[]>()
  edges.forEach((e) => {
    if (!neighbors.has(e.source)) neighbors.set(e.source, [])
    if (!neighbors.has(e.target)) neighbors.set(e.target, [])
    neighbors.get(e.source)!.push(e.target)
    neighbors.get(e.target)!.push(e.source)
  })

  const prevPos = prev.positions
  const newPos = new Map<string, { x: number; y: number; column: number }>()

  // (契約1) 生存ノード（column 同一）をビット同一でピン留めする
  let survivorCount = 0
  nodes.forEach((n) => {
    const pp = prevPos.get(n.id)
    if (pp && pp.column === n.column) {
      newPos.set(n.id, { x: pp.x, y: pp.y, column: n.column })
      survivorCount += 1
    }
  })
  if (survivorCount === 0) return null // フルレイアウトへフォールバック

  // 生存した扇形ノードから列ごとの占有バンド（実x集合）を再導出する
  const bandXs = new Map<number, number[]>()
  const bandSet = new Map<number, Set<number>>()
  nodes.forEach((n) => {
    if (isLaneParam(n)) return
    const p = newPos.get(n.id)
    if (!p) return
    if (!bandSet.has(n.column)) bandSet.set(n.column, new Set())
    bandSet.get(n.column)!.add(p.x)
  })
  bandSet.forEach((s, c) =>
    bandXs.set(
      c,
      [...s].sort((a, b) => a - b),
    ),
  )
  // 生存が居ない列は prev のバンドを流用する
  prev.bandXs.forEach((xs, c) => {
    if (!bandXs.has(c)) bandXs.set(c, xs.slice())
  })

  // 列ごとのルート側基準x（moved 生存・新規の配置先）
  const columnX = new Map<number, number>()
  bandXs.forEach((xs, c) => columnX.set(c, c < 0 ? xs.at(-1)! : xs[0]))
  prev.columnX.forEach((x, c) => {
    if (!columnX.has(c)) columnX.set(c, x)
  })

  // 既存レイアウトの左右端（新規列を外側へ積むための基準）
  let leftEdge = Infinity
  let rightEdge = -Infinity
  newPos.forEach((p) => {
    leftEdge = Math.min(leftEdge, p.x)
    rightEdge = Math.max(rightEdge, p.x)
  })

  // (契約4) 新規の列を既存の外側へ配置する
  const existingCols = new Set(columnX.keys())
  const presentCols = new Set(nodes.map((n) => n.column))
  const newCols = [...presentCols].filter((c) => !existingCols.has(c))
  if (newCols.length > 0) {
    const minExist = Math.min(...existingCols)
    const maxExist = Math.max(...existingCols)
    const STEP = NODE_WIDTH + LAYER_GAP
    let leftCursor = leftEdge
    newCols
      .filter((c) => c < minExist)
      .sort((a, b) => b - a) // 内側（min に近い）から外へ
      .forEach((c) => {
        leftCursor -= STEP
        columnX.set(c, leftCursor)
        bandXs.set(c, [leftCursor])
      })
    let rightCursor = rightEdge
    newCols
      .filter((c) => c > maxExist)
      .sort((a, b) => a - b)
      .forEach((c) => {
        rightCursor += STEP
        columnX.set(c, rightCursor)
        bandXs.set(c, [rightCursor])
      })
    // 稀: 既存の内側に挟まる新規列。最も近い既存列から線形に外挿する
    newCols
      .filter((c) => c > minExist && c < maxExist)
      .forEach((c) => {
        let nearest = minExist
        let best = Infinity
        existingCols.forEach((ec) => {
          const d = Math.abs(ec - c)
          if (d < best) {
            best = d
            nearest = ec
          }
        })
        const x = columnX.get(nearest)! + (c - nearest) * STEP
        columnX.set(c, x)
        bandXs.set(c, [x])
      })
  }

  // (契約2) column が変わった生存ノード → y 維持・x のみ新しい列へ
  nodes.forEach((n) => {
    const pp = prevPos.get(n.id)
    if (pp && pp.column !== n.column && !newPos.has(n.id)) {
      const x = columnX.get(n.column) ?? pp.x
      newPos.set(n.id, { x, y: pp.y, column: n.column })
    }
  })

  // スロット占有判定（幾何）: 同一バンドxで |Δy| < ROW_GAP*0.8 なら占有
  const occupied = (x: number, y: number): boolean => {
    for (const p of newPos.values()) {
      if (Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < ROW_GAP * 0.8) {
        return true
      }
    }
    return false
  }
  // 目標y から ROW_GAP 刻みで上下交互に走査し、空きスロットを返す（下方向優先）
  const findFreeSlot = (x: number, targetY: number): number => {
    if (!occupied(x, targetY)) return targetY
    for (let m = 1; m < 2000; m++) {
      const down = targetY + m * ROW_GAP
      if (!occupied(x, down)) return down
      const up = targetY - m * ROW_GAP
      if (!occupied(x, up)) return up
    }
    return targetY
  }

  // (契約3) 新規扇形ノードを配置する
  const isNew = (n: ImpactGraphNode) => !prevPos.has(n.id)
  const placeNewFan = (n: ImpactGraphNode) => {
    const col = n.column
    const cand = bandXs.get(col) ?? [columnX.get(col) ?? 0]
    const placedNb = (neighbors.get(n.id) ?? [])
      .map((id) => newPos.get(id))
      .filter((p): p is { x: number; y: number; column: number } => !!p)
    const targetY =
      placedNb.length > 0
        ? placedNb.reduce((s, p) => s + p.y, 0) / placedNb.length
        : 0
    // 目標y に最も近い空きスロットを持つバンドを選ぶ
    let bestX = cand[0]
    let bestY = targetY
    let bestDist = Infinity
    cand.forEach((bx) => {
      const y = findFreeSlot(bx, targetY)
      const d = Math.abs(y - targetY)
      if (d < bestDist) {
        bestDist = d
        bestX = bx
        bestY = y
      }
    })
    newPos.set(n.id, { x: bestX, y: bestY, column: col })
  }
  // 配置済み隣接を持つノードを先に置き、目標y の種を広げる（多重掃引）
  const newFan = nodes
    .filter((n) => !isLaneParam(n) && isNew(n))
    .sort((a, b) => a.id.localeCompare(b.id))
  let remaining = [...newFan]
  let progress = true
  while (remaining.length > 0 && progress) {
    progress = false
    const still: ImpactGraphNode[] = []
    for (const n of remaining) {
      const hasPlaced = (neighbors.get(n.id) ?? []).some((id) => newPos.has(id))
      if (hasPlaced) {
        placeNewFan(n)
        progress = true
      } else {
        still.push(n)
      }
    }
    remaining = still
  }
  remaining.forEach(placeNewFan) // 隣接が無いもの（目標y=0）

  // (契約5) パラメータ: 生存はピン済み。新規は列の既存パラメータの上へ積む
  const paramMinY = new Map<number, number>()
  const paramX = new Map<number, number>()
  nodes.forEach((n) => {
    if (!isLaneParam(n)) return
    const p = newPos.get(n.id)
    if (!p) return
    paramMinY.set(n.column, Math.min(paramMinY.get(n.column) ?? Infinity, p.y))
    if (!paramX.has(n.column)) paramX.set(n.column, p.x)
  })
  const paramXFor = (col: number): number => {
    if (paramX.has(col)) return paramX.get(col)!
    const xs = bandXs.get(col)
    if (xs && xs.length > 0) return (xs[0] + xs.at(-1)!) / 2 // 層幅の中央に寄せる
    return columnX.get(col) ?? 0
  }
  nodes
    .filter((n) => isLaneParam(n) && isNew(n))
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((n) => {
      const col = n.column
      const curMin = paramMinY.get(col)
      const y =
        curMin !== undefined ? curMin - ROW_GAP : prev.fanTop - PARAM_LANE_GAP
      const x = paramXFor(col)
      newPos.set(n.id, { x, y, column: col })
      paramMinY.set(col, Math.min(paramMinY.get(col) ?? Infinity, y))
      if (!paramX.has(col)) paramX.set(col, x)
    })

  const positions = new Map<string, { x: number; y: number }>()
  newPos.forEach((p, id) => positions.set(id, { x: p.x, y: p.y }))
  // fanTop は差分では再計算しない（扇が上に伸びてもパラメータレーンを動かさない）
  return { positions, pin: buildPin(nodes, positions, prev.fanTop) }
}

/**
 * column（依存の深さ）ごとに配置する「扇形」レイヤードレイアウト。
 * - X軸 = 依存の深さ、というエンコーディングは維持する
 * - ルート側のサブ列を内側（細く）、外側ほど太く（行数を増やす）扇状に広げる
 * - 層内はバリセンタ（隣接の平均 y）順を y に単調対応させ、エッジの交差を減らす
 * - サブ列は「同心バンド」割当: バリセンタ順の中央付近を内側サブ列、
 *   上下の端を外側サブ列へ置き、エッジが放射状に広がる扇形を保つ
 * - ルート層から外側への掃引後、両隣接層を使って並べ替えを反復し交差をさらに減らす
 * - group ノードは各層の最も外側のバンド（サブ列）に寄せる
 * - パラメータ（ルート以外）は扇形に混ぜず、扇形上端の専用レーンに列ごとに積む
 *
 * 差分モード（prev を渡す）: 上記フルレイアウトの結果をピン留めし、以降の展開
 * （expandedGroups/expandedNodes の変化）では既存ノードを一切動かさない。増えた
 * ノードだけを空きスロットへ差し込み、消えたノードのスロットは解放する。
 * 全体を組み直す（＝既存ノードが動く）のは、ユーザーが「整列」を押して prev=null で
 * 呼び直したときだけ。設計意図: 展開のたびに視界が流れて迷子になるのを防ぐ。
 * prev=null のときは従来どおりフルレイアウトを実行し、その結果から pin を構築する。
 */
// テスト用に純関数として export する（コンポーネントではないため HMR 粒度の警告は無視）。
// eslint-disable-next-line react-refresh/only-export-components
export function layoutNodes(
  graphNodes: ImpactGraphNode[],
  edges: { source: string; target: string }[],
  prev?: LayoutPinState | null,
): { positions: Map<string, { x: number; y: number }>; pin: LayoutPinState } {
  if (prev) {
    const diff = diffLayout(graphNodes, edges, prev)
    if (diff) return diff
    // 生存ノードが無い等 → フルレイアウトへフォールバック
  }
  const byColumn = new Map<number, ImpactGraphNode[]>()
  const paramsByColumn = new Map<number, ImpactGraphNode[]>()
  graphNodes.forEach((n) => {
    const bucket =
      n.kind === 'field' && n.isParameter && !n.isRoot
        ? paramsByColumn
        : byColumn
    if (!bucket.has(n.column)) bucket.set(n.column, [])
    bucket.get(n.column)!.push(n)
  })

  // 隣接リスト（無向）
  const neighbors = new Map<string, string[]>()
  edges.forEach((e) => {
    if (!neighbors.has(e.source)) neighbors.set(e.source, [])
    if (!neighbors.has(e.target)) neighbors.set(e.target, [])
    neighbors.get(e.source)!.push(e.target)
    neighbors.get(e.target)!.push(e.source)
  })

  // ルートに近い層から順に処理する（バリセンタの種になる y が先に決まる）
  const processOrder = Array.from(byColumn.keys()).sort(
    (a, b) => Math.abs(a) - Math.abs(b) || b - a,
  )
  const local = new Map<string, { col: number; lx: number; y: number }>()
  const yOf = new Map<string, number>()
  const layerWidth = new Map<number, number>()

  // サブ列ごとの行数上限: ルート側 FAN_BASE_ROWS 行から外へ +FAN_STEP_ROWS 行ずつ、
  // FAN_MAX_ROWS で頭打ち（仕様C）
  const capOf = (subCol: number) =>
    Math.min(FAN_BASE_ROWS + FAN_STEP_ROWS * subCol, FAN_MAX_ROWS)

  /** 1層分の並べ替えと配置。yOf を更新するので反復呼び出しで精緻化できる */
  const placeLayer = (col: number) => {
    const list = byColumn.get(col)!
    // 非 group ノードのみバリセンタ（隣接の平均 y）で並べ替える。
    // group は既存順のまま非 group の後ろへ回し、必ず外側のバンドへ落とす（仕様D）。
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
    const count = ordered.length

    // バンド（サブ列）ごとの収容数を内側から確定する
    const bandSizes: number[] = []
    let remaining = count
    while (remaining > 0) {
      const c = Math.min(capOf(bandSizes.length), remaining)
      bandSizes.push(c)
      remaining -= c
    }
    const bandCount = bandSizes.length
    layerWidth.set(col, (bandCount - 1) * SUB_COL_PITCH + NODE_WIDTH)

    // 同心バンド割当: バンド 0..s のノードがバリセンタ順位の中央の連続ブロックを
    // 占めるように広げていく。バンド s の担当はブロックの差分（上端と下端の2セグメント）。
    // これでバリセンタ極端なノードほど外側サブ列に置かれ、y はバンド内で単調になる。
    let cumulative = 0
    let prevStart = Math.floor(count / 2)
    let prevEnd = prevStart
    bandSizes.forEach((size, band) => {
      cumulative += size
      const start = Math.floor((count - cumulative) / 2)
      const end = start + cumulative
      const ranks: number[] = []
      for (let r = start; r < prevStart; r++) ranks.push(r)
      for (let r = prevEnd; r < end; r++) ranks.push(r)
      ranks.forEach((r, k) => {
        // eslint-disable-next-line security/detect-object-injection
        const n = ordered[r]
        // 垂直: バンド内はバリセンタ順に上から下へ単調に並べ、センターラインに揃える。
        // ブリック配置: 奇数バンドを半行下げ、水平エッジがノードの隙間を通るようにする
        const y =
          (k - (size - 1) / 2) * ROW_GAP + (band % 2 === 1 ? ROW_GAP / 2 : 0)
        // サブ列の向き: ルート側(バンド0)を層の内側に置く。
        // 上流層(col<0)はバンド0を層の右端に置き外へ向かって左へ、
        // 下流層(col>0)は左端に置き右へ伸ばす（鏡像）。
        const lx =
          col < 0
            ? (bandCount - 1 - band) * SUB_COL_PITCH
            : band * SUB_COL_PITCH
        local.set(n.id, { col, lx, y })
        yOf.set(n.id, y)
      })
      prevStart = start
      prevEnd = end
    })
  }

  // パス1: ルート層から外側へ初期配置（内側の y をバリセンタの種にする）
  processOrder.forEach(placeLayer)
  // パス2: 全ノードの y が出揃った状態で両隣接層を考慮して並べ替えを反復し、交差を減らす
  for (let sweep = 0; sweep < 2; sweep++) {
    processOrder.forEach(placeLayer)
  }

  // パス2: 層の幅を考慮して左から順に x を割り当てる。
  // ルート層の左端を x=0 に固定（アンカー）する。左側の層が展開/折りたたみで
  // 増減しても既存ノードの座標が変わらず、画面中央が流れない。
  // パラメータしか居ない列にも x を割り当てる（幅はノード1枚分）
  const allColumns = new Set([...byColumn.keys(), ...paramsByColumn.keys()])
  const ascending = Array.from(allColumns).sort((a, b) => a - b)
  const layerX = new Map<number, number>()
  let cursor = 0
  ascending.forEach((col) => {
    layerX.set(col, cursor)
    cursor += (layerWidth.get(col) ?? NODE_WIDTH) + LAYER_GAP
  })
  const rootAnchor = layerX.get(0) ?? 0

  const pos = new Map<string, { x: number; y: number }>()
  local.forEach((v, id) => {
    pos.set(id, { x: layerX.get(v.col)! + v.lx - rootAnchor, y: v.y })
  })

  // パラメータレーン: 扇形全体の上端からさらに PARAM_LANE_GAP 離した専用領域。
  // x = 依存の深さ（列）は維持したまま、列ごとに下詰みで積み上げる
  let fanTop = 0
  local.forEach((v) => {
    fanTop = Math.min(fanTop, v.y)
  })
  const barycenter = (n: ImpactGraphNode): number => {
    const ys = (neighbors.get(n.id) || [])
      .map((id) => yOf.get(id))
      .filter((y): y is number => y !== undefined)
    return ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : 0
  }
  paramsByColumn.forEach((list, col) => {
    const sorted = [...list].sort(
      (a, b) => barycenter(a) - barycenter(b) || a.label.localeCompare(b.label),
    )
    const lx = ((layerWidth.get(col) ?? NODE_WIDTH) - NODE_WIDTH) / 2
    sorted.forEach((n, i) => {
      pos.set(n.id, {
        x: layerX.get(col)! + lx - rootAnchor,
        y: fanTop - PARAM_LANE_GAP - (sorted.length - 1 - i) * ROW_GAP,
      })
    })
  })
  // フルレイアウトの結果からピン留め状態を構築して返す
  return { positions: pos, pin: buildPin(graphNodes, pos, fanTop) }
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

/** 全展開ループの安全弁。展開が新たな展開可能ノードを生む構造でも通常は数段で収束するが、
 * 想定外の循環等で無限ループしないよう反復上限を設ける。 */
const FULL_EXPANSION_MAX_PASSES = 20

/**
 * 「展開できるノードが無くなるまで」展開した状態（expandedGroups / expandedNodes）を
 * 計算する純関数（固定点ループ）。
 *
 * 展開は新たな展開可能ノードを生む（例: A を展開して現れた B がさらに expandable になる、
 * group を展開して現れた計算フィールドがさらに外側を持つ）ため、1 回の走査では収束しない。
 * そこで、追加が無くなるまで buildImpactGraph → 展開対象の収集を反復する。
 * 集合は単調増加（追加のみ）なので有限回で必ず収束するが、保険として
 * FULL_EXPANSION_MAX_PASSES を上限に置く。また buildImpactGraph が
 * GRAPH_MAX_FIELD_NODES 到達で truncated を返したら、それ以上ノードを膨らませず打ち切る
 * （表示破綻防止のための上限であり、全展開もこの上限には従う）。
 *
 * base のセットは破壊しない（コピーから開始する）。
 */
// eslint-disable-next-line react-refresh/only-export-components -- テスト用に純関数を同居エクスポート（layoutNodes と同方針）
export function collectFullExpansion(
  doc: TableauDocument,
  root: GraphRootRef,
  baseGroups: ReadonlySet<string>,
  baseNodes: ReadonlySet<string>,
): { groups: Set<string>; nodes: Set<string> } {
  const groups = new Set(baseGroups)
  const nodes = new Set(baseNodes)

  for (let pass = 0; pass < FULL_EXPANSION_MAX_PASSES; pass++) {
    const graph = buildImpactGraph(doc, root, {
      expandedGroups: groups,
      expandedNodes: nodes,
    })
    if (!graph) break

    let added = false
    for (const node of graph.nodes) {
      if (node.kind === 'group') {
        if (!groups.has(node.id)) {
          groups.add(node.id)
          added = true
        }
      } else if ((node.expandableCount ?? 0) > 0 && !node.isExpanded) {
        if (!nodes.has(node.id)) {
          nodes.add(node.id)
          added = true
        }
      }
    }

    // 追加が無ければ固定点。truncated は表示上限に達した打ち切り。
    if (!added || graph.truncated) break
  }

  return { groups, nodes }
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
  // 「整列」の世代。インクリメントで pin を捨ててフル再レイアウトを促す
  const [relayoutEpoch, setRelayoutEpoch] = useState(0)
  // ピン留めレイアウトの持ち越しキャッシュ（レンダー間で前回結果を引き継ぐ）。
  // 展開のたびにここを基準に差分配置し、既存ノードを動かさない。
  // root 変更・「整列」押下ではフル再計算する。deps が正しいためレンダー中の
  // 参照更新は決定的で冪等（StrictMode の二重実行でも同じ結果になる）。
  const layoutCacheRef = useRef<{
    pin: LayoutPinState
    rootKey: string
    epoch: number
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

  // ノード上の ◎ ボタン: このオブジェクトを中心にグラフを再構成する
  const handleRecenterNode = useCallback(
    (gn: ImpactGraphNode) => {
      setHover(null)
      const ref = nodeToRootRef(gn)
      if (ref) recenter(ref)
    },
    [recenter],
  )

  // 「整列」ボタン: ピン留めを捨ててレイアウトを組み直す（既存ノードも動く）
  const handleRelayout = useCallback(() => {
    setRelayoutEpoch((e) => e + 1)
  }, [])

  // 「全展開」ボタン: 展開できるノード・group が無くなるまで一括展開する。
  // 固定点は collectFullExpansion が現在の展開集合を起点に一度だけ算出し、
  // その結果で両展開集合をまとめて差し替える。
  const handleExpandAll = useCallback(() => {
    const { groups, nodes } = collectFullExpansion(
      doc,
      root,
      expandedGroups,
      expandedNodes,
    )
    setExpandedGroups(groups)
    setExpandedNodes(nodes)
  }, [doc, root, expandedGroups, expandedNodes])

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph) return { flowNodes: [], flowEdges: [] }
    // root が変わった or「整列」が押されたらフル、それ以外は前回 pin からの差分。
    // レイアウトキャッシュはレンダー間の持ち越しに用いる意図的な用途のため、
    // レンダー中の ref 参照/更新を許可する（deps が正しく冪等）。
    const rootKey = `${root.kind}:${root.name}`
    /* eslint-disable react-hooks/refs -- 意図的なレンダー間レイアウトキャッシュ */
    const cache = layoutCacheRef.current
    const carryOver =
      cache && cache.rootKey === rootKey && cache.epoch === relayoutEpoch
    const prevPin = carryOver ? cache.pin : null
    const { positions, pin } = layoutNodes(graph.nodes, graph.edges, prevPin)
    layoutCacheRef.current = { pin, rootKey, epoch: relayoutEpoch }
    /* eslint-enable react-hooks/refs */
    const rootNodeId = graph.nodes.find((n) => n.isRoot)?.id

    const flowNodes: Node[] = graph.nodes.map((gn) => ({
      id: gn.id,
      type: 'impactCard',
      position: positions.get(gn.id) || { x: 0, y: 0 },
      data: {
        graphNode: gn,
        onToggleExpand: toggleNodeExpand,
        onRecenter: handleRecenterNode,
      },
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
  }, [graph, root, relayoutEpoch, toggleNodeExpand, handleRecenterNode])

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

  // クリック = その場で開く/閉じる（探索の基本操作）。
  // 中心の切り替えはノード上の ◎ ボタン（onRecenter）だけが行う。
  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      setHover(null)
      const gn = (node.data as { graphNode: ImpactGraphNode }).graphNode
      // 集約ノードはその層を展開する（モーフィング effect が発火）
      if (gn.kind === 'group') {
        setExpandedGroups((prev) => new Set(prev).add(node.id))
        return
      }
      if (gn.isRoot || gn.isUnresolved) return
      // 開ける先がある、または展開済みならトグル。何もなければ何もしない
      if ((gn.expandableCount ?? 0) > 0 || gn.isExpanded) {
        toggleNodeExpand(gn.id)
      }
    },
    [toggleNodeExpand],
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
    { color: 'bg-violet-400', label: t('graph.parameter') },
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
          : gn.isParameter
            ? SlidersHorizontal
            : Hash
    const iconColor =
      gn.kind === 'sheet'
        ? 'text-blue-500'
        : gn.kind === 'dashboard'
          ? 'text-rose-500'
          : gn.isParameter
            ? 'text-violet-500'
            : gn.column < 0
              ? 'text-purple-500'
              : 'text-emerald-500'
    return (
      <button
        key={gn.id}
        disabled={!ref || gn.isUnresolved}
        onClick={() => ref && recenter(ref)}
        className={`w-full flex items-center gap-2 px-3 py-2 bg-white border border-slate-100 rounded-xl transition text-left ${
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
          <span className="ml-auto text-[9px] font-black text-slate-400 shrink-0">
            {gn.column < 0 ? '↑' : '↓'}
            {Math.abs(gn.column)}
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      className="impact-modal fixed inset-0 z-[80] flex flex-col bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-label={`${t('graph.title')} — ${rootLabel}`}
    >
      <div className="m-3 sm:m-6 flex-1 flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* ヘッダー */}
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            {history.length > 0 && (
              <button
                onClick={goBack}
                data-testid="graph-back-button"
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-600 group shrink-0"
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
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
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
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition active:scale-95"
              >
                {t('graph.open_detail')}
                <ArrowUpRight size={12} />
              </button>
            )}
            <button
              onClick={handleExpandAll}
              data-testid="graph-expand-all"
              title={t('graph.expand_all_hint')}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition active:scale-95"
            >
              {t('graph.expand_all')}
              <Expand size={12} />
            </button>
            <button
              onClick={handleRelayout}
              data-testid="graph-relayout"
              title={t('graph.relayout_hint')}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition active:scale-95"
            >
              {t('graph.relayout')}
              <LayoutGrid size={12} />
            </button>
          </div>
          <div className="hidden lg:flex items-center gap-4 shrink-0">
            {legend.map((item) => (
              <span
                key={item.label}
                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                {item.label}
              </span>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-50 hover:text-red-500 rounded-xl transition text-slate-500 shrink-0"
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
                  if (gn.isParameter) return '#a78bfa'
                  return gn.column < 0 ? '#d8b4fe' : '#6ee7b7'
                }}
                style={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                }}
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
                            <p className="text-[11px] text-slate-500">
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
                        <h5 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
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
                        <h5 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
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
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
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
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
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
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
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
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
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
                <p className="text-xs text-slate-500 italic">
                  {t('drawer.impact_none')}
                </p>
              )}
          </aside>
        </div>
      </div>
    </div>
  )
}
