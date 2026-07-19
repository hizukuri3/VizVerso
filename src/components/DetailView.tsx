import React, { useRef, useEffect, useMemo, useState } from 'react'
import {
  Layout,
  FileText,
  Database,
  Filter,
  MousePointer2,
  Hash,
  List,
  LayoutGrid,
  Copy,
  Check,
  GitBranch,
} from 'lucide-react'
import type { TableauDocument, WorksheetPane } from '../types/tableau'
import type { GraphRootRef } from '../utils/impactAnalyzer'
import DashboardLayoutMap from './DashboardLayoutMap'
import { Pill, SyntaxHighlightedFormula } from './ui/Pill'
import { t, tMark } from '../utils/i18n'
import { formatFormulaText } from '../utils/formulaFormatter'
import { classifyFormula, type CalcType } from '../utils/calcClassifier'
import { useDependencyIndex } from '../hooks/useDependencyIndex'
import { normalizeFieldId } from '../utils/xmlParser'
import { analyzeFieldUsage } from '../utils/usageAnalyzer'
import { getWorksheetMarkKind } from '../utils/markVisual'
import MarkGlyph from './MarkGlyph'

// ブラケット付きキャプション（[利益率] など）から表示用に括弧を除去する
const stripBrackets = (label: string) =>
  label.startsWith('[') && label.endsWith(']')
    ? label.substring(1, label.length - 1)
    : label

// ────────────────────────────
// 計算式の種別バッジ（LOD表現 / 表計算 / 通常）
// ────────────────────────────
const CALC_TYPE_STYLE: Record<
  CalcType,
  {
    key: 'calctype.lod' | 'calctype.table_calc' | 'calctype.regular'
    cls: string
  }
