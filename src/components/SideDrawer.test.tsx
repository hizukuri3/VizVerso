/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SideDrawer } from './SideDrawer'
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
        {
          column: 'Orphan Calc',
          isCalc: true,
          formula: '[Sales] * 2',
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

function renderDrawer(targetFieldName: string) {
  return render(
    <SideDrawer
      isOpen={true}
      onClose={() => {}}
      doc={doc}
      targetFieldName={targetFieldName}
      onNavigateField={() => {}}
    />,
  )
}

describe('SideDrawer - 未使用バッジと計算式コピー', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('未使用の計算フィールドには未使用バッジが表示されること', () => {
    renderDrawer('Orphan Calc')
    expect(screen.getByTestId('drawer-unused-badge')).toBeInTheDocument()
  })

  it('使用中のフィールドには未使用バッジが表示されないこと', () => {
    renderDrawer('Profit Ratio')
    expect(screen.queryByTestId('drawer-unused-badge')).not.toBeInTheDocument()
  })

  it('コピーボタンをクリックすると計算式がクリップボードに書き込まれること', async () => {
    renderDrawer('Profit Ratio')
    const btn = screen.getByTestId('copy-formula-button')
    fireEvent.click(btn)
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1)
    })
    const written = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0]
    expect(written).toContain('[Profit]')
    expect(written).toContain('[Sales]')
  })

  it('コピー後にフィードバック（コピーしました）が表示されること', async () => {
    renderDrawer('Profit Ratio')
    fireEvent.click(screen.getByTestId('copy-formula-button'))
    await waitFor(() => {
      expect(screen.getByText('コピーしました')).toBeInTheDocument()
    })
  })
})
