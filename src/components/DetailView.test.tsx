/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DetailView from './DetailView'
import type { TableauDocument, WorksheetPane } from '../types/tableau'
import '@testing-library/jest-dom'

// 空エンコーディングを埋めるためのヘルパー
const emptyEncodings = (): WorksheetPane['encodings'] => ({
  color: [],
  size: [],
  label: [],
  detail: [],
  tooltip: [],
  shape: [],
})

// ─────────────────────────────────────────
// ワークシート密度改善用フィクスチャ
// 列: Category / 行: 空 / フィルタ: Sales
// マーク: 色のみ Category、他エンコーディングは空
// ─────────────────────────────────────────
const worksheetDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        { column: 'Category', isCalc: false, dataType: 'string' },
      ],
    },
  ],
  worksheets: [
    {
      name: 'Sheet 1',
      caption: 'シート1',
      dependencies: ['Sales', 'Category'],
      datasourceNames: ['ds1'],
      localFields: [],
      shelf: {
        cols: [{ name: 'Category', isContinuous: false }],
        rows: [], // 空棚 → （なし）がインライン表示されるべき
        filters: [{ name: 'Sales', isContinuous: true }],
        panes: [
          {
            markType: 'bar',
            encodings: {
              ...emptyEncodings(),
              color: [{ name: 'Category', isContinuous: false }],
            },
          },
        ],
        marks: {
          markType: 'bar',
          encodings: {
            ...emptyEncodings(),
            color: [{ name: 'Category', isContinuous: false }],
          },
        },
      },
    },
  ],
  dashboards: [],
}

// ─────────────────────────────────────────
// データソース計算式リスト用フィクスチャ
// LOD / 表計算 / 通常 の3種を含む
// ─────────────────────────────────────────
const datasourceDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      caption: 'DS1',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        {
          column: 'LOD Field',
          caption: 'LODフィールド',
          isCalc: true,
          formula: '{ FIXED [Category] : SUM([Sales]) }',
          dataType: 'real',
        },
        {
          column: 'Running Field',
          caption: 'ランニング合計',
          isCalc: true,
          formula: 'RUNNING_SUM(SUM([Sales]))',
          dataType: 'real',
        },
        {
          column: 'Double Field',
          caption: '倍売上',
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
      dependencies: ['Sales', 'LOD Field'],
      localFields: [],
    },
  ],
  dashboards: [],
}

describe('DetailView - ワークシート密度改善', () => {
  it('空の棚（行）には（なし）がインライン表示されること', () => {
    render(
      <DetailView
        doc={worksheetDoc}
        selectedId="Sheet 1"
        selectedType="worksheet"
      />,
    )
    // 行棚は空なので（なし）が1つだけ表示される（列・フィルタは非空）
    const nones = screen.getAllByText('（なし）')
    expect(nones).toHaveLength(1)
  })

  it('フィールドが無いエンコーディング行（サイズ等）は表示されないこと', () => {
    render(
      <DetailView
        doc={worksheetDoc}
        selectedId="Sheet 1"
        selectedType="worksheet"
      />,
    )
    // 色エンコーディングは存在するのでラベルが出る
    expect(screen.getByText('色')).toBeInTheDocument()
    // サイズは空なので非表示
    expect(screen.queryByText('サイズ')).not.toBeInTheDocument()
  })
})

describe('DetailView - データソース計算式リストビュー', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('デフォルトはリスト表示で、各計算式ごとにコピーボタンが表示されること', () => {
    render(
      <DetailView
        doc={datasourceDoc}
        selectedId="ds1"
        selectedType="datasource"
      />,
    )
    // 計算フィールドは3つ → コピーボタンも3つ
    expect(screen.getAllByTestId('copy-formula-button')).toHaveLength(3)
  })

  it('計算式の種別バッジ（LOD・表計算・通常）が表示されること', () => {
    render(
      <DetailView
        doc={datasourceDoc}
        selectedId="ds1"
        selectedType="datasource"
      />,
    )
    expect(screen.getByText('LOD表現')).toBeInTheDocument()
    expect(screen.getByText('表計算')).toBeInTheDocument()
    expect(screen.getByText('通常')).toBeInTheDocument()
  })

  it('コピーボタンをクリックすると整形済み計算式がクリップボードに書き込まれること', async () => {
    render(
      <DetailView
        doc={datasourceDoc}
        selectedId="ds1"
        selectedType="datasource"
      />,
    )
    const buttons = screen.getAllByTestId('copy-formula-button')
    fireEvent.click(buttons[0])
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1)
  })

  it('ピル表示トグルでピル表示に切り替わり、コピーボタンが消えること', () => {
    render(
      <DetailView
        doc={datasourceDoc}
        selectedId="ds1"
        selectedType="datasource"
      />,
    )
    // 初期はリスト表示なのでコピーボタンあり
    expect(screen.getAllByTestId('copy-formula-button')).toHaveLength(3)
    // ピル表示へ切替
    fireEvent.click(screen.getByText('ピル表示'))
    expect(screen.queryByTestId('copy-formula-button')).not.toBeInTheDocument()
  })

  it('計算式名クリックで onOpenDrawer が呼ばれること', () => {
    const onOpenDrawer = vi.fn()
    render(
      <DetailView
        doc={datasourceDoc}
        selectedId="ds1"
        selectedType="datasource"
        onOpenDrawer={onOpenDrawer}
      />,
    )
    fireEvent.click(screen.getByText('LODフィールド'))
    expect(onOpenDrawer).toHaveBeenCalledWith('LOD Field')
  })
})
