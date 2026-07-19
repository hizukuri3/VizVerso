import {
  X,
  ShieldCheck,
  Mail,
  CreditCard,
  Clock,
  Truck,
  RotateCcw,
  User,
  MapPin,
} from 'lucide-react'
import { t } from '../utils/i18n'

interface LegalModalProps {
  isOpen: boolean
  onClose: () => void
}

export function LegalModal({ isOpen, onClose }: LegalModalProps) {
  if (!isOpen) return null

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
            <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                {t('legal.title')}
              </h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                Legal Notice
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Vendor */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <User size={12} className="text-blue-500" /> {t('legal.seller')}
              </h3>
              <p className="text-sm font-bold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                {t('legal.seller_name')}
              </p>
            </div>

            {/* Representative */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <User size={12} className="text-emerald-500" />{' '}
                {t('legal.representative')}
              </h3>
              <p className="text-sm font-bold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                {t('legal.representative_name')}
              </p>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <MapPin size={12} className="text-orange-500" />{' '}
              {t('legal.address')}
            </h3>
            <p className="text-sm font-bold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              {t('legal.address_detail')}
            </p>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <Mail size={12} className="text-purple-500" />{' '}
              {t('legal.contact')}
            </h3>
            <div className="bg-purple-50/50 border border-purple-100 p-6 rounded-3xl space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider">
                    Email
                  </span>
                  <p className="text-sm font-bold text-purple-700">
                    {t('legal.contact_email')}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider">
                    {t('legal.contact_phone')}
                  </span>
                  <p className="text-sm font-bold text-purple-700">
                    {t('legal.contact_phone_detail')}
                  </p>
                </div>
              </div>
              <div className="p-4 bg-white/60 rounded-2xl text-[11px] leading-relaxed text-slate-500 border border-purple-100/50 italic">
                {t('legal.privacy_note')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Price */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <CreditCard size={12} className="text-amber-500" />{' '}
                {t('legal.price')}
              </h3>
              <p className="text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed">
                {t('legal.price_detail')}
              </p>
            </div>

            {/* Additional Charges */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <CreditCard size={12} className="text-rose-500" />{' '}
                {t('legal.additional_charges')}
              </h3>
              <p className="text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed">
                {t('legal.additional_charges_detail')}
              </p>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <CreditCard size={12} className="text-blue-500" />{' '}
                {t('legal.payment_method')}
              </h3>
              <p className="text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed">
                {t('legal.payment_method_detail')}
              </p>
            </div>

            {/* Payment Timing */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Clock size={12} className="text-indigo-500" />{' '}
                {t('legal.payment_timing')}
              </h3>
              <p className="text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed">
                {t('legal.payment_timing_detail')}
              </p>
            </div>

            {/* Delivery Timing */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Truck size={12} className="text-emerald-500" />{' '}
                {t('legal.delivery_timing')}
              </h3>
              <p className="text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed">
                {t('legal.delivery_timing_detail')}
              </p>
            </div>
          </div>

          {/* Returns */}
          <div className="space-y-2 pb-4">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <RotateCcw size={12} className="text-red-500" />{' '}
              {t('legal.returns')}
            </h3>
            <p className="text-xs text-slate-600 bg-red-50/30 p-4 rounded-2xl border border-red-100 leading-relaxed">
              {t('legal.returns_detail')}
            </p>
          </div>
        </div>

        <footer className="p-6 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.2em]">
            VizVerso Legal Compliance
          </p>
        </footer>
      </div>
    </div>
  )
}
