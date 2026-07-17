import { useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { t } from '../utils/i18n'
import { SearchResultsList } from './SearchResultsList'
import type { SearchResult } from '../hooks/useSearch'

interface MobileSearchOverlayProps {
  isOpen: boolean
  onClose: () => void
  query: string
  onQueryChange: (query: string) => void
  results: SearchResult[]
  onNavigate: (
    type: 'dashboard' | 'worksheet' | 'datasource',
    id: string,
    field?: string,
  ) => void
}

/**
 * 狭い画面（md 未満）向けの全幅検索オーバーレイ。
 * ヘッダーの検索アイコンから開き、画面幅いっぱいの検索バーと結果リストを表示する。
 * 検索クエリ・useSearch の結果・debounce ロジックは App 側と共有する（本コンポーネントは表示に専念）。
 */
export function MobileSearchOverlay({
  isOpen,
  onClose,
  query,
  onQueryChange,
  results,
  onNavigate,
}: MobileSearchOverlayProps) {
  // Escape キーで閉じる
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] md:hidden">
      {/* バックドロップ（タップで閉じる） */}
      <button
        type="button"
        data-testid="mobile-search-backdrop"
        aria-label={t('search.close')}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm border-none cursor-default animate-in fade-in duration-200"
      />

      {/* 検索パネル（ヘッダーを覆う形で最上部に表示） */}
      <div className="absolute inset-x-0 top-0 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-slate-400" />
            </div>
            <input
              type="text"
              data-testid="mobile-search-input"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- オーバーレイを開いた直後に検索に集中できるよう意図的にフォーカスする
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t('search.placeholder')}
              className="block w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-2xl bg-white text-sm shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <button
            type="button"
            data-testid="mobile-search-close"
            aria-label={t('search.close')}
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-white border border-slate-200 shadow-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {query.trim() && (
          <div className="mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {t('search.type_field')} ({results.length})
              </span>
            </div>
            {/* 結果選択時（onNavigate 後）にオーバーレイも閉じる */}
            <SearchResultsList
              results={results}
              onNavigate={onNavigate}
              onClose={onClose}
            />
          </div>
        )}
      </div>
    </div>
  )
}
