import { useEffect, useState } from 'react'
import {
  X,
  FileUp,
  ShieldCheck,
  Network,
  HeartPulse,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { t } from '../utils/i18n'
import { trackEvent } from '../utils/analytics'

interface GuideTourModalProps {
  isOpen: boolean
  onClose: () => void
}

export function GuideTourModal({ isOpen, onClose }: GuideTourModalProps) {
  // 閉じている間はアンマウントし、開くたびにステップを最初から始める
  if (!isOpen) return null
  return <TourDialog onClose={onClose} />
}

function TourDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)

  // 最終ステップの完了ボタンで閉じた場合は tour_completed、
  // 途中でスキップ / X / Escape で閉じた場合は tour_skipped を計測する
  const handleComplete = () => {
    trackEvent('tour_completed')
    onClose()
  }
  const handleSkip = () => {
    trackEvent('tour_skipped')
    onClose()
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // handleSkip は onClose にのみ依存するため onClose を依存に含める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  const steps = [
    {
      icon: <FileUp size={28} />,
      iconClass: 'bg-blue-50 text-blue-600',
      title: t('tour.step_upload.title'),
      desc: t('tour.step_upload.desc'),
    },
    {
      icon: <ShieldCheck size={28} />,
      iconClass: 'bg-emerald-50 text-emerald-600',
      title: t('tour.step_privacy.title'),
      desc: t('tour.step_privacy.desc'),
    },
    {
      icon: <Network size={28} />,
      iconClass: 'bg-violet-50 text-violet-600',
      title: t('tour.step_explore.title'),
      desc: t('tour.step_explore.desc'),
    },
    {
      icon: <HeartPulse size={28} />,
      iconClass: 'bg-rose-50 text-rose-600',
      title: t('tour.step_health.title'),
      desc: t('tour.step_health.desc'),
    },
    {
      icon: <Download size={28} />,
      iconClass: 'bg-amber-50 text-amber-600',
      title: t('tour.step_export.title'),
      desc: t('tour.step_export.desc'),
    },
  ]

  const isLast = step === steps.length - 1
  const current = steps.at(step) ?? steps[0]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-300">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('tour.title')}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl shadow-slate-200/50 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
      >
        <header className="px-8 pt-8 pb-2 flex justify-between items-start">
          <div className="flex items-center gap-3 text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
              {t('tour.badge')}
            </span>
          </div>
          <button
            onClick={handleSkip}
            aria-label={t('button.close')}
            className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </header>

        <div className="px-8 pb-6 text-center">
          <h2 className="text-lg font-black text-slate-800 tracking-tight mb-6">
            {t('tour.title')}
          </h2>

          {/* ステップ本文（key でステップ切替時にアニメーションを再生） */}
          <div
            key={step}
            className="animate-in fade-in slide-in-from-right-4 duration-300"
          >
            <div
              className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5 ${current.iconClass}`}
            >
              {current.icon}
            </div>
            <h3 className="font-bold text-slate-800 mb-2">{current.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed min-h-20">
              {current.desc}
            </p>
          </div>

          {/* ドットインジケーター */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`${i + 1} / ${steps.length}`}
                className={`h-2 rounded-full transition-all ${
                  i === step
                    ? 'w-6 bg-blue-600'
                    : 'w-2 bg-slate-200 hover:bg-slate-300'
                }`}
              />
            ))}
          </div>
        </div>

        <footer className="px-8 py-5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ChevronLeft size={14} />
              {t('tour.back')}
            </button>
          ) : (
            <button
              onClick={handleSkip}
              className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              {t('tour.skip')}
            </button>
          )}

          <button
            onClick={() => (isLast ? handleComplete() : setStep(step + 1))}
            className="flex items-center gap-1 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-100"
          >
            {isLast ? t('tour.start') : t('tour.next')}
            {!isLast && <ChevronRight size={14} />}
          </button>
        </footer>
      </div>
    </div>
  )
}
