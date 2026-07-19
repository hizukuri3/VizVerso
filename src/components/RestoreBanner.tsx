import { History, RotateCcw, X } from 'lucide-react'
import { t } from '../utils/i18n'

interface RestoreBannerProps {
  /** 前回保存されたワークブックのファイル名 */
  name: string
  /** 「復元する」押下時のコールバック（既存の解析フローへ File を投入する想定） */
  onRestore: () => void
  /** 「破棄」押下時のコールバック（保存データ削除＋バナー非表示） */
  onDiscard: () => void
}

/**
 * リロードで解析状態が消えた際、前回のワークブックを復元できるコンパクトなカード。
 * ランディング画面のドロップゾーン上部に表示する。自動では開かず、明示操作を促す。
 */
export function RestoreBanner({
  name,
  onRestore,
  onDiscard,
}: RestoreBannerProps) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm">
      <div className="flex-shrink-0 p-2 bg-blue-50 text-blue-600 rounded-xl">
        <History size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-700 break-words [word-break:keep-all] [overflow-wrap:anywhere]">
          {t('restore.title', { name })}
        </p>
        <p className="text-xs text-slate-500 font-medium truncate">
          {t('restore.hint')}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          data-testid="restore-action"
          onClick={onRestore}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm active:scale-95"
        >
          <RotateCcw size={14} />
          {t('restore.action')}
        </button>
        <button
          type="button"
          data-testid="restore-discard"
          onClick={onDiscard}
          title={t('restore.discard')}
          className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-slate-500 hover:text-slate-600 hover:bg-slate-100 text-xs font-bold transition"
        >
          <X size={14} />
          <span className="hidden sm:inline">{t('restore.discard')}</span>
        </button>
      </div>
    </div>
  )
}
