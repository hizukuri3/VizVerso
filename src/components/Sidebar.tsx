import React, { useState, useEffect } from 'react'
import {
  Layout,
  FileText,
  ChevronRight,
  Database,
  GitBranch,
  HeartPulse,
} from 'lucide-react'
import { t } from '../utils/i18n'
import type { TableauDocument } from '../types/tableau'
import type { GraphRootRef } from '../utils/impactAnalyzer'

interface SidebarProps {
  doc: TableauDocument
  fileName?: string
  selectedId: string | null
  onSelect: (type: 'dashboard' | 'worksheet' | 'datasource', id: string) => void
  /** 項目の依存グラフを開く（ホバーで表示されるアイコンから） */
  onOpenGraph?: (ref: GraphRootRef) => void
  /** ワークブック ヘルスチェックビューを開く */
  onOpenHealth?: () => void
  /** ヘルスチェックビューが選択中か（ハイライト表示用） */
  isHealthActive?: boolean
  onOpenLegal?: () => void
  onOpenPrivacy?: () => void
}

/** サイドバー項目のホバーで表示される依存グラフ起動ボタン */
function GraphIconButton({
  graphRef,
  onOpenGraph,
}: {
  graphRef: GraphRootRef
  onOpenGraph?: (ref: GraphRootRef) => void
}) {
  if (!onOpenGraph) return null
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onOpenGraph(graphRef)
      }}
      title={t('graph.title')}
      data-testid={`sidebar-graph-${graphRef.kind}-${graphRef.name}`}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg border border-transparent text-slate-300 transition-all group-hover:bg-white group-hover:border-slate-200 group-hover:text-indigo-500 group-hover:shadow-sm hover:ring-2 hover:ring-indigo-200 hover:text-indigo-600 active:scale-95"
    >
      <GitBranch size={13} />
    </button>
  )
}

