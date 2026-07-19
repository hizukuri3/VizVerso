import { useEffect, useRef, useMemo, useState } from 'react'
import {
  X,
  ArrowLeft,
  Hash,
  ChevronRight,
  Copy,
  Check,
  GitBranch,
} from 'lucide-react'
import { t } from '../utils/i18n'
import type { TableauDocument } from '../types/tableau'
import type { CalcType } from '../utils/calcClassifier'
import { FormulaHighlighter } from './FormulaHighlighter'
import { useDependencyIndex } from '../hooks/useDependencyIndex'
import { normalizeFieldId } from '../utils/xmlParser'
import { analyzeFieldUsage } from '../utils/usageAnalyzer'
import { analyzeImpact } from '../utils/impactAnalyzer'
import {
  buildUpstreamTree,
  type DependencyTreeNode,
} from '../utils/dependencyTree'

import { formatFormulaText } from '../utils/formulaFormatter'

// 依存ツリーの最大展開深度（buildUpstreamTree の既定値と一致させる）
const TREE_MAX_DEPTH = 10

/** キャプションが [ ] で囲まれている場合は括弧を除去して表示名にする */
function stripBracketCaption(caption: string): string {
  return caption.startsWith('[') && caption.endsWith(']')
    ? caption.substring(1, caption.length - 1)
    : caption
}

/** 計算式種別ごとのバッジ表記とカラークラスを返す（非計算は null） */
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
    case 'regular':
      return {
        label: t('calctype.regular'),
        className: 'bg-slate-100 text-slate-500 border border-slate-200',
      }
    default:
      return null
  }
}

interface DependencyTreeItemProps {
  node: DependencyTreeNode
  depth: number
  onNavigate: (fieldId: string) => void
}

/**
 * 依存ツリーの1ノードを再帰的に描画する。
 * - 解決済みノードはクリックでドリルダウン（既存の履歴機構に乗る）
 * - 未解決ノードはグレーアウトして無効化
 * - 循環参照ノードには注記を表示し、子は展開しない
 */
