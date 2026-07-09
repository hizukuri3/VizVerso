/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DashboardLayoutMap from './DashboardLayoutMap'
import type { DashboardZone, TableauDocument } from '../types/tableau'
import '@testing-library/jest-dom'

const doc: TableauDocument = {
  datasources: [],
  worksheets: [{ name: 'Sales Map', caption: '売上マップ', dependencies: [] }],
  dashboards: [],
}

const zones: DashboardZone[] = [
  {
    id: '1',
    kind: 'text',
    rawType: 'text',
    x: 0,
    y: 0,
    w: 100000,
    h: 6510,
    title: 'Dashboard Title',
  },
  {
    id: '11',
    name: 'Sales Map',
    kind: 'worksheet',
    x: 0,
    y: 22786,
    w: 20020,
    h: 19531,
    title: 'Sales Map',
  },
  {
    id: '14',
    kind: 'paramctrl',
    rawType: 'paramctrl',
    x: 41504,
    y: 9766,
    w: 17090,
    h: 6510,
    title: 'SELECT REGION',
  },
]

describe('DashboardLayoutMap', () => {
  it('各 zone が配置され、ワークシートはキャプションで表示されること', () => {
    render(<DashboardLayoutMap zones={zones} doc={doc} />)
    expect(screen.getByText('Dashboard Title')).toBeInTheDocument()
    expect(screen.getByText('SELECT REGION')).toBeInTheDocument()
    // ワークシートは doc.worksheets の caption 表示
    expect(screen.getByText('売上マップ')).toBeInTheDocument()
  })

  it('ワークシート zone をクリックすると onNavigate が呼ばれること', () => {
    const onNavigate = vi.fn()
    render(
      <DashboardLayoutMap zones={zones} doc={doc} onNavigate={onNavigate} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /売上マップ/ }))
    expect(onNavigate).toHaveBeenCalledWith('worksheet', 'Sales Map')
  })

  it('zone の絶対座標が % に変換されて適用されること', () => {
    const { container } = render(<DashboardLayoutMap zones={zones} doc={doc} />)
    // paramctrl: x=41504 → 41.504%
    const param = screen
      .getByText('SELECT REGION')
      .closest('[style]') as HTMLElement | null
    expect(param?.style.left).toBe('41.504%')
    expect(container).toBeTruthy()
  })

  it('zones が空でもクラッシュせず空メッセージを表示すること', () => {
    render(<DashboardLayoutMap zones={[]} doc={doc} />)
    // detail.layout_empty（デフォルト言語=ja）
    expect(screen.getByText(/レイアウト情報がありません/)).toBeInTheDocument()
  })
})
