import { X, Info, ExternalLink, Heart } from 'lucide-react'
import { t } from '../utils/i18n'

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl shadow-slate-200/50 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        <header className="px-8 pt-8 pb-4 flex justify-between items-start">
          <div className="flex items-center gap-3 text-slate-500">
            <Info size={20} />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">
              Information
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-500 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-12 py-6 space-y-12">
          {/* Main Title */}
          <section>
            <div className="flex items-center gap-4 mb-4">
              <img
                src="/favicon.png"
                alt=""
                className="h-12 w-12 object-contain"
              />
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">
                {t('app.title')}
              </h2>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed">
              {t('about.description')}
            </p>
          </section>

          {/* Disclaimer */}
          <section className="space-y-6">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 pb-2">
              {t('about.disclaimer')}
            </h3>
            <div className="grid gap-6 text-slate-500 text-xs leading-relaxed">
              <div>
                <h4 className="font-bold text-slate-700 mb-1">
                  {t('about.privacy_title')}
                </h4>
                <p>{t('about.privacy_desc')}</p>
              </div>
              <div>
                <h4 className="font-bold text-slate-700 mb-1">
                  {t('about.as_is_title')}
                </h4>
                <p>{t('about.as_is_desc')}</p>
              </div>
              <div>
                <h4 className="font-bold text-slate-700 mb-1">
                  {t('about.relationship_title')}
                </h4>
                <p>{t('about.relationship_desc')}</p>
              </div>
            </div>
          </section>

          {/* Credits & Licenses */}
          <section className="space-y-6">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 pb-2">
              {t('about.credits_title')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-[11px] text-slate-500">
              <div className="space-y-1">
                <p className="font-bold text-slate-600">React / React-DOM</p>
                <p>MIT License</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-600">Tailwind CSS</p>
                <p>MIT License</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-600">fast-xml-parser</p>
                <p>MIT License</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-600">JSZip</p>
                <p>MIT License</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-600">Lucide React</p>
                <p>ISC License</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-600">XyFlow (React Flow)</p>
                <p>MIT License</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-600">SheetJS (js-xlsx)</p>
                <p>Apache License 2.0</p>
              </div>
              <div className="space-y-1 col-span-full pt-2 border-t border-slate-50">
                <p className="font-bold text-slate-600">Special Thanks</p>
                <p className="flex items-center gap-1">
                  {t('about.special_thanks')}{' '}
                  <Heart size={10} className="text-red-400 fill-red-400" />
                </p>
              </div>
            </div>
          </section>
        </div>

        <footer className="px-12 py-8 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
          <a
            href="https://x.com/hizukuri3"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-slate-500 hover:text-blue-600 transition group"
          >
            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm group-hover:shadow-md transition">
              <ExternalLink size={14} />
            </div>
            <span className="text-[11px] font-bold tracking-widest uppercase">
              {t('about.deployed_by')}
            </span>
          </a>
          <p className="text-[11px] text-slate-400 font-medium">
            {t('about.version', { version: import.meta.env.VITE_APP_VERSION })}
          </p>
        </footer>
      </div>
    </div>
  )
}
