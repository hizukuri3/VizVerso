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

interface DetailViewProps {
  doc: TableauDocument
  selectedId: string | null
  selectedType: 'dashboard' | 'worksheet' | 'datasource' | null
  onNavigate?: (
    type: 'dashboard' | 'worksheet' | 'datasource',
    id: string,
  ) => void
}

export default function DetailView({
  doc,
  selectedId,
  selectedType,
  onNavigate,
}: DetailViewProps) {
  // メタデータ構築 (全ビューで利用可能にする)
  const fieldMeta = new Map<
    string,
    {
      caption?: string
      isCalc: boolean
      formula?: string
      isContinuous?: boolean
      type?: string
      dataType?: string
    }
  >()

  // 1. データソースからの共通フィールド
  doc.datasources.forEach((ds) => {
    ds.fields.forEach((f) => {
      fieldMeta.set(f.column, {
        caption: f.caption,
        isCalc: !!f.formula,
        formula: f.formula,
        isContinuous: f.type === 'quantitative' || f.isContinuous,
        type: f.type,
        dataType: f.dataType,
      })
    })
  })

  // 2. ワークシート固有のフィールド (ローカル計算など)
  if (selectedType === 'worksheet') {
    const ws = doc.worksheets.find((w) => w.name === selectedId)
    ws?.localFields?.forEach((f) => {
      // 既存のメタデータよりローカル（ワークシート側）の設定を優先
      fieldMeta.set(f.column, {
        caption: f.caption || fieldMeta.get(f.column)?.caption,
        isCalc: !!f.formula || (fieldMeta.get(f.column)?.isCalc ?? false),
        formula: f.formula || fieldMeta.get(f.column)?.formula,
        isContinuous:
          f.type === 'quantitative' ||
          f.isContinuous ||
          (fieldMeta.get(f.column)?.isContinuous ?? false),
        type: f.type || fieldMeta.get(f.column)?.type,
        dataType: f.dataType || fieldMeta.get(f.column)?.dataType,
      })
    })
  }

  const getCaption = (fieldName: string) => {
    // 1. まず名前をクレンジング (rank:sum: none: [] 除去など)
    const parts = fieldName.split(':')
    const last = parts[parts.length - 1]
    let cleanName: string

    // 型識別子 (:qk, :nk 等) が末尾にある場合のみ、その直前を名前として採用
    const typeIds = ['nk', 'qk', 'ok', 'ok2', 'ni', 'oi']
    if (typeIds.includes(last.toLowerCase())) {
      cleanName = parts[parts.length - 2] || last
    } else {
      // コロンが含まれていても、型識別子でなければ名前の一部として保持
      cleanName = fieldName
    }
    cleanName = cleanName.replace(/^\[/, '').replace(/\]$/, '')

    // 2. マッピング辞書から検索
    const meta = fieldMeta.get(cleanName)
    if (meta?.caption) return meta.caption

    // 3. マッピングがない場合でも、元の物理名（接頭辞付き）ではなくクリーンな名前を返す
    return cleanName
  }

  // XML エンティティのデコードと ID 置換
  const formatFormulaText = (rawFormula: string | undefined) => {
    if (!rawFormula) return undefined

    // 1. まず &amp; をデコード（二重エンコード対策）
    let decoded = rawFormula.replace(/&amp;/g, '&')

    // 2. 数値実体参照 (&#10;, &#13; 等) をすべて文字に変換
    decoded = decoded.replace(/&#(\d+);/g, (_: string, dec: string) => {
      const charCode = parseInt(dec, 10)
      if (charCode === 13) return '' // CRは除去
      return String.fromCharCode(charCode)
    })

    // 3. 16進数実体参照 (&#x0A; 等) をすべて文字に変換
    decoded = decoded.replace(
      /&#x([0-9a-fA-F]+);/g,
      (_: string, hex: string) => {
        const charCode = parseInt(hex, 16)
        if (charCode === 13) return ''
        return String.fromCharCode(charCode)
      },
    )

    // 4. その他の主要な実体参照
    decoded = decoded
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#9;/g, '\t')

    // 5. 物理名（[Calculation_...] など）を表示名に置換
    // eslint-disable-next-line security/detect-unsafe-regex
    return decoded.replace(
      /\[(?:([^\]]+)\]\.\[)?([^\]]+)\]/g,
      (_match, dsName, fieldName) => {
        const caption = getCaption(fieldName)
        if (dsName === 'Parameters' || dsName === 'パラメーター')
          return `[パラメーター].[${caption}]`
        return `[${caption}]`
      },
    )
  }

  if (!selectedId || !selectedType) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30">
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-4">
          <MousePointer2 size={48} className="text-slate-200 animate-bounce" />
          <p className="text-sm font-medium">
            ナビゲーターからアイテムを選択してください
          </p>
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
              ダッシュボードの概要
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              構成内容
            </h3>
            <p className="text-5xl font-black text-slate-800">
              {db.worksheets.length}{' '}
              <span className="text-xl font-medium text-slate-400 ml-1">
                シート
              </span>
            </p>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-3">
            <FileText size={20} className="text-emerald-500" />{' '}
            このダッシュボード内のワークシート
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
                    詳細を表示 →
                  </p>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  // 2. Worksheet View
  if (selectedType === 'worksheet') {
    const ws = doc.worksheets.find((w) => w.name === selectedId)
    if (!ws) return null

    const getFieldInfo = (fieldName: string, shelfContinuous?: boolean) => {
      const clean = (name: string) => {
        let inner = name
        const bracketMatches = [...name.matchAll(/\[([^\]]+)\]/g)]
        if (bracketMatches.length > 0) {
          inner = bracketMatches[bracketMatches.length - 1][1]
        }

        const parts = inner.split(':')
        const last = parts[parts.length - 1]
        const typeIds = ['nk', 'qk', 'ok', 'ok2', 'ni', 'oi']
        const aggFns = [
          'sum',
          'avg',
          'min',
          'max',
          'count',
          'cnt',
          'cntd',
          'attr',
          'median',
          'stdev',
          'var',
          'collect',
        ]

        if (typeIds.includes(last.toLowerCase())) {
          // 型識別子がある場合はその前を取る。さらにそれが集計関数ならさらに前を取る
          const candidate = parts[parts.length - 2]
          if (candidate && aggFns.includes(candidate.toLowerCase())) {
            return parts[parts.length - 3] || candidate
          }
          return candidate || last
        }

        // 型識別子がない場合は、全体を名前として扱う（コロンを含めて保持）
        return inner
      }

      const cleanId = clean(fieldName)
      let meta = fieldMeta.get(cleanId)
      if (!meta) {
        for (const [k, v] of fieldMeta.entries()) {
          if (k.toLowerCase() === cleanId.toLowerCase()) {
            meta = v
            break
          }
        }
      }

      let displayCaption = meta?.caption || cleanId
      if (displayCaption.startsWith('[') && displayCaption.endsWith(']')) {
        displayCaption = displayCaption.substring(1, displayCaption.length - 1)
      }
      const isSum =
        /\bsum:/i.test(fieldName) && !displayCaption.includes('合計')
      const isAvg =
        /\bavg:/i.test(fieldName) && !displayCaption.includes('平均')
      const isMin =
        /\bmin:/i.test(fieldName) && !displayCaption.includes('最小')
      const isMax =
        /\bmax:/i.test(fieldName) && !displayCaption.includes('最大')
      const isCount =
        /\bcnt:|\bcntd:/i.test(fieldName) &&
        !displayCaption.includes('カウント')
      const isAttr =
        /\battr:/i.test(fieldName) && !displayCaption.includes('属性')
      const isCollect =
        (/\bcollect:|\bspatial:/i.test(fieldName) ||
          meta?.dataType === 'spatial') &&
        !displayCaption.includes('収集')
      const isTableCalc =
        (fieldName.includes('rank:') ||
          fieldName.includes('running:') ||
          fieldName.includes('window:')) &&
        !displayCaption.includes('△')

      let formattedCaption = displayCaption
      if (
        !formattedCaption.startsWith('[') &&
        !/^\d+$/.test(formattedCaption) &&
        !formattedCaption.includes('(')
      ) {
        formattedCaption = `[${formattedCaption}]`
      }

      let aggregation = 'なし'
      if (isSum) aggregation = t('sum')
      else if (isAvg) aggregation = t('avg')
      else if (isMin) aggregation = '最小'
      else if (isMax) aggregation = '最大'
      else if (isCount) aggregation = t('count')
      else if (isAttr) aggregation = '属性'
      else if (isCollect) aggregation = '収集'

      displayCaption = formattedCaption
      if (aggregation !== 'なし') {
        displayCaption = `${aggregation}(${formattedCaption})`
      }

      if (isTableCalc) displayCaption = `${displayCaption} △`

      return {
        name: fieldName,
        caption: displayCaption,
        baseCaption: formattedCaption,
        aggregation: aggregation,
        isCalc: meta?.isCalc ?? false,
        formula: formatFormulaText(meta?.formula),
        isContinuous:
          shelfContinuous !== undefined
            ? shelfContinuous
            : (meta?.isContinuous ?? false),
      }
    }

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
                return <Pill key={`${f.name}-${i}`} {...info} />
              })
            ) : (
              <span className="text-[11px] text-slate-300 italic py-1">
                （なし）
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
          headerLabel = 'すべて'
        } else {
          if (pane.yAxisName || pane.xAxisName) {
            const axisRef = pane.yAxisName || pane.xAxisName
            const info = getFieldInfo(axisRef!)
            headerLabel = info.caption

            // MIN(0) などの定数計算を Tableau っぽく調整
            if (headerLabel.toLowerCase().startsWith('min(0)')) {
              headerLabel = '集計(MIN(0))'
            }
          } else {
            const measureIndex = hasAllPane ? index - 1 : index
            const matchedField = splitMeasures[measureIndex]
            headerLabel = matchedField
              ? getFieldInfo(matchedField.name, matchedField.isContinuous)
                  .caption
              : `${t('marks')} ${index + 1}`
          }
        }
      } else {
        headerLabel = 'すべて'
      }

      // 重複がある場合は (2), (3) を付与
      if (headerLabel !== 'すべて') {
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
              { label: t('color'), fields: pane.encodings.color },
              { label: t('size'), fields: pane.encodings.size },
              { label: t('label'), fields: pane.encodings.label },
              { label: t('detail'), fields: pane.encodings.detail },
              { label: t('tooltip'), fields: pane.encodings.tooltip },
            ].map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest">
                  {group.label}
                </p>
                <div className="flex flex-wrap min-h-[1.5rem] gap-1">
                  {group.fields && group.fields.length > 0 ? (
                    group.fields.map((f, i) => (
                      <Pill
                        key={`${f.name}-${i}`}
                        {...getFieldInfo(f.name, f.isContinuous)}
                      />
                    ))
                  ) : (
                    <span className="text-[10px] text-slate-200 italic">
                      （なし）
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
                {t('worksheet')}
              </span>
              <span className="text-slate-200">/</span>
              <span className="text-slate-500 text-sm flex items-center gap-1.5 font-medium">
                <Database size={14} className="text-slate-400" />{' '}
                {ws.datasourceNames?.join(', ')}
              </span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-stretch">
          {/* Columns & Rows */}
          <div className="grid grid-cols-1 gap-6 content-start">
            {renderShelfCard(
              t('columns'),
              ws.shelf?.cols,
              <Layout size={14} className="rotate-90" />,
              'bg-blue-50/50 text-blue-700',
            )}
            {renderShelfCard(
              t('rows'),
              ws.shelf?.rows,
              <Layout size={14} />,
              'bg-indigo-50/50 text-indigo-700',
            )}
            {renderShelfCard(
              t('filters'),
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

    const calcs = ds.fields.filter((f) => !!f.formula)
    const normal = ds.fields.filter((f) => !f.formula)

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
              Data Source Fields
            </p>
          </div>
        </header>

        <section className="space-y-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50/50 text-emerald-700 font-bold text-xs uppercase tracking-widest flex items-center gap-3">
              <Hash size={16} /> Calculated Fields ({calcs.length})
            </div>
            <div className="p-8 flex flex-wrap gap-2">
              {calcs.map((f) => (
                <Pill
                  key={f.column}
                  name={f.column}
                  caption={f.caption}
                  isCalc
                  isContinuous={f.type === 'quantitative'}
                  formula={formatFormulaText(f.formula)}
                />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-widest flex items-center gap-3">
              <Database size={16} /> Standard Fields ({normal.length})
            </div>
            <div className="p-8 flex flex-wrap gap-2">
              {normal.map((f) => (
                <Pill
                  key={f.column}
                  name={f.column}
                  caption={f.caption}
                  isContinuous={f.type === 'quantitative'}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    )
  }

  return null
}
