import React from 'react';
import { ChevronRight, Home, Layout, FileText } from 'lucide-react';
import { t } from '../utils/i18n';

interface BreadcrumbsProps {
  dashboardName?: string;
  worksheetName?: string;
  onReset: () => void;
}

export default function Breadcrumbs({ dashboardName, worksheetName, onReset }: BreadcrumbsProps) {
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
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md">
            <Layout size={14} />
            <span className="font-semibold">{dashboardName}</span>
          </div>
        </>
      )}
      
      {worksheetName && (
        <>
          <ChevronRight size={14} className="text-slate-300" />
          <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md">
            <FileText size={14} />
            <span className="font-semibold">{worksheetName}</span>
          </div>
        </>
      )}
    </nav>
  );
}
