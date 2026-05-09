import React, { useState, useEffect } from 'react'
import { Layout, FileText, ChevronRight, Database } from 'lucide-react'
import { t } from '../utils/i18n'
import type { TableauDocument } from '../types/tableau'

interface SidebarProps {
  doc: TableauDocument
  fileName?: string
  selectedId: string | null
  onSelect: (type: 'dashboard' | 'worksheet' | 'datasource', id: string) => void
}

export default function Sidebar({
  doc,
  fileName,
  selectedId,
  onSelect,
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

      <div className="flex-1 p-4 space-y-8">
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
                    <button
                      onClick={(e) => toggleDashboard(e, db.name)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 group ${
                        isActive
                          ? 'sidebar-item-active shadow-sm'
                          : 'hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <ChevronRight
                        size={14}
                        className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                      <span className="truncate font-semibold">{db.name}</span>
                    </button>

                    {/* Sheets within this Dashboard */}
                    {isExpanded && (
                      <div className="ml-6 mt-1 space-y-1 border-l-2 border-slate-100 pl-3 animate-in slide-in-from-top-1 duration-200">
                        {db.worksheets.map((wsName) => {
                          const wsObj = doc.worksheets.find(
                            (w) => w.name === wsName,
                          )
                          const displayName = wsObj?.caption || wsName
                          return (
                            <button
                              key={wsName}
                              onClick={(e) =>
                                handleItemClick(e, 'worksheet', wsName)
                              }
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
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
                              <span className="truncate">{displayName}</span>
                            </button>
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
                <button
                  key={ws.name}
                  onClick={(e) => handleItemClick(e, 'worksheet', ws.name)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 group ${
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
                  <span className="truncate font-semibold">
                    {ws.caption || ws.name}
                  </span>
                </button>
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
                <span className="truncate font-semibold">
                  {ds.caption || ds.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