function DependencyTreeItem({
  node,
  depth,
  onNavigate,
}: DependencyTreeItemProps) {
  const clickable = !node.isUnresolved
  const label = stripBracketCaption(node.caption)
  const badge = node.isCalc ? calcTypeBadge(node.calcType) : null

  return (
    <div>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => clickable && onNavigate(node.fieldId)}
        style={{ marginLeft: depth * 16 }}
        className={`w-full flex items-center gap-2 p-3 bg-white border border-slate-100 rounded-xl transition group text-left ${
          clickable
            ? 'hover:border-purple-300 hover:shadow-sm'
            : 'opacity-60 cursor-not-allowed'
        }`}
      >
        <div
          className={`p-1.5 rounded-lg transition-colors shrink-0 ${
            clickable
              ? 'bg-purple-50 text-purple-600 group-hover:bg-purple-100'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          <Hash size={14} />
        </div>
        {badge && (
          <span
            className={`whitespace-nowrap text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
        <span
          className="text-sm font-bold text-slate-700 truncate"
          title={label}
        >
          {label}
        </span>
        {node.isCircular && (
          <span className="whitespace-nowrap text-[9px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
            {t('drawer.circular_ref')}
          </span>
        )}
        {clickable && (
          <ChevronRight
            size={16}
            className="ml-auto text-slate-400 group-hover:text-purple-500 group-hover:translate-x-1 transition shrink-0"
          />
        )}
      </button>
      {node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <DependencyTreeItem
              key={child.fieldId}
              node={child}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SideDrawerProps {
  isOpen: boolean
  onClose: () => void
  doc: TableauDocument
  targetFieldName: string | null
  searchQuery?: string
  onNavigateField: (fieldName: string) => void
  onNavigateToSheet?: (sheetName: string) => void
  /** 依存グラフを開く（モーダルは App が所有する） */
  onOpenGraph?: (fieldName: string) => void
}

export function SideDrawer({
  isOpen,
  onClose,
  doc,
  targetFieldName,
  searchQuery,
  onNavigateField,
  onNavigateToSheet,
  onOpenGraph,
}: SideDrawerProps) {
  const index = useDependencyIndex(doc)
  const drawerRef = useRef<HTMLDivElement>(null)

  // ナビゲーション履歴の管理
  const [history, setHistory] = useState<string[]>([])

  const fieldInfo = useMemo(
    () => index?.getFieldInfo(targetFieldName || ''),
    [index, targetFieldName],
  )
  const field = fieldInfo?.field
  const cleanTargetName = useMemo(
    () => normalizeFieldId(targetFieldName || ''),
    [targetFieldName],
  )
  const resolvedFieldName = field?.column || cleanTargetName || ''

  // 未使用フィールドの判定
  const fieldUsage = useMemo(() => analyzeFieldUsage(doc), [doc])
  const isUnused = useMemo(() => {
    const usage = fieldUsage.usage.get(normalizeFieldId(resolvedFieldName))
    return usage ? !usage.used : false
  }, [fieldUsage, resolvedFieldName])

  // 計算式コピー
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  // フィールドメタデータの構築（formatter用）
  const fieldMetaForFormatter = useMemo(() => {
    const meta = new Map<string, { caption?: string }>()
    if (!index) return meta

    index.fields.forEach((info, name) => {
      meta.set(name, { caption: info.field.caption })
    })
    return meta
  }, [index])

  // 上流依存を再帰展開したツリー（計算式のネスト構造の全体像）
  const dependencyTree = useMemo(
    () => buildUpstreamTree(doc, targetFieldName || '', TREE_MAX_DEPTH),
    [doc, targetFieldName],
  )

  // 影響分析（下流の計算フィールド・シート・ダッシュボードの推移的な波及範囲）
  const impact = useMemo(
    () => analyzeImpact(doc, targetFieldName || ''),
    [doc, targetFieldName],
  )

  // 依存グラフを開けるか（波及先か上流依存のどちらかが存在する場合）
  const graphAvailable =
    !!impact &&
    (impact.downstreamFields.length > 0 ||
      impact.affectedSheets.length > 0 ||
      impact.affectedDashboards.length > 0 ||
      (dependencyTree?.children.length ?? 0) > 0)

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
      setHistory((prev) => [...prev, targetFieldName])
    }
    onNavigateField(nextField)
  }

  // 戻る処理
  const handleBack = () => {
    const prev = history[history.length - 1]
    if (prev) {
      setHistory((prevHistory) => prevHistory.slice(0, -1))
      onNavigateField(prev)
    }
  }

  // 表示用に計算式を整形
  const formattedFormula = useMemo(() => {
    const formula = fieldInfo?.resolvedFormula
    if (!formula) return undefined
    return formatFormulaText(formula, fieldMetaForFormatter)
  }, [fieldInfo, fieldMetaForFormatter])

  // 閉じるときも同じ経路で退出させるため、exit アニメーション（300ms）が終わるまでマウントを維持する
  const [shouldRender, setShouldRender] = useState(isOpen)
  if (isOpen && !shouldRender) {
    // レンダー中の状態調整パターン: 開いた瞬間に再マウントする
    setShouldRender(true)
  }
  useEffect(() => {
    if (isOpen || !shouldRender) return
    const timer = setTimeout(() => setShouldRender(false), 320)
    return () => clearTimeout(timer)
  }, [isOpen, shouldRender])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
      setTimeout(() => setHistory([]), 0) // 閉じる時に履歴をクリア
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Escape で閉じる + 開いたらドロワーへフォーカスを移す
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    drawerRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!shouldRender) return null

  return (
    <>
      {/* Overlay */}
      <div
        className={`drawer-backdrop fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[60] duration-300 ${
          isOpen
            ? 'animate-in fade-in'
            : 'animate-out fade-out fill-mode-forwards'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={fieldInfo?.field.caption || targetFieldName || undefined}
        tabIndex={-1}
        className={`side-drawer fixed inset-y-0 right-0 w-full md:w-[40%] max-w-2xl bg-white shadow-2xl z-[70] flex flex-col duration-300 border-l border-slate-200 focus:outline-none ${
          isOpen
            ? 'animate-in slide-in-from-right ease-out'
            : 'animate-out slide-out-to-right ease-in fill-mode-forwards'
        }`}
      >
        <header className="p-5 sm:p-8 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4 overflow-hidden">
            {history.length > 0 && (
              <button
                onClick={handleBack}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-600 group shrink-0"
                title={t('button.back') || '戻る'}
              >
                <ArrowLeft
                  size={20}
                  className="group-hover:-translate-x-0.5 transition-transform"
                />
              </button>
            )}
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`whitespace-nowrap text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${formattedFormula ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}
                >
                  {formattedFormula
                    ? t('detail.calculated_fields')
                    : t('detail.standard_fields')}
                </span>
                {fieldInfo?.parentCaption && (
                  <span
                    className="text-[11px] font-bold text-slate-500 uppercase tracking-widest truncate min-w-0"
                    title={fieldInfo.parentCaption}
                  >
                    {fieldInfo.parentCaption}
                  </span>
                )}
                {fieldInfo?.resolvedDataType && (
                  <>
                    <span className="text-slate-200 mx-1">•</span>
                    <span className="whitespace-nowrap text-[11px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded shrink-0">
                      {fieldInfo.resolvedDataType}
                    </span>
                  </>
                )}
                {isUnused && (
                  <span
                    data-testid="drawer-unused-badge"
                    title={t('usage.unused_hint')}
                    className="whitespace-nowrap text-[11px] font-bold text-amber-700 uppercase tracking-widest bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0"
                  >
                    {t('usage.unused_badge')}
                  </span>
                )}
              </div>
              <h2
                className="text-2xl font-black text-slate-800 tracking-tight truncate"
                title={fieldInfo?.resolvedCaption || cleanTargetName || ''}
              >
                {fieldInfo?.resolvedCaption || cleanTargetName || ''}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => targetFieldName && onOpenGraph?.(targetFieldName)}
              disabled={!graphAvailable}
              data-testid="drawer-graph-button"
              title={t('drawer.view_graph')}
              className="p-2 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <GitBranch size={20} />
            </button>
            <button
              onClick={onClose}
              title={t('button.close')}
              aria-label={t('button.close')}
              className="p-2 hover:bg-red-50 hover:text-red-500 rounded-xl transition text-slate-500"
            >
              <X size={24} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-8 sm:space-y-10">
          {/* 計算式セクション（パラメータ以外の場合のみ表示） */}
          {formattedFormula && !field?.paramDomainType && (
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                {t('drawer.formula')}
                <button
                  type="button"
                  data-testid="copy-formula-button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(formattedFormula)
                      .then(() => setCopied(true))
                  }}
                  title={t('drawer.copy_formula')}
                  className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold normal-case tracking-normal transition active:scale-95 ${
                    copied
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? t('drawer.copied') : t('drawer.copy_formula')}
                </button>
              </h3>
              <FormulaHighlighter
                formula={formattedFormula}
                searchQuery={searchQuery}
              />
            </section>
          )}

          {/* パラメータ設定セクション */}
          {field?.paramDomainType && (
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-4 bg-purple-500 rounded-full" />
                {t('detail.param_settings')}
              </h3>
              <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-6 space-y-6">
                {field.value !== undefined && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      {t('detail.current_value')}
                    </p>
                    <div className="px-4 py-3 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold border border-blue-100 shadow-sm inline-block">
                      {String(field.value)}
                    </div>
                  </div>
                )}
                {field.paramDomainType === 'list' && field.paramMembers && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      {t('detail.list')}
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {field.paramMembers.map((m, i) => (
                        <div
                          key={i}
                          className="px-4 py-2 bg-white border border-slate-100 rounded-xl text-sm flex justify-between items-center shadow-sm"
                        >
                          <span className="font-bold text-slate-700">
                            {m.alias || m.value}
                          </span>
                          {m.alias && (
                            <span className="text-[11px] text-slate-500">
                              Value: {m.value}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {field.paramDomainType === 'range' && field.paramRange && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      {t('detail.range')}
                    </p>
                    <div className="flex items-center justify-between px-2">
                      <div className="text-center">
                        <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">
                          {t('detail.min')}
                        </p>
                        <p className="text-lg font-black text-slate-700">
                          {field.paramRange.min}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">
                          {t('detail.max')}
                        </p>
                        <p className="text-lg font-black text-slate-700">
                          {field.paramRange.max}
                        </p>
                      </div>
                      {field.paramRange.step && (
                        <div className="text-center">
                          <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">
                            {t('detail.step')}
                          </p>
                          <p className="text-lg font-black text-slate-700">
                            {field.paramRange.step}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 影響分析: 下流波及のサマリと依存グラフ起動 */}
          {impact && (
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-4 bg-rose-500 rounded-full" />
                {t('drawer.impact_title')}
                <span className="ml-auto normal-case tracking-normal text-[11px] font-medium text-slate-400">
                  {t('drawer.impact_hint')}
                </span>
              </h3>
              <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      count: impact.downstreamFields.length,
                      label: t('drawer.impact_fields'),
                      className: 'bg-emerald-50 text-emerald-700',
                    },
                    {
                      count: impact.affectedSheets.length,
                      label: t('drawer.impact_sheets'),
                      className: 'bg-blue-50 text-blue-700',
                    },
                    {
                      count: impact.affectedDashboards.length,
                      label: t('drawer.impact_dashboards'),
                      className: 'bg-rose-50 text-rose-700',
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className={`rounded-xl p-3 text-center ${s.className}`}
                    >
                      <p className="text-xl font-black leading-none">
                        {s.count}
                      </p>
                      <p className="text-[9px] font-bold uppercase tracking-wider mt-1 opacity-70">
                        {s.label}
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="view-impact-graph-button"
                  onClick={() =>
                    targetFieldName && onOpenGraph?.(targetFieldName)
                  }
                  disabled={!graphAvailable}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition active:scale-[0.98] shadow-md shadow-slate-200"
                >
                  <GitBranch size={14} />
                  {t('drawer.view_graph')}
                </button>
              </div>
            </section>
          )}

          {/* 使用されているシート */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-4 bg-blue-500 rounded-full" />
              {t('nav.sheets')} ({sheetNames.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {sheetNames.length > 0 ? (
                sheetNames.map((name) => {
                  const ws = doc.worksheets.find((w) => w.name === name)
                  const displayName = ws?.caption || name
                  return (
                    <button
                      key={name}
                      onClick={() => onNavigateToSheet?.(name)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-bold rounded-xl border border-blue-100 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm transition active:scale-95 text-left"
                    >
                      {displayName}
                    </button>
                  )
                })
              ) : (
                <p className="text-sm text-slate-500 italic py-2 pl-4">
                  {t('drawer.no_sheets')}
                </p>
              )}
            </div>
          </section>

          {/* 依存ツリー: 上流依存を再帰展開（計算フィールドで子がある場合のみ表示） */}
          {dependencyTree &&
            dependencyTree.isCalc &&
            dependencyTree.children.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-purple-500 rounded-full" />
                  {t('drawer.dependency_tree')}
                  <span className="ml-auto normal-case tracking-normal text-[11px] font-medium text-slate-400">
                    {t('drawer.tree_depth_note', { depth: TREE_MAX_DEPTH })}
                  </span>
                </h3>
                <div className="space-y-2">
                  {dependencyTree.children.map((child) => (
                    <DependencyTreeItem
                      key={child.fieldId}
                      node={child}
                      depth={0}
                      onNavigate={handleDrillDown}
                    />
                  ))}
                </div>
              </section>
            )}

          {/* 依存関係: 下流 (Consumers / この項目を参照している) */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
              {t('drawer.downstream')} ({downstreamNames.length})
            </h3>
            <div className="grid gap-2">
              {downstreamNames.length > 0 ? (
                downstreamNames.map((name) => {
                  const info = index?.fields?.get(name)
                  return (
                    <button
                      key={name}
                      onClick={() => handleDrillDown(name)}
                      className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-emerald-300 hover:shadow-md transition group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100 transition-colors">
                          <Hash size={14} />
                        </div>
                        <span className="text-sm font-bold text-slate-700">
                          {(() => {
                            const cap = info?.field.caption || name
                            return cap.startsWith('[') && cap.endsWith(']')
                              ? cap.substring(1, cap.length - 1)
                              : cap
                          })()}
                        </span>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-1 transition"
                      />
                    </button>
                  )
                })
              ) : (
                <p className="text-sm text-slate-500 italic py-2 pl-4">
                  {t('drawer.no_downstream')}
                </p>
              )}
            </div>
          </section>
        </div>

        <footer className="p-8 border-t border-slate-100 bg-slate-50/30">
          <p className="text-[11px] text-slate-400 font-medium text-center uppercase tracking-[0.2em]">
            VizVerso Dependency Explorer
          </p>
        </footer>
      </div>
    </>
  )
}
