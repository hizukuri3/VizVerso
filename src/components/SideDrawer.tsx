import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { X, ArrowRight, ArrowLeft, Hash, Info, ChevronRight } from 'lucide-react'
import { t } from '../utils/i18n'
import type { TableauDocument, TableauField } from '../types/tableau'
import { FormulaHighlighter } from './FormulaHighlighter'
import { useDependencyIndex } from '../hooks/useDependencyIndex'
import { normalizeFieldId } from '../utils/xmlParser'

import { formatFormulaText } from '../utils/formulaFormatter'

interface SideDrawerProps {
  isOpen: boolean
  onClose: () => void
  doc: TableauDocument
  targetFieldName: string | null
  searchQuery?: string
  onNavigateField: (fieldName: string) => void
  onNavigateToSheet?: (sheetName: string) => void
}

export function SideDrawer({
  isOpen,
  onClose,
  doc,
  targetFieldName,
  searchQuery,
  onNavigateField,
  onNavigateToSheet,
}: SideDrawerProps) {
  const index = useDependencyIndex(doc)
  const drawerRef = useRef<HTMLDivElement>(null)
  
  // ナビゲーション履歴の管理
  const [history, setHistory] = useState<string[]>([])

  const fieldInfo = useMemo(() => index?.getFieldInfo(targetFieldName || ''), [index, targetFieldName])
  const field = fieldInfo?.field
  const cleanTargetName = useMemo(() => normalizeFieldId(targetFieldName || ''), [targetFieldName])
  const resolvedFieldName = field?.column || cleanTargetName || ''

  // フィールドメタデータの構築（formatter用）
  const fieldMetaForFormatter = useMemo(() => {
    const meta = new Map<string, { caption?: string }>()
    if (!index) return meta
    
    index.fields.forEach((info, name) => {
      meta.set(name, { caption: info.field.caption })
    })
    return meta
  }, [index])

  // 依存関係の取得
  const upstreamNames = useMemo(() => {
    const formula = fieldInfo?.resolvedFormula
    if (!formula) return []
    // [Field Name] 形式の抽出
    const matches = Array.from(formula.matchAll(/\[([^\]]+)\]/g)).map(m => m[1])
    return Array.from(new Set(matches.filter(name => name !== resolvedFieldName)))
  }, [fieldInfo, resolvedFieldName])

  // このフィールドを使用しているシート
  const sheetNames = useMemo(() => {
    if (!resolvedFieldName || !index) return []
    return Array.from(index.fieldToSheets.get(resolvedFieldName) || [])
  }, [index, resolvedFieldName])

  // 下流 (Downstream): この項目を参照している項目 (Referenced by)
  const downstreamNames = useMemo(() => {
    if (!resolvedFieldName || !index) return []
    return Array.from(index.fieldToParents.get(resolvedFieldName) || [])
  }, [index, resolvedFieldName])

  // ナビゲーション時の処理
  const handleDrillDown = (nextField: string) => {
    if (targetFieldName) {
      setHistory(prev => [...prev, targetFieldName])
    }
    onNavigateField(nextField)
  }

  // 戻る処理
  const handleBack = () => {
    const prev = history[history.length - 1]
    if (prev) {
      setHistory(prevHistory => prevHistory.slice(0, -1))
      onNavigateField(prev)
    }
  }

  // 表示用に計算式を整形
  const formattedFormula = useMemo(() => {
    const formula = fieldInfo?.resolvedFormula
    if (!formula) return undefined
    return formatFormulaText(formula, fieldMetaForFormatter)
  }, [fieldInfo, fieldMetaForFormatter])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
      setHistory([]) // 閉じる時に履歴をクリア
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div 
        className="drawer-backdrop fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[60] transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        ref={drawerRef}
        className="side-drawer fixed inset-y-0 right-0 w-[40%] max-w-2xl bg-white shadow-2xl z-[70] flex flex-col animate-in slide-in-from-right duration-500 ease-out border-l border-slate-200"
      >
        <header className="p-8 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4 overflow-hidden">
            {history.length > 0 && (
              <button 
                onClick={handleBack}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600 group shrink-0"
                title={t('button.back') || '戻る'}
              >
                <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
              </button>
            )}
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${formattedFormula ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  {formattedFormula ? t('detail.calculated_fields') : t('detail.standard_fields')}
                </span>
                {fieldInfo?.parentCaption && (
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                    {fieldInfo.parentCaption}
                  </span>
                )}
                {fieldInfo?.resolvedDataType && (
                  <>
                    <span className="text-slate-200 mx-1">•</span>
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">
                      {fieldInfo.resolvedDataType}
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight truncate" title={fieldInfo?.resolvedCaption || cleanTargetName || ''}>
                {fieldInfo?.resolvedCaption || cleanTargetName || ''}
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all text-slate-400 shrink-0"
          >
            <X size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-10">
          {/* 計算式セクション */}
          {formattedFormula && (
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                {t('drawer.formula')}
              </h3>
              <FormulaHighlighter formula={formattedFormula} searchQuery={searchQuery} />
            </section>
          )}

          {/* パラメータ設定セクション */}
          {field?.paramDomainType && (
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-4 bg-purple-500 rounded-full" />
                {t('detail.param_settings')}
              </h3>
              <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-6 space-y-6">
                {field.paramDomainType === 'list' && field.paramMembers && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('detail.list')}</p>
                    <div className="grid grid-cols-1 gap-2">
                      {field.paramMembers.map((m, i) => (
                        <div key={i} className="px-4 py-2 bg-white border border-slate-100 rounded-xl text-sm flex justify-between items-center shadow-sm">
                          <span className="font-bold text-slate-700">{m.alias || m.value}</span>
                          {m.alias && <span className="text-[10px] text-slate-400">Value: {m.value}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {field.paramDomainType === 'range' && field.paramRange && (
                   <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('detail.range')}</p>
                    <div className="flex items-center justify-between px-2">
                       <div className="text-center">
                         <p className="text-[9px] text-slate-400 uppercase font-bold mb-1">{t('detail.min')}</p>
                         <p className="text-lg font-black text-slate-700">{field.paramRange.min}</p>
                       </div>
                       <div className="text-center">
                         <p className="text-[9px] text-slate-400 uppercase font-bold mb-1">{t('detail.max')}</p>
                         <p className="text-lg font-black text-slate-700">{field.paramRange.max}</p>
                       </div>
                       {field.paramRange.step && (
                         <div className="text-center">
                           <p className="text-[9px] text-slate-400 uppercase font-bold mb-1">{t('detail.step')}</p>
                           <p className="text-lg font-black text-slate-700">{field.paramRange.step}</p>
                         </div>
                       )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 使用されているシート */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-4 bg-blue-500 rounded-full" />
              {t('nav.sheets')} ({sheetNames.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {sheetNames.length > 0 ? sheetNames.map(name => {
                const ws = doc.worksheets.find(w => w.name === name);
                const displayName = ws?.caption || name;
                return (
                  <button 
                    key={name}
                    onClick={() => onNavigateToSheet?.(name)}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-bold rounded-xl border border-blue-100 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm transition-all active:scale-95 text-left"
                  >
                    {displayName}
                  </button>
                );
              }) : (
                <p className="text-sm text-slate-400 italic py-2 pl-4">{t('drawer.no_sheets')}</p>
              )}
            </div>
          </section>

          {/* 依存関係: 上流 (Sources / この項目が参照している) */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-4 bg-purple-500 rounded-full" />
              {t('drawer.upstream')} ({upstreamNames.length})
            </h3>
            <div className="grid gap-2">
              {upstreamNames.length > 0 ? upstreamNames.map(name => {
                const info = index?.fields?.get(name)
                // index に存在しないフィールド（システムの組み込み項目など）はクリック不可に
                const exists = !!info
                return (
                  <button 
                    key={name}
                    disabled={!exists}
                    onClick={() => handleDrillDown(name)}
                    className={`flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl transition-all group text-left ${exists ? 'hover:border-purple-300 hover:shadow-md' : 'opacity-60 cursor-not-allowed'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg transition-colors ${exists ? 'bg-purple-50 text-purple-600 group-hover:bg-purple-100' : 'bg-slate-100 text-slate-400'}`}>
                        <Hash size={14} />
                      </div>
                      <span className="text-sm font-bold text-slate-700">
                        {(() => {
                          const cap = info?.field.caption || name
                          return cap.startsWith('[') && cap.endsWith(']') ? cap.substring(1, cap.length - 1) : cap
                        })()}
                      </span>
                    </div>
                    {exists && <ChevronRight size={16} className="text-slate-300 group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />}
                  </button>
                )
              }) : (
                <p className="text-sm text-slate-400 italic py-2 pl-4">{t('drawer.no_upstream')}</p>
              )}
            </div>
          </section>

          {/* 依存関係: 下流 (Consumers / この項目を参照している) */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
              {t('drawer.downstream')} ({downstreamNames.length})
            </h3>
            <div className="grid gap-2">
              {downstreamNames.length > 0 ? downstreamNames.map(name => {
                const info = index?.fields?.get(name)
                return (
                  <button 
                    key={name}
                    onClick={() => handleDrillDown(name)}
                    className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-emerald-300 hover:shadow-md transition-all group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100 transition-colors">
                        <Hash size={14} />
                      </div>
                      <span className="text-sm font-bold text-slate-700">
                        {(() => {
                          const cap = info?.field.caption || name
                          return cap.startsWith('[') && cap.endsWith(']') ? cap.substring(1, cap.length - 1) : cap
                        })()}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                  </button>
                )
              }) : (
                <p className="text-sm text-slate-400 italic py-2 pl-4">{t('drawer.no_downstream')}</p>
              )}
            </div>
          </section>
        </div>

        <footer className="p-8 border-t border-slate-100 bg-slate-50/30">
          <p className="text-[10px] text-slate-300 font-medium text-center uppercase tracking-[0.2em]">
            Verso-viz Dependency Explorer
          </p>
        </footer>
      </div>
    </>
  )
}

