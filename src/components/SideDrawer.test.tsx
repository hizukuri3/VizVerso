/**
 * @vitest-environment jsdom
 */
import { useState } from 'react'
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

// パラメータ・依存関係リスト・ナビゲーション検証用の拡張フィクスチャ
const docEx: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      caption: 'メインDS',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        {
          column: 'Profit Ratio',
          caption: '[利益率]', // ブラケット付きキャプション（表示時に除去される）
          isCalc: true,
          formula: '[Profit] / [Sales]',
          dataType: 'real',
        },
        {
          column: 'Double Sales',
          isCalc: true,
          formula: '[Sales] * 2',
          dataType: 'real',
        },
        {
          // list ドメインのパラメータ
          column: 'Param List',
          isCalc: false,
          dataType: 'string',
          paramDomainType: 'list',
          value: 'A',
          paramMembers: [{ value: 'A', alias: 'エー' }, { value: 'B' }],
        },
        {
          // range ドメインのパラメータ
          column: 'Param Range',
          isCalc: false,
          dataType: 'integer',
          paramDomainType: 'range',
          value: 5,
          paramRange: { min: '0', max: '10', step: '1' },
        },
      ],
    },
  ],
  worksheets: [
    {
      name: 'Sheet 1',
      caption: 'シート壱',
      dependencies: ['Sales', 'Profit Ratio', 'Param List', 'Param Range'],
      localFields: [],
    },
  ],
  dashboards: [],
}

