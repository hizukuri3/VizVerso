/**
 * @vitest-environment jsdom
 */
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MobileSearchOverlay } from './MobileSearchOverlay'
import { useSearch } from '../hooks/useSearch'
import type { TableauDocument } from '../types/tableau'
import '@testing-library/jest-dom'

const doc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        {
          column: 'Profit Ratio',
          isCalc: true,
          formula: '[Profit] / [Sales]',
          dataType: 'real',
        },
      ],
    },
  ],
  worksheets: [
    {
      name: 'Sheet 1',
      dependencies: ['Sales', 'Profit Ratio'],
      localFields: [],
    },
  ],
  dashboards: [],
}

// useSearch を実際に動かすための最小ハーネス。
// App 側の debounce は本テストの対象外なので、クエリを直接反映させる。
function Harness({
  isOpen = true,
  onClose = () => {},
  onNavigate = () => {},
}: {
  isOpen?: boolean
  onClose?: () => void
  onNavigate?: (
    type: 'dashboard' | 'worksheet' | 'datasource',
    id: string,
    field?: string,
  ) => void
}) {
  const [query, setQuery] = useState('')
  const results = useSearch(doc, query)
  return (
    <MobileSearchOverlay
      isOpen={isOpen}
      onClose={onClose}
      query={query}
      onQueryChange={setQuery}
      results={results}
      onNavigate={onNavigate}
    />
  )
}

describe('MobileSearchOverlay', () => {
  it('isOpen=false のときは何も表示しないこと', () => {
    const { container } = render(<Harness isOpen={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('isOpen=true のとき検索入力欄が autoFocus 付きで表示されること', () => {
    render(<Harness />)
    const input = screen.getByTestId('mobile-search-input')
    expect(input).toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('入力すると useSearch の結果が表示されること', async () => {
    render(<Harness />)
    const input = screen.getByTestId('mobile-search-input')
    fireEvent.change(input, { target: { value: 'Sales' } })
    await waitFor(() => {
      expect(screen.getByText('Sales')).toBeInTheDocument()
    })
  })

  it('Escape キーで onClose が呼ばれること', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('閉じるボタンで onClose が呼ばれること', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByTestId('mobile-search-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('バックドロップのクリックで onClose が呼ばれること', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByTestId('mobile-search-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('結果クリックで onNavigate が呼ばれ、オーバーレイが閉じること', async () => {
    const onNavigate = vi.fn()
    const onClose = vi.fn()
    render(<Harness onNavigate={onNavigate} onClose={onClose} />)
    const input = screen.getByTestId('mobile-search-input')
    fireEvent.change(input, { target: { value: 'Sales' } })
    const hit = await screen.findByText('Sales')
    fireEvent.click(hit)
    expect(onNavigate).toHaveBeenCalledTimes(1)
    // 結果選択時はオーバーレイも閉じる
    expect(onClose).toHaveBeenCalled()
  })
})
