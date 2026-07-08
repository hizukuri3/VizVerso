/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import '@testing-library/jest-dom'
import { FormulaHighlighter } from './FormulaHighlighter'

// nav.datasources キーが常に 'Parameters' を返すようにモックする。
// 実装上 paramLabel（t('nav.datasources')）が 'Parameters' の場合にのみ
// パラメータ参照トークン（[Parameters].[...]）の紫色ハイライト分岐に到達するため、
// この分岐を確認する目的でモックしている（プロダクトコードは変更しない）。
vi.mock('../utils/i18n', () => ({
  t: () => 'Parameters',
}))

describe('FormulaHighlighter', () => {
  beforeAll(() => {
    // jsdom は scrollIntoView を実装していないためスタブを用意する
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('searchQuery が未指定の場合はハイライトされずそのまま表示されること', () => {
    render(<FormulaHighlighter formula="[Sales] * 2" />)
    expect(screen.getByText(/Sales/)).toBeInTheDocument()
    // ハイライト用の mark 要素が存在しないこと
    expect(document.querySelector('mark')).toBeNull()
  })

  it('searchQuery が空白のみの場合もハイライトされないこと', () => {
    render(<FormulaHighlighter formula="[Sales] * 2" searchQuery="   " />)
    expect(document.querySelector('mark')).toBeNull()
  })

  it('searchQuery に一致する箇所が mark 要素でハイライトされ、最初の一致にスクロール処理が呼ばれること', () => {
    render(
      <FormulaHighlighter formula="[Sales] + [Sales]" searchQuery="Sales" />,
    )
    const marks = document.querySelectorAll('mark')
    // [Sales] が2箇所あり、それぞれ "Sales" 部分がハイライトされる
    expect(marks.length).toBeGreaterThanOrEqual(2)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('文字列リテラルは text-slate-400 で表示されること', () => {
    render(<FormulaHighlighter formula='"Hello"' />)
    const span = screen.getByText('"Hello"')
    expect(span.className).toContain('text-slate-400')
  })

  it('パラメータ参照（[Parameters].[...]）は text-purple-500 で表示されること', () => {
    render(<FormulaHighlighter formula="[Parameters].[Threshold]" />)
    const span = screen.getByText('[Parameters].[Threshold]')
    expect(span.className).toContain('text-purple-500')
  })

  it('通常のフィールド参照（[...]）は text-orange-400 で表示されること', () => {
    render(<FormulaHighlighter formula="[Sales]" />)
    const span = screen.getByText('[Sales]')
    expect(span.className).toContain('text-orange-400')
  })

  it('IF/THEN/ELSE 等のキーワードは大文字化され font-bold で表示されること', () => {
    render(<FormulaHighlighter formula="if [Sales] then 1 else 0 end" />)
    const ifSpan = screen.getByText('IF')
    expect(ifSpan.className).toContain('font-bold')
    expect(screen.getByText('THEN')).toBeInTheDocument()
    expect(screen.getByText('ELSE')).toBeInTheDocument()
    expect(screen.getByText('END')).toBeInTheDocument()
  })

  it('キーワードトークンに検索クエリが一致する場合はハイライトも適用されること', () => {
    render(
      <FormulaHighlighter
        formula="if [Sales] then 1 else 0 end"
        searchQuery="IF"
      />,
    )
    // toUpperCase() されたテキストに対して検索がハイライトされる
    const mark = document.querySelector('mark')
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe('IF')
  })

  it('関数名（SUM 等）は大文字化され text-blue-600 で表示されること', () => {
    render(<FormulaHighlighter formula="sum([Sales])" />)
    const span = screen.getByText('SUM')
    expect(span.className).toContain('text-blue-600')
  })

  it('関数名トークンに検索クエリが一致する場合はハイライトも適用されること', () => {
    render(<FormulaHighlighter formula="sum([Sales])" searchQuery="sum" />)
    const mark = document.querySelector('mark')
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe('SUM')
  })

  it('複数行の計算式が行番号付きで表示されること', () => {
    render(<FormulaHighlighter formula={'[Sales]\n[Profit]'} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
