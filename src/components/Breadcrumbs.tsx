import { ChevronRight, Home, Layout, FileText } from 'lucide-react'
import { t } from '../utils/i18n'

interface BreadcrumbsProps {
  dashboardName?: string
  worksheetName?: string
  onReset: () => void
  onNavigateDashboard?: (name: string) => void
}

export default function Breadcrumbs({
  dashboardName,
  worksheetName,
  onReset,
  onNavigateDashboard,
}: BreadcrumbsProps) {
  return (
    <nav className="flex items-center space-x-2 text-sm text-slate-500 mb-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
      <button
        onClick={onReset}
        className="flex items-center hover:text-blue-600 transition-colors gap-1 px-2 py-1 rounded hover:bg-slate-50"
      >
        <Home size={14} />
        <span className="font-medium">{t('nav.home')}</span>
      </button>

      {dashboardName && (
        <>
          <ChevronRight size={14} className="text-slate-300" />
          {worksheetName ? (
            <button
              onClick={() => onNavigateDashboard?.(dashboardName)}
              className="flex items-center gap-1 px-2 py-1 hover:bg-blue-50 text-blue-400 hover:text-blue-700 rounded-md transition-all min-w-0"
            >
              <Layout size={14} className="shrink-0" />
              <span
                className="font-semibold truncate max-w-[220px]"
                title={dashboardName}
              >
                {dashboardName}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md min-w-0">
              <Layout size={14} className="shrink-0" />
              <span
                className="font-semibold truncate max-w-[220px]"
                title={dashboardName}
              >
                {dashboardName}
              </span>
            </div>
          )}
        </>
      )}

      {worksheetName && (
        <>
          <ChevronRight size={14} className="text-slate-300" />
          <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md min-w-0">
            <FileText size={14} className="shrink-0" />
            <span
              className="font-semibold truncate max-w-[220px]"
              title={worksheetName}
            >
              {worksheetName}
            </span>
          </div>
        </>
      )}
    </nav>
  )
}
