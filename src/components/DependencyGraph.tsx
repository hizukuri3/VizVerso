import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react'
import { useEffect, useCallback, useRef, useState } from 'react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface DependencyGraphProps {
  nodes: Node[]
  edges: Edge[]
}

export default function DependencyGraph({
  nodes: initialNodes,
  edges: initialEdges,
}: DependencyGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView } = useReactFlow()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // useRef で「初回フィット済みか」を管理。useState では useEffect の deps に入り無限ループを招く。
  const hasFittedRef = useRef(false)

  // ────────────────────────────────────────
  // データ変更時: ルートノード（ダッシュボード）を初期展開
  // ────────────────────────────────────────
  useEffect(() => {
    hasFittedRef.current = false // 新データのたびに fitView を許可

    const dashboardIds = initialNodes
      .filter((n) => n.data.type === 'dashboard')
      .map((n) => n.id)
    const worksheetIds = initialNodes
      .filter((n) => n.data.type === 'worksheet')
      .map((n) => n.id)

    const rootIds = dashboardIds.length > 0 ? dashboardIds : worksheetIds
    setTimeout(() => setExpandedNodes(new Set(rootIds)), 0)
  }, [initialNodes])

  // ────────────────────────────────────────
  // 表示ノード/エッジの計算
  // ────────────────────────────────────────
  useEffect(() => {
    const visibleNodeIds = new Set<string>()
    const visibleEdgeIds = new Set<string>()

    // ルートノードは常に表示（ダッシュボード、なければワークシート）
    initialNodes.forEach((n) => {
      if (n.data.type === 'dashboard') visibleNodeIds.add(n.id)
    })
    if (visibleNodeIds.size === 0) {
      initialNodes.forEach((n) => {
        if (n.data.type === 'worksheet') visibleNodeIds.add(n.id)
      })
    }

    // 展開されたノードの子ノード（1段階）を表示
    expandedNodes.forEach((id) => {
      visibleNodeIds.add(id)
      initialEdges.forEach((edge) => {
        if (edge.source === id) {
          visibleEdgeIds.add(edge.id)
          visibleNodeIds.add(edge.target)
        }
      })
    })

    setTimeout(() => {
      setNodes(
        initialNodes.map((n) => ({ ...n, hidden: !visibleNodeIds.has(n.id) })),
      )
      setEdges(
        initialEdges.map((e) => ({ ...e, hidden: !visibleEdgeIds.has(e.id) })),
      )
    }, 0)

    // 初回のみ fitView を実行。以後はクリックしても動かない。
    if (!hasFittedRef.current && initialNodes.length > 0) {
      hasFittedRef.current = true
      setTimeout(() => fitView({ duration: 600, padding: 0.3 }), 150)
    }
  }, [expandedNodes, initialNodes, initialEdges, fitView, setNodes, setEdges])

  // ────────────────────────────────────────
  // クリックで展開 / 折りたたみ
  // ────────────────────────────────────────
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(node.id)) {
        next.delete(node.id)
      } else {
        next.add(node.id)
      }
      return next
    })
  }, [])

  const handleFitView = () => fitView({ duration: 500, padding: 0.2 })

  return (
    <div className="w-full h-[750px] border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 shadow-xl relative animate-in fade-in zoom-in-95 duration-500">
      {/* ツールバー */}
      <div className="absolute top-3 left-3 z-10 flex gap-2 items-center">
        <div className="bg-white/90 backdrop-blur-md px-3 py-2 rounded-lg shadow-sm border border-slate-200 text-xs text-slate-500">
          💡 クリックして展開 / 折りたたみ
        </div>
        <button
          onClick={handleFitView}
          className="bg-white hover:bg-blue-50 px-3 py-2 rounded-lg shadow-sm border border-slate-200 text-xs font-semibold text-blue-600 transition-colors"
        >
          🏠 全体を表示
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        attributionPosition="bottom-right"
        minZoom={0.03}
        maxZoom={3}
        nodesDraggable
        panOnScroll
      >
        <MiniMap
          nodeColor={(n) => {
            const t = n.data?.type
            if (t === 'dashboard') return '#fca5a5'
            if (t === 'worksheet') return '#fcd34d'
            if (t === 'field') return '#86efac'
            return '#93c5fd'
          }}
          style={{ borderRadius: '10px' }}
          zoomable
          pannable
        />
        <Controls />
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#cbd5e1"
        />
      </ReactFlow>
    </div>
  )
}
