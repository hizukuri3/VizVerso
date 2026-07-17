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

describe('DiffView - 名称変更の見出し格上げ', () => {
  const capBefore: TableauDocument = {
    datasources: [
      { name: 'DS', fields: [{ column: 'Sales', caption: '売上' }] },
    ],
    worksheets: [],
    dashboards: [],
  }
  const capAfter: TableauDocument = {
    datasources: [
      { name: 'DS', fields: [{ column: 'Sales', caption: '売上高' }] },
    ],
    worksheets: [],
    dashboards: [],
  }

  it('caption 変更行が「旧 → 新」見出しと名称変更バッジで表示され、詳細に caption 行が重複しないこと', () => {
    const diff = diffWorkbooks(capBefore, capAfter)
    render(<DiffView diff={diff} />)

    // 名称変更バッジ
    expect(screen.getByText('名称変更')).toBeInTheDocument()
    // 見出しに旧・新の表示名が両方出る
    expect(screen.getByText('売上')).toBeInTheDocument()
    expect(screen.getByText('売上高')).toBeInTheDocument()
    // 詳細の PropertyChange リストに caption 用の「キャプション」ラベルが出ない
    expect(screen.queryByText('キャプション')).not.toBeInTheDocument()
  })
})

describe('DiffView - 計算式のキャプション置換とハイライト', () => {
  const fBefore: TableauDocument = {
    datasources: [
      {
        name: 'DS',
        fields: [
          {
            column: 'Calculation_999',
            caption: '利益率',
            isCalc: true,
            formula: '[Sales] + [Cost]',
          },
          { column: 'Sales', caption: '売上' },
          { column: 'Cost', caption: '原価' },
        ],
      },
    ],
    worksheets: [],
    dashboards: [],
  }
  const fAfter: TableauDocument = {
    datasources: [
      {
        name: 'DS',
        fields: [
          {
            column: 'Calculation_999',
            caption: '利益率',
            isCalc: true,
            formula: '[Sales] - [Cost]',
          },
          { column: 'Sales', caption: '売上' },
          { column: 'Cost', caption: '原価' },
        ],
      },
    ],
    worksheets: [],
    dashboards: [],
  }

  it('計算式内の物理名がキャプションに置換されて表示されること', () => {
    const diff = diffWorkbooks(fBefore, fAfter)
    const fieldMeta = new Map<string, { caption?: string }>([
      ['Sales', { caption: '売上' }],
      ['Cost', { caption: '原価' }],
    ])
    render(<DiffView diff={diff} fieldMeta={fieldMeta} />)

    // 置換後キャプションが本文に現れる（[Sales] ではなく [売上]）
    expect(screen.getAllByText(/売上/).length).toBeGreaterThan(0)
    // 行見出しは Calculation_ を含まない表示名（利益率）
    expect(screen.getByText('利益率')).toBeInTheDocument()
    // 物理名がそのまま画面に出ていないこと
    expect(screen.queryByText(/Calculation_999/)).not.toBeInTheDocument()
  })

  it('式の変更で削除・追加セグメントがそれぞれ強調表示されること', () => {
    const diff = diffWorkbooks(fBefore, fAfter)
    render(<DiffView diff={diff} />)
    // 削除セグメント（+）と追加セグメント（-）が data-diff-seg 属性で描画される
    const removed = document.querySelectorAll('[data-diff-seg="removed"]')
    const added = document.querySelectorAll('[data-diff-seg="added"]')
    expect(removed.length).toBeGreaterThan(0)
    expect(added.length).toBeGreaterThan(0)
    expect(
      Array.from(removed)
        .map((e) => e.textContent)
        .join(''),
    ).toContain('+')
    expect(
      Array.from(added)
        .map((e) => e.textContent)
        .join(''),
    ).toContain('-')
  })
})

describe('DiffView - 影響シートの表示', () => {
  it('再宣言シートがある変更フィールドで影響シート件数が表示されること', () => {
    const mk = (formula: string): TableauDocument => ({
      datasources: [
        {
          name: 'DS',
          fields: [
            {
              column: 'Calc',
              caption: '計算',
              isCalc: true,
              formula,
              datasourceName: 'DS',
            },
          ],
        },
      ],
      worksheets: [
        {
          name: 'S1',
          dependencies: [],
          localFields: [
            { column: 'Calc', caption: '計算', datasourceName: 'DS' },
          ],
        },
        {
          name: 'S2',
          dependencies: [],
          localFields: [
            { column: 'Calc', caption: '計算', datasourceName: 'DS' },
          ],
        },
      ],
      dashboards: [],
    })
    const diff = diffWorkbooks(mk('[A] + 1'), mk('[A] + 2'))
    render(<DiffView diff={diff} />)
    // 「影響シート: 2件」相当の表示
    expect(screen.getByText(/影響シート/)).toBeInTheDocument()
  })
})