describe('SideDrawer - パラメータ設定の表示', () => {
  it('list パラメータの現在の値とメンバー一覧が表示されること', () => {
    render(
      <SideDrawer
        isOpen={true}
        onClose={() => {}}
        doc={docEx}
        targetFieldName="Param List"
        onNavigateField={() => {}}
      />,
    )
    // セクション見出しと現在の値
    expect(screen.getByText('パラメータ設定')).toBeInTheDocument()
    expect(screen.getByText('現在の値')).toBeInTheDocument()
    // エイリアス付きメンバーはエイリアスと Value 表記の両方を表示
    expect(screen.getByText('エー')).toBeInTheDocument()
    expect(screen.getByText('Value: A')).toBeInTheDocument()
    // エイリアスなしメンバーは値のみ表示
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('range パラメータの最小値・最大値・ステップが表示されること', () => {
    render(
      <SideDrawer
        isOpen={true}
        onClose={() => {}}
        doc={docEx}
        targetFieldName="Param Range"
        onNavigateField={() => {}}
      />,
    )
    expect(screen.getByText('パラメータ設定')).toBeInTheDocument()
    expect(screen.getByText('最小値')).toBeInTheDocument()
    expect(screen.getByText('最大値')).toBeInTheDocument()
    expect(screen.getByText('ステップ')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    // 現在の値 5
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})

describe('SideDrawer - 依存関係リストと使用シート', () => {
  it('downstream（参照先）リストが表示され、クリックでナビゲーションされること', () => {
    const onNavigateField = vi.fn()
    render(
      <SideDrawer
        isOpen={true}
        onClose={() => {}}
        doc={docEx}
        targetFieldName="Sales"
        onNavigateField={onNavigateField}
      />,
    )
    // Sales を参照する計算フィールドが downstream に並ぶ
    // Profit Ratio はブラケット付きキャプションが除去されて表示される
    expect(screen.getByText('利益率')).toBeInTheDocument()
    const downstreamBtn = screen.getByText('Double Sales')
    fireEvent.click(downstreamBtn)
    expect(onNavigateField).toHaveBeenCalledWith('Double Sales')
  })

  it('upstream（参照元）リストで存在しないフィールドは無効化されること', () => {
    const onNavigateField = vi.fn()
    render(
      <SideDrawer
        isOpen={true}
        onClose={() => {}}
        doc={docEx}
        targetFieldName="Profit Ratio"
        onNavigateField={onNavigateField}
      />,
    )
    // [Profit] はドキュメントに存在しない → 無効ボタン
    const profitBtn = screen.getByText('Profit').closest('button')
    expect(profitBtn).toBeDisabled()
    // [Sales] は存在する → クリックでナビゲーション
    const salesBtn = screen.getByText('Sales').closest('button')
    expect(salesBtn).not.toBeDisabled()
    fireEvent.click(salesBtn!)
    expect(onNavigateField).toHaveBeenCalledWith('Sales')
  })

  it('使用シートリストが表示され、クリックでシートへナビゲーションされること', () => {
    const onNavigateToSheet = vi.fn()
    render(
      <SideDrawer
        isOpen={true}
        onClose={() => {}}
        doc={docEx}
        targetFieldName="Sales"
        onNavigateField={() => {}}
        onNavigateToSheet={onNavigateToSheet}
      />,
    )
    // ワークシートのキャプションが表示される
    const sheetBtn = screen.getByText('シート壱')
    fireEvent.click(sheetBtn)
    expect(onNavigateToSheet).toHaveBeenCalledWith('Sheet 1')
  })

  it('onNavigateToSheet 未指定でもシートボタンのクリックでエラーにならないこと', () => {
    render(
      <SideDrawer
        isOpen={true}
        onClose={() => {}}
        doc={docEx}
        targetFieldName="Sales"
        onNavigateField={() => {}}
      />,
    )
    expect(() => fireEvent.click(screen.getByText('シート壱'))).not.toThrow()
  })

  it('使用シートがない場合はメッセージが表示されること', () => {
    render(
      <SideDrawer
        isOpen={true}
        onClose={() => {}}
        doc={docEx}
        targetFieldName="Double Sales"
        onNavigateField={() => {}}
      />,
    )
    expect(
      screen.getByText('この項目を使用しているシートはありません'),
    ).toBeInTheDocument()
    // downstream もない
    expect(screen.getByText('参照先はありません')).toBeInTheDocument()
  })
})

describe('SideDrawer - ナビゲーション履歴', () => {
  // targetFieldName を state 管理して実際のナビゲーションを再現するラッパー
  function DrawerWithState({ initial }: { initial: string }) {
    const [target, setTarget] = useState<string | null>(initial)
    return (
      <SideDrawer
        isOpen={true}
        onClose={() => {}}
        doc={docEx}
        targetFieldName={target}
        onNavigateField={setTarget}
      />
    )
  }

  it('フィールド名クリックで履歴が積まれ、戻るボタンで戻れること', () => {
    render(<DrawerWithState initial="Sales" />)
    // 初期状態では戻るボタンは表示されない
    expect(screen.queryByTitle('戻る')).not.toBeInTheDocument()

    // downstream の Double Sales へドリルダウン
    fireEvent.click(screen.getByText('Double Sales'))
    // ヘッダーが遷移先のフィールドに変わる
    expect(
      screen.getByRole('heading', { name: 'Double Sales' }),
    ).toBeInTheDocument()

    // 履歴が積まれて戻るボタンが表示される
    const backBtn = screen.getByTitle('戻る')
    fireEvent.click(backBtn)

    // 元のフィールドに戻り、履歴が空になって戻るボタンが消える
    expect(screen.getByRole('heading', { name: 'Sales' })).toBeInTheDocument()
    expect(screen.queryByTitle('戻る')).not.toBeInTheDocument()
  })

  it('isOpen=false の場合は何も描画されないこと', () => {
    const { container } = render(
      <SideDrawer
        isOpen={false}
        onClose={() => {}}
        doc={docEx}
        targetFieldName="Sales"
        onNavigateField={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('背景（オーバーレイ）クリックで onClose が呼ばれること', () => {
    const onClose = vi.fn()
    const { container } = render(
      <SideDrawer
        isOpen={true}
        onClose={onClose}
        doc={docEx}
        targetFieldName="Sales"
        onNavigateField={() => {}}
      />,
    )
    const backdrop = container.querySelector('.drawer-backdrop')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('オーバーレイで Escape キーを押すと onClose が呼ばれること', () => {
    const onClose = vi.fn()
    const { container } = render(
      <SideDrawer
        isOpen={true}
        onClose={onClose}
        doc={docEx}
        targetFieldName="Sales"
        onNavigateField={() => {}}
      />,
    )
    const backdrop = container.querySelector('.drawer-backdrop')
    fireEvent.keyDown(backdrop!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    // 対象外のキーでは呼ばれない
    fireEvent.keyDown(backdrop!, { key: 'Tab' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
