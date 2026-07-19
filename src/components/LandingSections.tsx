import {
  ClipboardList,
  Trash2,
  FileSpreadsheet,
  ChevronDown,
} from 'lucide-react'
import { t } from '../utils/i18n'

/** ユースケースカードの定義 */
const USE_CASES = [
  {
    icon: <ClipboardList className="text-blue-500" size={22} />,
    key: 'handover',
  },
  {
    icon: <Trash2 className="text-emerald-500" size={22} />,
    key: 'cleanup',
  },
  {
    icon: <FileSpreadsheet className="text-amber-500" size={22} />,
    key: 'documentation',
  },
] as const

/** FAQ の質問キー一覧 */
const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4'] as const

/**
 * ランディング画面のユースケース + FAQ セクション。
 * 既存の特徴カードの下に配置する。全文言は i18n キー経由。
 */
export function LandingSections() {
  return (
    <div className="mt-16 sm:mt-24 space-y-16 sm:space-y-24 text-left">
      {/* ── ユースケース ── */}
      <section>
        <h3 className="text-2xl sm:text-3xl font-black text-slate-900 text-center mb-8 sm:mb-10 tracking-tight">
          {t('usecases.title')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          {USE_CASES.map(({ icon, key }) => (
            <div
              key={key}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  {icon}
                </div>
                <h4 className="font-bold text-slate-800 text-base [word-break:keep-all] [overflow-wrap:anywhere]">
                  {t(`usecases.${key}.title`)}
                </h4>
              </div>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                「{t(`usecases.${key}.situation`)}」
              </p>
              <p className="text-sm text-slate-700 font-semibold leading-relaxed mt-auto pt-1">
                → {t(`usecases.${key}.solution`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section>
        <h3 className="text-2xl sm:text-3xl font-black text-slate-900 text-center mb-8 sm:mb-10 tracking-tight">
          {t('faq.title')}
        </h3>
        <div className="max-w-2xl mx-auto space-y-3">
          {FAQ_KEYS.map((key) => (
            <details
              key={key}
              className="group bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
            >
              <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none font-bold text-slate-800 text-sm sm:text-base">
                <span>{t(`faq.${key}.q`)}</span>
                <ChevronDown
                  size={18}
                  className="flex-shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="px-5 pb-5 -mt-1 text-sm text-slate-500 font-medium leading-relaxed whitespace-pre-line">
                {t(`faq.${key}.a`)}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
