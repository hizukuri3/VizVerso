import React, { useEffect, useRef } from 'react'
import { t } from '../utils/i18n'

interface FormulaHighlighterProps {
  formula: string
  searchQuery?: string
}

export function FormulaHighlighter({
  formula,
  searchQuery,
}: FormulaHighlighterProps) {
  const firstMatchRef = useRef<HTMLElement>(null)
  const paramLabel = t('nav.datasources')

  useEffect(() => {
    if (searchQuery && firstMatchRef.current) {
      firstMatchRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [searchQuery, formula])

  const tokenRegex =
    /(".*?"|'.*?'|\[(?:Parameters|パラメーター)\]\.\[[^\]]+\]|\[[^\]]+\]|\b(?:IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR|NOT)\b|\b[A-Z_]+\b(?=\s*\())/gi
  const lines = formula.split('\n')
  const isFirstMatch = { current: true }

  const highlightSearch = (text: string) => {
    if (!searchQuery?.trim()) return text

    // 正規表現の特殊文字をエスケープ
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // eslint-disable-next-line security/detect-non-literal-regexp
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'))
    return parts.map((part, i) => {
      if (part.toLowerCase() === searchQuery.toLowerCase()) {
        const isFirst = isFirstMatch.current
        if (isFirst) isFirstMatch.current = false
        return (
          <mark
            key={i}
            ref={isFirst ? firstMatchRef : null}
            className="bg-amber-200/80 text-slate-900 rounded-sm px-0.5 font-bold shadow-[0_0_10px_rgba(251,191,36,0.3)] animate-pulse"
          >
            {part}
          </mark>
        )
      }
      return part
    })
  }

  const renderToken = (part: string, i: number) => {
    if (!part) return null

    let content: React.ReactNode = highlightSearch(part)
    let className = 'text-slate-600'

    if (part.startsWith('"') || part.startsWith("'")) {
      className = 'text-slate-400'
    } else if (part.startsWith(`[${paramLabel}].`)) {
      className = 'text-purple-500'
    } else if (part.startsWith('[')) {
      className = 'text-orange-400 font-semibold'
    } else if (/^(IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR|NOT)$/i.test(part)) {
      className = 'font-bold text-slate-800'
      content = highlightSearch(part.toUpperCase())
    } else if (/^[A-Z_]+$/i.test(part)) {
      className = 'text-blue-600'
      content = highlightSearch(part.toUpperCase())
    }

    return (
      <span key={i} className={className}>
        {content}
      </span>
    )
  }

  return (
    <div className="relative group">
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-100 to-purple-100 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
      <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-100 shadow-xl overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar font-mono text-[13px] leading-relaxed">
        <table className="border-collapse w-full">
          <tbody>
            {lines.map((line, lineIdx) => {
              const parts = line.split(tokenRegex)
              return (
                <tr
                  key={lineIdx}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="w-12 select-none text-right pr-4 text-slate-300 border-r border-slate-50 bg-slate-50/30 py-1 text-[11px] font-mono">
                    {lineIdx + 1}
                  </td>
                  <td className="pl-6 pr-10 py-1 whitespace-pre-wrap break-all">
                    {parts.map((part, i) => renderToken(part, i))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
