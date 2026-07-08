import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { t } from '../utils/i18n'

interface TrySampleButtonProps {
  /** 取得したサンプルファイルを既存の解析フローへ流し込むコールバック */
  onFileDrop: (file: File) => void
  /** fetch 失敗時のエラーハンドリング（App 側の error 表示経路へ接続する想定） */
  onError?: (message: string) => void
}

/** 同梱サンプル .twbx のパス（public 配下に配置） */
const SAMPLE_PATH = '/sample.twbx'

/**
 * 「サンプルで試す」ボタン。
 * クリックで public/sample.twbx を取得し、File 化して既存の解析フローに投入する。
 */
export function TrySampleButton({ onFileDrop, onError }: TrySampleButtonProps) {
  // fetch 中の二重クリック防止用フラグ
  const [isFetching, setIsFetching] = useState(false)

  const handleClick = async () => {
    if (isFetching) return
    setIsFetching(true)
    try {
      const res = await fetch(SAMPLE_PATH)
      if (!res.ok) {
        throw new Error(`Failed to fetch sample: ${res.status}`)
      }
      const buffer = await res.arrayBuffer()
      // ドロップ・選択時と同じく File として扱う（ファイル名は sample.twbx 固定）
      const file = new File([buffer], 'sample.twbx', {
        type: 'application/octet-stream',
      })
      onFileDrop(file)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('error.default')
      onError?.(message)
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <div className="mt-5 flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isFetching}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-all shadow-md shadow-slate-200 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Sparkles size={16} />
        {t('dropzone.try_sample')}
      </button>
      <p className="text-xs text-slate-400 font-medium">
        {t('dropzone.try_sample_hint')}
      </p>
    </div>
  )
}
