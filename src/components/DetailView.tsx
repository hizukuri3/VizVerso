import React, { useRef, useEffect, useMemo } from 'react'
import {
  Layout,
  FileText,
  Database,
  Filter,
  MousePointer2,
  Hash,
} from 'lucide-react'
import type { TableauDocument, WorksheetPane } from '../types/tableau'
import { Pill } from './ui/Pill'
import { t, tMark } from '../utils/i18n'
import { formatFormulaText } from '../utils/formulaFormatter'
import { useDependencyIndex } from '../hooks/useDependencyIndex'
import { normalizeFieldId } from '../utils/xmlParser'
import { analyzeFieldUsage } from '../utils/usageAnalyzer'

interface DetailViewProps {
  doc: TableauDocument
  selectedId: string | null
  selectedType: 'dashboard' | 'worksheet' | 'datasource' | null
  onNavigate?: (
    type: 'dashboard' | 'worksheet' | 'datasource',
    id: string,
  ) => void
  activeFieldName?: string | null
  onOpenDrawer?: (fieldName: string) => void
}

export default function DetailView({
  doc,
  selectedId,
  selectedType,
  onNavigate,
  activeFieldName,
  onOpenDrawer,
}: DetailViewProps) {
  // 自動スクロール処理
  const activePillRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (activeFieldName && activePillRef.current) {
      activePillRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [activeFieldName, selectedId])

  const index = useDependencyIndex(doc)

  // 未使用フィールドの判定（データソース表示で使用）
  const fieldUsage = useMemo(() => analyzeFieldUsage(doc), [doc])
  const isFieldUnused = (column: string) => {
    const usage = fieldUsage.usage.get(normalizeFieldId(column))
    return usage ? !usage.used : false
  }

  const renderPill = (
    info: {
      name: string
      caption?: string
      isCalc?: boolean
      isContinuous?: boolean
      dataType?: string
      formula?: string
      isUnused?: boolean
    },
    keySuffix: string = '',
  ) => {
    const isActive = activeFieldName === info.name
    return (
      <div
        key={`${info.name}-${keySuffix}`}
        ref={isActive ? activePillRef : null}
        className="inline-block mr-2 mb-2"
      >
        <Pill
          {...info}
          isActive={isActive}
          onClick={() => onOpenDrawer?.(info.name)}
        />
      </div>
    )
  }

  const getDatasourceCaption = (name: string) => {
    const ds = doc.datasources.find((d) => d.name === name)
    return ds?.caption || name
  }

  const fieldMetaForFormatter = useMemo(() => {
    const meta = new Map<string, { caption?: string }>()
    if (!index) return meta
    index.fields.forEach((info, name) => {
      meta.set(name, { caption: info.field.caption })
    })
    return meta
  }, [index])

  if (!selectedId || !selectedType) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30">
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-4">
          <MousePointer2 size={48} className="text-slate-200 animate-bounce" />
          <p className="text-sm font-medium">{t('status.empty_state_hint')}</p>
        </div>
      </div>
    )
  }

  // 1. Dashboard View
  if (selectedType === 'dashboard') {
    const db = doc.dashboards.find((d) => d.name === selectedId)
    if (!db) return null

    return (
      <div className="flex-1 overflow-y-auto p-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
        <header className="flex items-center gap-6">
          <div className="p-4 bg-blue-100 text-blue-600 rounded-2xl">
            <Layout size={40} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tight">
              {db.name}
            </h1>
            <p className="text-slate-500 font-medium text-lg mt-1">
              {t('detail.dashboard_summary')}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              {t('nav.navigator')}
            </h3>
            <p className="text-5xl font-black text-slate-800">
              {t('detail.worksheet_count', { count: db.worksheets.length })}
            </p>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-3">
            <FileText size={20} className="text-emerald-500" />{' '}
            {t('detail.inner_worksheets')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {db.worksheets.map((wsName) => {
              const wsObj = doc.worksheets.find((w) => w.name === wsName)
              const displayName = wsObj?.caption || wsName
              return (
                <button
                  key={wsName}
                  type="button"
                  onClick={() => onNavigate?.('worksheet', wsName)}
                  className="w-full text-left bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group active:scale-[0.98]"
                >
                  <p className="font-bold text-slate-700 group-hover:text-blue-600 transition-colors">
                    {displayName}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-bold">
                    {t('button.view_detail')}
                  </p>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  const getFieldInfo = (fieldName: string, shelfContinuous?: boolean) => {
    const info = index?.getFieldInfo(fieldName)
    if (!info) {
      // インデックスにない場合でも、物理名のままではなく正規化した名称を表示する
      const cleanName = normalizeFieldId(fieldName)
      return {
        name: fieldName,
        caption: cleanName || fieldName,
        isCalc: false,
        isContinuous: shelfContinuous ?? false,
      }
    }

    // 集計の判定
    const isSum = /\bsum:/i.test(fieldName)
    const isAvg = /\bavg:/i.test(fieldName)
    const isMin = /\bmin:/i.test(fieldName)
    const isMax = /\bmax:/i.test(fieldName)
    const isCount = /\bcnt:|\bcntd:/i.test(fieldName)
    const isAttr = /\battr:/i.test(fieldName)
    const isCollect =
      /\bcollect:|\bspatial:|\bagg:/i.test(fieldName) ||
      info.resolvedDataType === 'spatial'
    const isTableCalc =
      fieldName.includes('rank:') ||
      fieldName.includes('running:') ||
      fieldName.includes('window:') ||
      fieldName.includes('pct:') ||
      fieldName.includes('total:')

    let aggregation = t('agg.none')
    if (isSum) aggregation = t('agg.sum')
    else if (isAvg) aggregation = t('agg.avg')
    else if (isMin) aggregation = t('agg.min')
    else if (isMax) aggregation = t('agg.max')
    else if (isCount) aggregation = t('agg.count')
    else if (isAttr) aggregation = t('agg.attr')
    else if (isCollect) aggregation = t('agg.collect')

    let displayCaption = info.resolvedCaption
    if (aggregation !== t('agg.none')) {
      displayCaption = `${aggregation}(${displayCaption})`
    }
    if (isTableCalc) displayCaption = `${displayCaption} △`

    return {
      name: info.field.column,
      caption: displayCaption,
      isCalc: info.isCalculated,
      dataType: info.resolvedDataType,
      formula: formatFormulaText(info.resolvedFormula, fieldMetaForFormatter),
      isContinuous:
        shelfContinuous !== undefined
          ? shelfContinuous
          : info.field.type === 'quantitative' || info.field.isContinuous,
    }
  }

  // 2. Worksheet View
  if (selectedType === 'worksheet') {
    const ws = doc.worksheets.find((w) => w.name === selectedId)
    if (!ws) return null

    const renderShelfCard = (
      title: string,
      fields: { name: string; isContinuous?: boolean }[] | undefined,
      icon: React.ReactNode,
      colorClass: string,
    ) => {
      const hasFields = fields && fields.length > 0
      return (
        <div
          className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full`}
        >
          <div
            className={`px-4 py-3 border-b border-slate-100 flex items-center gap-2 font-bold text-xs uppercase tracking-wider ${colorClass}`}
          >
            {icon} {title}
          </div>
          <div className="p-5 flex flex-wrap flex-1 content-start gap-2">
            {hasFields ? (
              fields.map((f, i) => {
                const info = getFieldInfo(f.name, f.isContinuous)
                return renderPill(info, `shelf-${i}`)
              })
            ) : (
              <span className="text-[11px] text-slate-300 italic py-1">
                {t('detail.none')}
              </span>
            )}
          </div>
        </div>
      )
    }

    // ペイン名の重複を管理するためのカウンター
    const paneNameCounts = new Map<string, number>()

    const renderPane = (pane: WorksheetPane, index: number) => {
      // 全フィールドが空の場合は非表示
      const allEmpty = Object.values(pane.encodings).every(
        (arr) => arr.length === 0,
      )
      if (allEmpty) return null

      // マップレイヤー判定
      const isMapChart =
        ws.shelf?.panes && ws.shelf.panes.some((p) => p.name?.includes('mp.'))
      const isMultiPane = ws.shelf?.panes && ws.shelf.panes.length > 1

      // 行と列のどちらか多い方のメジャー（連続値）を取得
      const rowMeasures = (ws.shelf?.rows || []).filter((f) => f.isContinuous)
      const colMeasures = (ws.shelf?.cols || []).filter((f) => f.isContinuous)
      const splitMeasures =
        rowMeasures.length >= colMeasures.length ? rowMeasures : colMeasures
      const hasAllPane =
        ws.shelf?.panes && ws.shelf.panes.length > splitMeasures.length

      let headerLabel: string
      if (isMapChart) {
        headerLabel = pane.name || `Layer ${index + 1}`
      } else if (isMultiPane) {
        if (hasAllPane && index === 0) {
          headerLabel = t('detail.marks_all')
        } else if (pane.name) {
          // generated-title を最優先
          headerLabel = pane.name
        } else if (pane.yAxisName || pane.xAxisName) {
          const axisRef = pane.yAxisName || pane.xAxisName
          const info = getFieldInfo(axisRef!)
          headerLabel = info.caption

          // MIN(0) などの定数計算を Tableau っぽく調整
          if (headerLabel.toLowerCase().includes('min(0)')) {
            headerLabel = `${t('agg.agg')}(MIN(0))`
          }
        } else {
          // 軸名がない場合のフォールバック: 最初のエンコーディング（色や詳細）のキャプションを試す
          const firstField =
            pane.encodings.color[0] ||
            pane.encodings.detail[0] ||
            pane.encodings.label[0]
          if (firstField) {
            headerLabel = getFieldInfo(firstField.name).caption
          } else {
            headerLabel = `${t('detail.marks')} ${index + 1}`
          }
        }
      } else {
        headerLabel = t('detail.marks')
      }

      // 重複がある場合は (2), (3) を付与
      if (headerLabel !== t('detail.marks_all')) {
        const baseLabel = headerLabel

        const count = paneNameCounts.get(headerLabel) || 0
        if (count > 0) {
          headerLabel = `${baseLabel}(${count + 1})`
        }

        paneNameCounts.set(baseLabel, count + 1)
      }

      return (
        <div
          key={index}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-pink-50/30">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-pink-700">
              <MousePointer2 size={14} /> {headerLabel}
            </div>
            {/* マークタイプを日本語で常に表示 */}
            {pane.markType !== undefined && (
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {tMark(pane.markType)}
              </span>
            )}
          </div>
          <div className="p-5 space-y-6 flex-1">
            {[
              { label: t('detail.color'), fields: pane.encodings.color },
              { label: t('detail.size'), fields: pane.encodings.size },
              { label: t('detail.shape'), fields: pane.encodings.shape },
              { label: t('detail.label'), fields: pane.encodings.label },
              { label: t('detail.detail'), fields: pane.encodings.detail },
              { label: t('detail.tooltip'), fields: pane.encodings.tooltip },
            ].map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest">
                  {group.label}
                </p>
                <div className="flex flex-wrap min-h-[1.5rem] gap-1">
                  {group.fields && group.fields.length > 0 ? (
                    group.fields.map((f, i) => {
                      const info = getFieldInfo(f.name, f.isContinuous)
                      return renderPill(info, `mark-${i}`)
                    })
                  ) : (
                    <span className="text-[10px] text-slate-200 italic">
                      {t('detail.none')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto p-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
        <header className="flex items-center gap-6">
          <div className="p-4 bg-emerald-100 text-emerald-600 rounded-2xl">
            <FileText size={40} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tight">
              {ws.caption || ws.name}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-widest">
                {t('nav.sheets')}
              </span>
              <span className="text-slate-200">/</span>
              <span className="text-slate-500 text-sm flex items-center gap-1.5 font-medium">
                <Database size={14} className="text-slate-400" />{' '}
                {ws.datasourceNames?.map(getDatasourceCaption).join(', ')}
              </span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-stretch">
          {/* Columns & Rows */}
          <div className="grid grid-cols-1 gap-6 content-start">
            {renderShelfCard(
              t('detail.columns'),
              ws.shelf?.cols,
              <Layout size={14} className="rotate-90" />,
              'bg-blue-50/50 text-blue-700',
            )}
            {renderShelfCard(
              t('detail.rows'),
              ws.shelf?.rows,
              <Layout size={14} />,
              'bg-indigo-50/50 text-indigo-700',
            )}
            {renderShelfCard(
              t('detail.filters'),
              ws.shelf?.filters,
              <Filter size={14} />,
              'bg-amber-50/50 text-amber-700',
            )}
          </div>

          {/* Marks & Map Layers */}
          <div className="grid grid-cols-1 gap-6 content-start">
            {ws.shelf?.panes.map((pane, idx) => renderPane(pane, idx))}
          </div>
        </div>
      </div>
    )
  }

  // 3. Datasource View
  if (selectedType === 'datasource') {
    const ds = doc.datasources.find((d) => d.name === selectedId)
    if (!ds) return null
    const isParameters = ds.name === 'Parameters'

    if (isParameters) {
      return (
        <div className="flex-1 overflow-y-auto p-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
          <header className="flex items-center gap-6">
            <div className="p-4 bg-purple-100 text-purple-600 rounded-2xl">
              <Hash size={40} />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-800 tracking-tight">
                {t('detail.parameters')}
              </h1>
              <p className="text-slate-500 font-medium text-lg mt-1">
                {t('nav.datasources')}
              </p>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-6">
            {ds.fields.map((f) => {
              const info = getFieldInfo(f.column)
              return (
                <div
                  key={f.column}
                  className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                >
                  <div className="p-8">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        {renderPill(
                          { ...info, isUnused: isFieldUnused(f.column) },
                          'ds-param',
                        )}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded">
                          {f.dataType}
                        </span>
                      </div>
                      <div className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                        {f.paramDomainType || 'any'}
                      </div>
                    </div>

                    <div className="space-y-6">
                      {f.paramDomainType === 'list' && f.paramMembers && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest">
                            {t('detail.list')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {f.paramMembers.map((m, i) => (
                              <div
                                key={i}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] flex flex-col"
                              >
                                <span className="font-bold text-slate-700">
                                  {m.alias || m.value}
                                </span>
                                {m.alias && (
                                  <span className="text-[9px] text-slate-400 mt-0.5">
                                    Value: {m.value}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {f.paramDomainType === 'range' && f.paramRange && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest">
                            {t('detail.range')}
                          </p>
                          <div className="flex items-center gap-8">
                            <div className="flex flex-col gap-1">
                              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
                                {t('detail.min')}
                              </span>
                              <span className="text-base font-black text-slate-700">
                                {f.paramRange.min}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
                                {t('detail.max')}
                              </span>
                              <span className="text-base font-black text-slate-700">
                                {f.paramRange.max}
                              </span>
                            </div>
                            {f.paramRange.step && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
                                  {t('detail.step')}
                                </span>
                                <span className="text-base font-black text-slate-700">
                                  {f.paramRange.step}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {(!f.paramDomainType || f.paramDomainType === 'any') && (
                        <div className="py-2 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400 italic">
                            {t('detail.all_values')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
        </div>
      )
    }

    const calcs = ds.fields.filter((f) => !!f.formula)
    const normal = ds.fields.filter((f) => !f.formula)
    const unusedCalcCount = calcs.filter((f) => isFieldUnused(f.column)).length
    const unusedNormalCount = normal.filter((f) =>
      isFieldUnused(f.column),
    ).length

    return (
      <div className="flex-1 overflow-y-auto p-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
        <header className="flex items-center gap-6">
          <div className="p-4 bg-amber-100 text-amber-600 rounded-2xl">
            <Database size={40} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tight">
              {ds.caption || ds.name}
            </h1>
            <p className="text-slate-500 font-medium text-lg mt-1">
              {t('nav.datasources')}
            </p>
          </div>
        </header>

        <section className="space-y-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50/50 text-emerald-700 font-bold text-xs uppercase tracking-widest flex items-center gap-3">
              <Hash size={16} /> {t('detail.calculated_fields')} ({calcs.length}
              )
              {unusedCalcCount > 0 && (
                <span className="ml-auto normal-case tracking-normal text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  {t('usage.unused_count', { count: unusedCalcCount })}
                </span>
              )}
            </div>
            <div className="p-8 flex flex-wrap gap-x-1 gap-y-1">
              {ds.fields
                .filter((f) => f.formula)
                .map((f) => {
                  const info = getFieldInfo(f.column)
                  return renderPill(
                    { ...info, isUnused: isFieldUnused(f.column) },
                    'ds-calc',
                  )
                })}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-widest flex items-center gap-3">
              <Database size={16} /> {t('detail.standard_fields')} (
              {normal.length})
              {unusedNormalCount > 0 && (
                <span className="ml-auto normal-case tracking-normal text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  {t('usage.unused_count', { count: unusedNormalCount })}
                </span>
              )}
            </div>
            <div className="p-8 flex flex-wrap gap-x-1 gap-y-1">
              {ds.fields
                .filter((f) => !f.formula)
                .map((f) => {
                  const info = getFieldInfo(f.column)
                  return renderPill(
                    { ...info, isUnused: isFieldUnused(f.column) },
                    'ds-std',
                  )
                })}
            </div>
          </div>
        </section>
      </div>
    )
  }

  return null
}
