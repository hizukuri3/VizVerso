import { useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, ArrowLeft, FileText } from 'lucide-react'
import DragDropZone from './DragDropZone'
import { DiffView } from './DiffView'
import { parseWorkbookAsync } from '../utils/workerManager'
import { diffWorkbooks } from '../utils/workbookDiff'
import { t } from '../utils/i18n'
import type { TableauDocument } from '../types/tableau'

interface LoadedWorkbook {
  fileName: string
  doc: TableauDocument
}

interface CompareViewProps {
  /** 解析モードへ戻る */
  onExit?: () => void
}

/** 1スロット分の状態 */
interface SlotState {
  loaded: LoadedWorkbook | null
  loading: boolean
  error: string | null
}

const emptySlot: SlotState = { loaded: null, loading: false, error: null }

/**
 * 2つのワークブックを読み込んで diff を表示する比較モード全体。
 * 各スロットの解析と diff 計算を自己完結で管理する。
 */
export function CompareView({ onExit }: CompareViewProps) {
  const [before, setBefore] = useState<SlotState>(emptySlot)
  const [after, setAfter] = useState<SlotState>(emptySlot)

  const handleDrop = (
    setSlot: React.Dispatch<React.SetStateAction<SlotState>>,
    file: File,
  ) => {
    setSlot({ loaded: null, loading: true, error: null })
    parseWorkbookAsync(file)
      .then((doc) => {
        setSlot({
          loaded: { fileName: file.name.replace(/\.(twbx?|twb)$/i, ''), doc },
          loading: false,
          error: null,
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : t('error.default')
        setSlot({ loaded: null, loading: false, error: message })
      })
  }

  const diff = useMemo(() => {
    if (!before.loaded || !after.loaded) return null
    return diffWorkbooks(before.loaded.doc, after.loaded.doc)
  }, [before.loaded, after.loaded])

  // 計算式のキャプション置換用メタ（column → caption）を両ドキュメントから構築（after 優先）。
  const fieldMeta = useMemo(() => {
    const meta = new Map<string, { caption?: string }>()
    const collect = (doc: TableauDocument | undefined) => {
      if (!doc) return
      for (const ds of doc.datasources) {
        for (const f of ds.fields) {
          if (f.caption) meta.set(f.column, { caption: f.caption })
        }
      }
      for (const ws of doc.worksheets) {
        for (const f of ws.localFields ?? []) {
          if (f.caption) meta.set(f.column, { caption: f.caption })
        }
      }
    }
    // before を先に入れ、after で上書き（after 優先）
    collect(before.loaded?.doc)
    collect(after.loaded?.doc)
    return meta
  }, [before.loaded, after.loaded])

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {t('diff.title')}
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1 [text-wrap:balance]">
              {t('diff.subtitle')}
            </p>
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all flex-shrink-0"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">
                {t('diff.back_to_analyze')}
              </span>
            </button>
          )}
        </div>

        {/* ファイルスロット（2つ横並び / モバイルは縦積み） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FileSlot
            label={t('diff.before_label')}
            slot={before}
            onDrop={(file) => handleDrop(setBefore, file)}
            onReset={() => setBefore(emptySlot)}
          />
          <FileSlot
            label={t('diff.after_label')}
            slot={after}
            onDrop={(file) => handleDrop(setAfter, file)}
            onReset={() => setAfter(emptySlot)}
          />
        </div>

        {/* 結果 */}
        {diff && before.loaded && after.loaded && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <DiffView
              diff={diff}
              beforeName={before.loaded.fileName}
              afterName={after.loaded.fileName}
              fieldMeta={fieldMeta}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** 1スロットのカード（未選択時はドロップゾーン、読み込み済みは概要表示）。 */
function FileSlot({
  label,
  slot,
  onDrop,
  onReset,
}: {
  label: string
  slot: SlotState
  onDrop: (file: File) => void
  onReset: () => void
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
      <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">
        {label}
      </div>

      {slot.loading && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-10 h-10 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
            {t('status.processing')}
          </span>
        </div>
      )}

      {!slot.loading && slot.loaded && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="p-2 bg-white rounded-xl border border-slate-100 flex-shrink-0">
              <FileText size={18} className="text-blue-500" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-700 truncate">
                {slot.loaded.fileName}
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                {t('diff.sheets_count', {
                  count: slot.loaded.doc.worksheets.length,
                })}
                {' · '}
                {t('diff.datasources_count', {
                  count: slot.loaded.doc.datasources.length,
                })}
              </div>
            </div>
          </div>
          <button
            onClick={onReset}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RefreshCw size={13} />
            {t('diff.replace')}
          </button>
        </div>
      )}

      {!slot.loading && !slot.loaded && (
        <>
          <DragDropZone onFileDrop={onDrop} />
          {slot.error && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-medium">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span className="truncate">{slot.error}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
