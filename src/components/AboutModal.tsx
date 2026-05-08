import { X, Info, ExternalLink, Heart } from 'lucide-react'

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
          <div className="flex items-center gap-3 text-slate-400">
            <Info size={20} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
              Information
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-12 py-6 space-y-12">
          {/* Main Title */}
          <section>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight mb-2">
              Verso-viz
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Tableau ワークブックの構成を把握するための、ミニマルな解析ツール。
            </p>
          </section>

          {/* Disclaimer */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] border-b border-slate-100 pb-2">
              Disclaimer
            </h3>
            <div className="grid gap-6 text-slate-500 text-xs leading-relaxed">
              <div>
                <h4 className="font-bold text-slate-700 mb-1">Data Privacy</h4>
                <p>
                  本ツールはクライアントサイド（ブラウザ内）でのみ動作します。アップロードされたファイルやデータが外部サーバーに送信・保存されることは一切ありません。
                </p>
              </div>
              <div>
                <h4 className="font-bold text-slate-700 mb-1">As Is</h4>
                <p>
                  本ツールは現状有姿で提供されます。ツールの利用により生じた直接的・間接的な損害（データ破損、業務への影響等）について、作者は一切の責任を負いません。
                </p>
              </div>
              <div>
                <h4 className="font-bold text-slate-700 mb-1">Relationship</h4>
                <p>
                  本プロジェクトは個人による開発であり、Salesforce.com, Inc.
                  および Tableau Software, LLC とは一切関係ありません。
                </p>
              </div>
            </div>
          </section>

          {/* Credits & Licenses */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] border-b border-slate-100 pb-2">
              Credits & Licenses
            </h3>
            <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-400">
              <div>
                <p className="font-bold text-slate-600">React</p>
                <p>MIT License</p>
              </div>
              <div>
                <p className="font-bold text-slate-600">SheetJS (js-xlsx)</p>
                <p>Apache License 2.0</p>
              </div>
              <div>
                <p className="font-bold text-slate-600">Special Thanks</p>
                <p className="flex items-center gap-1">
                  To the Tableau DataFam community{' '}
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
            className="flex items-center gap-3 text-slate-400 hover:text-blue-600 transition-all group"
          >
            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
              <ExternalLink size={14} />
            </div>
            <span className="text-[10px] font-bold tracking-widest uppercase">
              Created by @hizukuri3
            </span>
          </a>
          <p className="text-[10px] text-slate-300 font-medium">
            Version 1.0.0
          </p>
        </footer>
      </div>
    </div>
  )
}