> = {
  lod: {
    key: 'calctype.lod',
    cls: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  tableCalc: {
    key: 'calctype.table_calc',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  regular: {
    key: 'calctype.regular',
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
  },
}

function CalcTypeBadge({ formula }: { formula?: string }) {
  const type = classifyFormula(formula)
  if (!type) return null
  // type は CalcType のユニオン型に限定されており任意入力ではないため安全
  // eslint-disable-next-line security/detect-object-injection
  const style = CALC_TYPE_STYLE[type]
  return (
    <span
      className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${style.cls}`}
    >
      {t(style.key)}
    </span>
  )
}

// ────────────────────────────
// 計算フィールド1行（リスト表示）
// 種別バッジ・名前・データ型・未使用バッジ・整形済み計算式・コピーボタンを表示する
// ────────────────────────────
interface CalcFieldRowProps {
  name: string
  displayName: string
  rawFormula?: string
  formattedFormula?: string
  dataType?: string
  isUnused: boolean
  isActive: boolean
  activeRef?: React.Ref<HTMLDivElement>
  onOpenDrawer?: (fieldName: string) => void
  onOpenGraph?: (fieldName: string) => void
}

function CalcFieldRow({
  name,
  displayName,
  rawFormula,
  formattedFormula,
  dataType,
  isUnused,
  isActive,
  activeRef,
  onOpenDrawer,
  onOpenGraph,
}: CalcFieldRowProps) {
  // 行ごとにコピー状態を保持する
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div
      ref={activeRef}
      className={`rounded-2xl border shadow-sm overflow-hidden transition-all ${
        isActive
          ? 'border-yellow-400 ring-2 ring-yellow-300'
          : 'border-slate-200'
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
        <CalcTypeBadge formula={rawFormula} />
        <button
          type="button"
          onClick={() => onOpenDrawer?.(name)}
          className="font-bold text-sm text-slate-700 hover:text-blue-600 transition-colors truncate text-left"
          title={displayName}
        >
          {displayName}
        </button>
        {dataType && (
          <span className="shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white border border-slate-100 px-1.5 py-0.5 rounded">
            {dataType}
          </span>
        )}
        {isUnused && (
          <span
            data-testid="unused-badge"
            title={t('usage.unused_hint')}
            className="shrink-0 text-[9px] font-bold text-amber-700 uppercase tracking-wider bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"
          >
            {t('usage.unused_badge')}
          </span>
        )}
        <div className="ml-auto shrink-0 flex items-center gap-1.5">
          {onOpenGraph && (
            <button
              type="button"
              data-testid="calc-row-graph-button"
              onClick={() => onOpenGraph(name)}
              title={t('drawer.view_graph')}
              className="p-1.5 rounded-lg border border-transparent text-slate-300 transition-all hover:bg-white hover:border-slate-200 hover:text-indigo-500 hover:shadow-sm active:scale-95"
            >
              <GitBranch size={13} />
            </button>
          )}
          {formattedFormula && (
            <button
              type="button"
              data-testid="copy-formula-button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(formattedFormula)
                  .then(() => setCopied(true))
              }}
              title={t('drawer.copy_formula')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all active:scale-95 ${
                copied
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? t('drawer.copied') : t('drawer.copy_formula')}
            </button>
          )}
        </div>
      </div>
      {formattedFormula && (
        <div className="p-3">
          <SyntaxHighlightedFormula formula={formattedFormula} />
        </div>
      )}
    </div>
  )
}

// ────────────────────────────
// 詳細画面ヘッダーの依存グラフ起動ボタン
// ダッシュボード / シート詳細からワンクリックでグラフへ遷移できるようにする
// ────────────────────────────
function HeaderGraphButton({
  graphRef,
  onOpenGraph,
}: {
  graphRef: GraphRootRef
  onOpenGraph?: (ref: GraphRootRef) => void
}) {
  if (!onOpenGraph) return null
  return (
    <button
      type="button"
      onClick={() => onOpenGraph(graphRef)}
      data-testid={`detail-graph-${graphRef.kind}`}
      title={t('drawer.view_graph')}
      className="ml-auto shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-600 hover:shadow-md active:scale-95"
    >
      <GitBranch size={14} />
      <span className="hidden sm:inline">{t('drawer.view_graph')}</span>
    </button>
  )
}

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
  /** 詳細画面のヘッダー等から依存グラフを開く */
  onOpenGraph?: (ref: GraphRootRef) => void
}

export default function DetailView({
  doc,
  selectedId,
  selectedType,
  onNavigate,
  activeFieldName,
  onOpenDrawer,
  onOpenGraph,
}: DetailViewProps) {
  // データソース表示の表示モード（デフォルトはリスト表示）
  const [dsViewMode, setDsViewMode] = useState<'list' | 'pills'>('list')

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
          <div className="min-w-0">
            <h1
              className="text-4xl font-black text-slate-800 tracking-tight truncate"
              title={db.name}
            >
              {db.name}
            </h1>
            <p className="text-slate-500 font-medium text-lg mt-1">
              {t('detail.dashboard_summary')}
            </p>
          </div>
          <HeaderGraphButton
            graphRef={{ kind: 'dashboard', name: db.name }}
            onOpenGraph={onOpenGraph}
          />
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
          <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-3">
            <Layout size={20} className="text-blue-500" />{' '}
            {t('detail.layout_title')}
          </h3>
          <p className="text-xs text-slate-400 mb-6">
            {t('detail.layout_hint')}
          </p>
          <DashboardLayoutMap
            zones={db.zones ?? []}
            doc={doc}
            onNavigate={(type, id) => onNavigate?.(type, id)}
          />
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
                  <p
                    className="font-bold text-slate-700 group-hover:text-blue-600 transition-colors truncate"
                    title={displayName}
                  >
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

    // Tableau Desktop 風の横長1行シェルフ
    // 左に棚ラベル、右にピルを横並び、空なら（なし）を同じ行にインライン表示する
    const renderShelfRow = (
      title: string,
      fields: { name: string; isContinuous?: boolean }[] | undefined,
      icon: React.ReactNode,
      colorClass: string,
    ) => {
      const hasFields = fields && fields.length > 0
      return (
        <div className="flex items-start gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0">
          <div
            className={`flex items-center gap-1.5 shrink-0 w-20 pt-1 font-bold text-[11px] uppercase tracking-wider ${colorClass}`}
          >
            {icon} {title}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-h-[1.75rem]">
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
          <div className="p-4 space-y-2 flex-1">
            {/* フィールドが存在するエンコーディング行のみをコンパクトに表示する */}
            {[
              { label: t('detail.color'), fields: pane.encodings.color },
              { label: t('detail.size'), fields: pane.encodings.size },
              { label: t('detail.shape'), fields: pane.encodings.shape },
              { label: t('detail.label'), fields: pane.encodings.label },
              { label: t('detail.detail'), fields: pane.encodings.detail },
              { label: t('detail.tooltip'), fields: pane.encodings.tooltip },
            ]
              .filter((group) => group.fields && group.fields.length > 0)
              .map((group) => (
                <div key={group.label} className="flex items-start gap-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0 w-14 pt-1.5">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 flex-1">
                    {group.fields.map((f, i) => {
                      const info = getFieldInfo(f.name, f.isContinuous)
                      return renderPill(info, `mark-${i}`)
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )
    }

    const markKind = getWorksheetMarkKind(ws)

    return (
      <div className="flex-1 overflow-y-auto p-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
        <header className="flex items-center gap-6">
          {/* シートのマーク種別を大きく図示し、どんなチャートか一目で分かるようにする */}
          <div className="p-4 bg-emerald-100 text-emerald-600 rounded-2xl">
            <MarkGlyph kind={markKind} size={40} />
          </div>
          <div className="min-w-0">
            <h1
              className="text-4xl font-black text-slate-800 tracking-tight truncate"
              title={ws.caption || ws.name}
            >
              {ws.caption || ws.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-widest">
                {t('nav.sheets')}
              </span>
              {/* チャート種別バッジ */}
              <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded">
                <MarkGlyph kind={markKind} size={13} /> {tMark(markKind)}
              </span>
              <span className="text-slate-200">/</span>
              <span className="text-slate-500 text-sm flex items-center gap-1.5 font-medium">
                <Database size={14} className="text-slate-400" />{' '}
                {ws.datasourceNames?.map(getDatasourceCaption).join(', ')}
              </span>
            </div>
          </div>
          <HeaderGraphButton
            graphRef={{ kind: 'sheet', name: ws.name }}
            onOpenGraph={onOpenGraph}
          />
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-stretch">
          {/* Columns / Rows / Filters（横長シェルフを1枚のカードにまとめる） */}
          <div className="content-start">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {renderShelfRow(
                t('detail.columns'),
                ws.shelf?.cols,
                <Layout size={14} className="rotate-90" />,
                'text-blue-700',
              )}
              {renderShelfRow(
                t('detail.rows'),
                ws.shelf?.rows,
                <Layout size={14} />,
                'text-indigo-700',
              )}
              {renderShelfRow(
                t('detail.filters'),
                ws.shelf?.filters,
                <Filter size={14} />,
                'text-amber-700',
              )}
            </div>
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
          <div className="flex-1 min-w-0">
            <h1
              className="text-4xl font-black text-slate-800 tracking-tight truncate"
              title={ds.caption || ds.name}
            >
              {ds.caption || ds.name}
            </h1>
            <p className="text-slate-500 font-medium text-lg mt-1">
              {t('nav.datasources')}
            </p>
          </div>

          {/* リスト表示 / ピル表示 の切替トグル */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setDsViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                dsViewMode === 'list'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <List size={14} /> {t('view.list')}
            </button>
            <button
              type="button"
              onClick={() => setDsViewMode('pills')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                dsViewMode === 'pills'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <LayoutGrid size={14} /> {t('view.pills')}
            </button>
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
            {dsViewMode === 'list' ? (
              // リスト表示: 種別バッジ・整形済み計算式・コピーボタンを常時表示
              <div className="p-5 space-y-3">
                {calcs.map((f) => {
                  const info = getFieldInfo(f.column)
                  const resolved = index?.getFieldInfo(f.column)
                  const isActive = activeFieldName === info.name
                  return (
                    <CalcFieldRow
                      key={f.column}
                      name={info.name}
                      displayName={stripBrackets(info.caption)}
                      rawFormula={resolved?.resolvedFormula ?? f.formula}
                      formattedFormula={info.formula}
                      dataType={info.dataType}
                      isUnused={isFieldUnused(f.column)}
                      isActive={isActive}
                      activeRef={isActive ? activePillRef : undefined}
                      onOpenDrawer={onOpenDrawer}
                      onOpenGraph={
                        onOpenGraph
                          ? (fieldName) =>
                              onOpenGraph({ kind: 'field', name: fieldName })
                          : undefined
                      }
                    />
                  )
                })}
              </div>
            ) : (
              <div className="p-8 flex flex-wrap gap-x-1 gap-y-1">
                {calcs.map((f) => {
                  const info = getFieldInfo(f.column)
                  return renderPill(
                    { ...info, isUnused: isFieldUnused(f.column) },
                    'ds-calc',
                  )
                })}
              </div>
            )}
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
            {dsViewMode === 'list' ? (
              // リスト表示（標準フィールド）: 名前・データ型・使用状況のコンパクトな表形式
              <div className="divide-y divide-slate-100">
                {normal.map((f) => {
                  const info = getFieldInfo(f.column)
                  const unused = isFieldUnused(f.column)
                  const isActive = activeFieldName === info.name
                  return (
                    <div
                      key={f.column}
                      ref={isActive ? activePillRef : undefined}
                      className={`flex items-center gap-3 px-6 py-2.5 ${
                        isActive ? 'bg-yellow-50' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenDrawer?.(info.name)}
                        className="font-bold text-sm text-slate-700 hover:text-blue-600 transition-colors truncate text-left flex-1"
                        title={stripBrackets(info.caption)}
                      >
                        {stripBrackets(info.caption)}
                      </button>
                      {info.dataType && (
                        <span className="shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                          {info.dataType}
                        </span>
                      )}
                      <span
                        className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                          unused
                            ? 'text-amber-700 bg-amber-50 border-amber-200'
                            : 'text-emerald-600 bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        {unused
                          ? t('usage.unused_badge')
                          : t('usage.used_label')}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-8 flex flex-wrap gap-x-1 gap-y-1">
                {normal.map((f) => {
                  const info = getFieldInfo(f.column)
                  return renderPill(
                    { ...info, isUnused: isFieldUnused(f.column) },
                    'ds-std',
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    )
  }

  return null
}
