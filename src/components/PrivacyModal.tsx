import {
  X,
  ShieldCheck,
  Lock,
  Eye,
  FileText,
  ExternalLink,
  BarChart3,
} from 'lucide-react'
import { t } from '../utils/i18n'

interface PrivacyModalProps {
  isOpen: boolean
  onClose: () => void
}

export function PrivacyModal({ isOpen, onClose }: PrivacyModalProps) {
  if (!isOpen) return null

  const sections = [
    {
      key: 'data_security',
      icon: <Lock size={18} className="text-blue-500" />,
    },
    {
      key: 'information_collect',
      icon: <Eye size={18} className="text-emerald-500" />,
    },
    {
      key: 'purpose',
      icon: <FileText size={18} className="text-purple-500" />,
    },
    {
      key: 'analytics',
      icon: <BarChart3 size={18} className="text-sky-500" />,
    },
    {
      key: 'stripe',
      icon: <ShieldCheck size={18} className="text-orange-500" />,
    },
  ] as const

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <button
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md w-full h-full border-none cursor-default"
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close modal"
      />

      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
        <header className="p-6 sm:p-8 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                {t('privacy.title')}
              </h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                Privacy Policy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition text-slate-500 hover:text-slate-600"
          >
            <X size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8">
          {sections.map((section) => (
            <div key={section.key} className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                {section.icon}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {t(`privacy.sections.${section.key}.title` as any)}
              </h3>
              <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {t(`privacy.sections.${section.key}.content` as any)}
                </p>
              </div>
            </div>
          ))}

          <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-3xl flex items-start gap-4">
            <div className="p-2 bg-white text-blue-500 rounded-lg shadow-sm">
              <ExternalLink size={16} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-blue-900">
                Stripe Global Privacy Policy
              </h4>
              <p className="text-xs text-blue-700 leading-relaxed">
                {t('privacy.stripe_link_note')}
              </p>
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-600 hover:underline inline-block mt-1"
              >
                stripe.com/privacy
              </a>
            </div>
          </div>
        </div>

        <footer className="p-6 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.2em]">
            VizVerso Privacy Commitment
          </p>
        </footer>
      </div>
    </div>
  )
}
