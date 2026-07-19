import {
  FileText,
  Database,
  Hash,
  ArrowRight,
  CornerDownRight,
} from 'lucide-react'
import { t } from '../utils/i18n'
import type { SearchResult } from '../hooks/useSearch'

interface SearchResultsListProps {
  results: SearchResult[]
  onNavigate: (
    type: 'dashboard' | 'worksheet' | 'datasource',
    id: string,
    field?: string,
  ) => void
  onClose: () => void
}

export function SearchResultsList({
  results,
  onNavigate,
  onClose,
}: SearchResultsListProps) {
  if (results.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p className="text-sm font-medium">{t('search.no_results')}</p>
      </div>
    )
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'worksheet':
        return <FileText size={16} className="text-emerald-500" />
      case 'datasource':
        return <Database size={16} className="text-amber-500" />
      case 'field':
        return <Hash size={16} className="text-blue-500" />
      default:
        return null
    }
  }

  const getReasonBadge = (result: SearchResult) => {
    switch (result.reason) {
      case 'direct':
        return (
          <div className="flex items-center gap-1 min-w-0">
            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-bold rounded uppercase tracking-wider shrink-0">
              {t('search.direct_match')}
            </span>
            {result.subReason && (
              <span
                className="text-[9px] text-slate-500 flex items-center gap-0.5 truncate"
                title={result.subReason}
              >
                <CornerDownRight size={10} className="shrink-0" />[
                {result.subReason}]
              </span>
            )}
          </div>
        )
      case 'formula':
        return (
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold rounded uppercase tracking-wider">
            {t('search.hit_formula')}
          </span>
        )
      case 'dependency':
        return (
          <div className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[9px] font-bold rounded uppercase tracking-wider">
              {t('search.dependency_match')}
            </span>
            {result.subReason && (
              <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
                <CornerDownRight size={10} />[{result.subReason}]
              </span>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto">
      <div className="p-2 space-y-1">
        {results.map((res) => (
          <button
            key={`${res.type}-${res.id}`}
            onClick={() => {
              if (res.type === 'worksheet')
                onNavigate('worksheet', res.id, res.targetField)
              else if (res.type === 'datasource')
                onNavigate('datasource', res.id)
              else if (res.type === 'field') {
                // フィールドの場合は定義元（データソースまたはワークシート）へ遷移し、フィールド名も渡す
                onNavigate(res.parentType, res.parentName, res.id)
              }
              onClose()
            }}
            className="w-full text-left p-3 hover:bg-slate-50 rounded-xl transition-colors group flex items-start gap-3"
          >
            <div className="mt-1 p-2 bg-white rounded-lg border border-slate-100 shadow-sm group-hover:border-blue-200 transition-colors">
              {getTypeIcon(res.type)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="font-bold text-slate-700 truncate min-w-0"
                  title={res.caption || res.name}
                >
                  {res.caption || res.name}
                </span>
                {getReasonBadge(res)}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">
                  {res.type === 'field'
                    ? res.parentCaption || res.parentName
                    : res.type === 'worksheet'
                      ? t('search.type_worksheet')
                      : t('search.type_datasource')}
                </span>

                <span className="text-[11px] text-blue-500 font-bold opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
                  {res.type === 'field'
                    ? t('search.definition')
                    : t('search.usage')}
                  <ArrowRight size={12} />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
