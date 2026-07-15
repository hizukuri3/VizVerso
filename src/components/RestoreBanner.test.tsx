/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RestoreBanner } from './RestoreBanner'
import '@testing-library/jest-dom'

describe('RestoreBanner', () => {
  it('ワークブック名を含む見出しが表示されること', () => {
    render(
      <RestoreBanner
        name="Superstore.twbx"
        onRestore={() => {}}
        onDiscard={() => {}}
      />,
    )
    // 「{name}」がタイトルに含まれる（部分一致で検証）
    expect(screen.getByText(/Superstore\.twbx/)).toBeInTheDocument()
  })

  it('復元ボタンをクリックすると onRestore が呼ばれること', () => {
    const onRestore = vi.fn()
    render(
      <RestoreBanner
        name="a.twbx"
        onRestore={onRestore}
        onDiscard={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId('restore-action'))
    expect(onRestore).toHaveBeenCalledTimes(1)
  })

  it('破棄ボタンをクリックすると onDiscard が呼ばれること', () => {
    const onDiscard = vi.fn()
    render(
      <RestoreBanner
        name="a.twbx"
        onRestore={() => {}}
        onDiscard={onDiscard}
      />,
    )
    fireEvent.click(screen.getByTestId('restore-discard'))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