export default function Sidebar({
  doc,
  fileName,
  selectedId,
  onSelect,
  onOpenGraph,
  onOpenHealth,
  isHealthActive,
  onOpenLegal,
  onOpenPrivacy,
}: SidebarProps) {
  const [expandedDashboardId, setExpandedDashboardId] = useState<string | null>(
    null,
  )

  useEffect(() => {
    // もしダッシュボードが選択されていて、かつそれが展開されていない場合は展開する
    const isDashboard = doc.dashboards.some((d) => d.name === selectedId)
    if (isDashboard && selectedId !== expandedDashboardId) {
      setTimeout(() => setExpandedDashboardId(selectedId), 0)
    }
  }, [selectedId, doc.dashboards, expandedDashboardId])

  const toggleDashboard = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setExpandedDashboardId(expandedDashboardId === id ? null : id)
    onSelect('dashboard', id)
  }

  const handleItemClick = (
    e: React.MouseEvent,
    type: 'dashboard' | 'worksheet' | 'datasource',
    id: string,
  ) => {
    e.stopPropagation()
    onSelect(type, id)
  }

  // すべてのダッシュボードに含まれるシート名を収集
  const allDashboardSheets = new Set(
    doc.dashboards.flatMap((db) => db.worksheets),
  )

  // ダッシュボードに含まれない「浮いた」シートを抽出
  const floatingSheets = doc.worksheets.filter(
    (ws) => !allDashboardSheets.has(ws.name),
  )

  return (
    <aside className="w-80 flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          {t('nav.navigator')}
        </h2>
        {fileName && (
          <div className="flex items-center gap-2.5 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
              <FileText size={14} />
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight leading-none mb-1">
                Analyzing File
              </p>
              <p
                className="text-xs font-black text-slate-700 truncate leading-tight"
                title={fileName}
              >
                {fileName}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 p-4 pb-8 space-y-8 overflow-y-auto">
        {/* Health Check（ワークブック全体の計算フィールド健全性チェック） */}
        <div>
          <button
            onClick={onOpenHealth}
            data-testid="sidebar-health-nav"
            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 ${
              isHealthActive
                ? 'sidebar-item-active shadow-sm'
                : 'hover:bg-slate-50 text-slate-600'
            }`}
          >
            <HeartPulse
              size={14}
              className={isHealthActive ? 'text-blue-500' : 'text-rose-400'}
            />
            <span className="truncate font-semibold">{t('health.nav')}</span>
          </button>
        </div>

        {/* Dashboards Section */}
        {doc.dashboards.length > 0 && (
          <div>
            <h3 className="px-3 mb-3 text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Layout size={14} className="text-blue-500 opacity-70" />{' '}
              {t('nav.dashboards')}
            </h3>
            <div className="space-y-1">
              {doc.dashboards.map((db) => {
                const isExpanded = expandedDashboardId === db.name
                const isActive = selectedId === db.name

                return (
                  <div key={db.name}>
                    <div className="relative group">
                      <button
                        onClick={(e) => toggleDashboard(e, db.name)}
                        className={`w-full text-left px-3 py-2 pr-9 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 ${
                          isActive
                            ? 'sidebar-item-active shadow-sm'
                            : 'hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <ChevronRight
                          size={14}
                          className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        <span
                          className="truncate font-semibold"
                          title={db.name}
                        >
                          {db.name}
                        </span>
                      </button>
                      <GraphIconButton
                        graphRef={{ kind: 'dashboard', name: db.name }}
                        onOpenGraph={onOpenGraph}
                      />
                    </div>

                    {/* Sheets within this Dashboard */}
                    {isExpanded && (
                      <div className="ml-6 mt-1 space-y-1 border-l-2 border-slate-100 pl-3 animate-in slide-in-from-top-1 duration-200">
                        {db.worksheets.map((wsName) => {
                          const wsObj = doc.worksheets.find(
                            (w) => w.name === wsName,
                          )
                          const displayName = wsObj?.caption || wsName
                          return (
                            <div key={wsName} className="relative group">
                              <button
                                onClick={(e) =>
                                  handleItemClick(e, 'worksheet', wsName)
                                }
                                className={`w-full text-left px-3 py-1.5 pr-9 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                                  selectedId === wsName
                                    ? 'bg-blue-50 text-blue-700 font-bold'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-blue-600'
                                }`}
                              >
                                <FileText
                                  size={12}
                                  className={
                                    selectedId === wsName
                                      ? 'text-blue-500'
                                      : 'text-slate-300'
                                  }
                                />
                                <span className="truncate" title={displayName}>
                                  {displayName}
                                </span>
                              </button>
                              <GraphIconButton
                                graphRef={{ kind: 'sheet', name: wsName }}
                                onOpenGraph={onOpenGraph}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Floating Sheets Section */}
        {floatingSheets.length > 0 && (
          <div>
            <h3 className="px-3 mb-3 text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <FileText size={14} className="text-emerald-500 opacity-70" />{' '}
              {t('nav.sheets')}
            </h3>
            <div className="space-y-1">
              {floatingSheets.map((ws) => (
                <div key={ws.name} className="relative group">
                  <button
                    onClick={(e) => handleItemClick(e, 'worksheet', ws.name)}
                    className={`w-full text-left px-3 py-2 pr-9 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 ${
                      selectedId === ws.name
                        ? 'sidebar-item-active shadow-sm'
                        : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <FileText
                      size={14}
                      className={
                        selectedId === ws.name
                          ? 'text-blue-500'
                          : 'text-slate-300'
                      }
                    />
                    <span
                      className="truncate font-semibold"
                      title={ws.caption || ws.name}
                    >
                      {ws.caption || ws.name}
                    </span>
                  </button>
                  <GraphIconButton
                    graphRef={{ kind: 'sheet', name: ws.name }}
                    onOpenGraph={onOpenGraph}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Datasources Section */}
        <div>
          <h3 className="px-3 mb-3 text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Database size={14} className="text-amber-500 opacity-70" />{' '}
            {t('nav.datasources')}
          </h3>
          <div className="space-y-1">
            {doc.datasources.map((ds) => (
              <button
                key={ds.name}
                onClick={(e) => handleItemClick(e, 'datasource', ds.name)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 group ${
                  selectedId === ds.name
                    ? 'sidebar-item-active shadow-sm'
                    : 'hover:bg-slate-50 text-slate-600'
                }`}
              >
                <Database
                  size={14}
                  className={
                    selectedId === ds.name ? 'text-blue-500' : 'text-slate-300'
                  }
                />
                <span
                  className="truncate font-semibold"
                  title={ds.caption || ds.name}
                >
                  {ds.caption || ds.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-slate-100 mt-auto bg-slate-50/30">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenLegal}
              className="text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wider"
            >
              {t('legal.title')}
            </button>
            <div className="w-1 h-1 bg-slate-200 rounded-full" />
            <button
              onClick={onOpenPrivacy}
              className="text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wider"
            >
              {t('privacy.title')}
            </button>
          </div>
          <p className="text-[9px] text-slate-300 font-bold uppercase tracking-[0.2em]">
            © {new Date().getFullYear()} VizVerso
          </p>
        </div>
      </div>
    </aside>
  )
}
