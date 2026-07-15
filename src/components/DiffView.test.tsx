/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DiffView } from './DiffView'
import { diffWorkbooks } from '../utils/workbookDiff'
import type { TableauDocument } from '../types/tableau'
import '@testing-library/jest-dom'

const before: TableauDocument = {
  datasources: [
    {
      name: 'DS',
      caption: 'DS',
      fields: [
        { column: 'Sales' },
        { column: 'Old Field' },
        { column: 'Calc', isCalc: true, formula: '[Sales] + 1' },
      ],
    },
  ],
  worksheets: [{ name: 'Sheet 1', dependencies: ['Sales'] }],
  dashboards: [{ name: 'DB', worksheets: ['Sheet 1'] }],
}

const after: TableauDocument = {
  datasources: [
    {
      name: 'DS',
      caption: 'DS',
      fields: [
        { column: 'Sales' },
        { column: 'New Field' },
        { column: 'Calc', isCalc: true, formula: '[Sales] + 2' },
      ],
    },
  ],
  worksheets: [{ name: 'Sheet 1', dependencies: ['Sales'] }],
  dashboards: [{ name: 'DB', worksheets: ['Sheet 1'] }],
}

describe('DiffView - スモークテスト', () => {
  it('サマリーとフィールドの追加/削除行が表示されること', () => {
    const diff = diffWorkbooks(before, after)
    render(<DiffView diff={diff} beforeName="v1.twbx" afterName="v2.twbx" />)

    // フィールドカテゴリのサマリー: 追加1 / 削除1 / 変更1
    const summary = screen.getByTestId('diff-summary-fields')
    expect(within(summary).getByTestId('count-added')).toHaveTextContent('1')
    expect(within(summary).getByTestId('count-removed')).toHaveTextContent('1')
    expect(within(summary).getByTestId('count-changed')).toHaveTextContent('1')

    // 追加/削除されたフィールドが行として表示される
    expect(screen.getByText('New Field')).toBeInTheDocument()
    expect(screen.getByText('Old Field')).toBeInTheDocument()
  })

  it('変更のないカテゴリには変更なし表示が出ること', () => {
    // 全一致のケース
    const same = diffWorkbooks(before, before)
    render(<DiffView diff={same} />)
    // ワークシート/ダッシュボード/データソースは変更なし
    expect(screen.getAllByText('変更なし').length).toBeGreaterThan(0)
  })
})
