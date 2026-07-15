/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImpactGraphModal } from './ImpactGraphModal'
import type { TableauDocument } from '../types/tableau'
import { t } from '../utils/i18n'
import '@testing-library/jest-dom'

// ────────────────────────────────────────────────────────────
// React Flow モック
//
// jsdom では React Flow 本体（ResizeObserver / DOMMatrix 依存の内部計測）が
// 安定して render できないため、@xyflow/react を軽量スタブに差し替える。
// スタブの ReactFlow は defaultNodes をそのまま nodeTypes['impactCard']
// （= 実物の ImpactCardNode）で描画し、各ノードに onNodeClick / hover
// ハンドラを配線する。これによりカスタムノードの描画分岐・展開/中心化
// ボタン・モーダル側のハンドラ・レイアウト useMemo（layoutNodes）を
// 実際に踏める。onInit を mount 時に呼び focusCamera も通す。
// ────────────────────────────────────────────────────────────
interface MockFlowNode {
  id: string
  type: string
  data: unknown
}
interface ReactFlowMockProps {
  defaultNodes?: MockFlowNode[]
  nodeTypes?: Record<
    string,
    (p: { data: unknown; id: string }) => React.ReactElement | null
  >
  onNodeClick?: (e: unknown, node: MockFlowNode) => void
  onNodeMouseEnter?: (
    e: { clientX: number; clientY: number },
    node: MockFlowNode,
  ) => void
  onNodeMouseLeave?: () => void
  onInit?: () => void
  children?: React.ReactNode
}

vi.mock('@xyflow/react', async () => {
  const React = await import('react')
  const Position = {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  }
  const MarkerType = { ArrowClosed: 'arrowclosed' }
  const BackgroundVariant = { Dots: 'dots' }

  const ReactFlow = (props: ReactFlowMockProps) => {
    const { defaultNodes = [], nodeTypes = {}, onInit } = props
    React.useEffect(() => {
      onInit?.()
      // onInit は mount 時に一度だけ呼ぶ（focusCamera を通すため）
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return React.createElement(
      'div',
      { 'data-testid': 'reactflow-mock' },
      defaultNodes.map((n) => {
        const Comp = nodeTypes[n.type]
        return React.createElement(
          'div',
          {
            key: n.id,
            'data-testid': `rf-node-${n.id}`,
            onClick: (e: unknown) => props.onNodeClick?.(e, n),
            onMouseEnter: (e: { clientX: number; clientY: number }) =>
              props.onNodeMouseEnter?.(e, n),
            onMouseLeave: () => props.onNodeMouseLeave?.(),
          },
          Comp ? React.createElement(Comp, { data: n.data, id: n.id }) : null,
        )
      }),
      props.children,
    )
  }

  const passthrough =
    (testid: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': testid }, children)

  const useReactFlow = () => ({
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    fitView: vi.fn(() => Promise.resolve()),
    setCenter: vi.fn(() => Promise.resolve()),
    getNodes: vi.fn(() => []),
  })

  return {
    ReactFlow,
    ReactFlowProvider: passthrough('rf-provider'),
    useReactFlow,
    Background: passthrough('rf-background'),
    Controls: passthrough('rf-controls'),
    MiniMap: passthrough('rf-minimap'),
    Handle: () => React.createElement('div', { 'data-testid': 'rf-handle' }),
    Position,
    MarkerType,
    BackgroundVariant,
  }
})

// ────────────────────────────────────────────────────────────
// フィクスチャ
// Sales(生) → B → A の下流チェーン、LOD 計算、パラメータ、シート・
// ダッシュボードを含む。field ルートで上流・下流・シート・ダッシュ・
// パラメータの全ノード種別が現れる。
// ────────────────────────────────────────────────────────────
const doc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        { column: 'Profit', isCalc: false, dataType: 'real' },
        { column: 'B', isCalc: true, formula: '[Sales] + 1' },
        { column: 'A', isCalc: true, formula: '[B] * 2' },
        {
          column: 'Lod',
          isCalc: true,
          formula: '{ FIXED [Region] : SUM([Sales]) }',
        },
        {
          column: 'Param1',
          isCalc: true,
          formula: '[B]',
          paramDomainType: 'list',
          value: 'High',
        },
        { column: 'Region', isCalc: false, dataType: 'string' },
      ],
    },
  ],
  worksheets: [
    { name: 'SheetA', caption: 'シートA', dependencies: ['[A]'] },
    { name: 'SheetSales', dependencies: ['[Sales]', '[Profit]'] },
  ],
  dashboards: [
    { name: 'Dash1', worksheets: ['SheetA'], usedFields: [] },
    { name: 'DashParam', worksheets: [], usedFields: ['[Param1]'] },
  ],
}

// 集約 group ノードを発生させるフィクスチャ。
// BigSheet は生フィールド R1..R10（10 > 閾値 8）を使い、sheet ルートで
// 上流（column -1）が集約されて group ノードになる。
const rawFieldNames = Array.from({ length: 10 }, (_, i) => `R${i + 1}`)
const groupDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: rawFieldNames.map((name) => ({
        column: name,
        isCalc: false,
        dataType: 'real',
      })),
    },
  ],
  worksheets: [
    { name: 'BigSheet', dependencies: rawFieldNames.map((n) => `[${n}]`) },
  ],
  dashboards: [],
}

// truncated（ノード数上限超過）を発生させるフィクスチャ。
// 220 個の生フィールドを 1 シートで使い、GRAPH_MAX_FIELD_NODES(200) を超える。
const manyFieldNames = Array.from({ length: 220 }, (_, i) => `M${i + 1}`)
const truncatedDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: manyFieldNames.map((name) => ({
        column: name,
        isCalc: false,
        dataType: 'real',
      })),
    },
  ],
  worksheets: [
    { name: 'HugeSheet', dependencies: manyFieldNames.map((n) => `[${n}]`) },
  ],
  dashboards: [],
}

// パラメータを上流展開で出現させるフィクスチャ。
// SheetP は計算 Q=[P]+1 を棚に置く。P はパラメータ。
// sheet ルートで Q（column -1）を上流展開すると P（column -2）が新列の
// パラメータとして現れ、差分レイアウトのパラメータレーン分岐を通る。
const paramExpandDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        {
          column: 'P',
          isCalc: true,
          paramDomainType: 'list',
          value: 'High',
        },
        { column: 'Q', isCalc: true, formula: '[P] + 1' },
      ],
    },
  ],
  worksheets: [{ name: 'SheetP', dependencies: ['[Q]'] }],
  dashboards: [],
}

// 未解決フィールド（定義が見つからない依存）を含むフィクスチャ。
// SheetGhost は未定義フィールド Ghost を棚に置く → 未解決ノードになる。
const unresolvedDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [{ column: 'Sales', isCalc: false, dataType: 'real' }],
    },
  ],
  worksheets: [{ name: 'SheetGhost', dependencies: ['[Ghost]', '[Sales]'] }],
  dashboards: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ImpactGraphModal (field ルート)', () => {
  it('ルート・上流・下流・シート・ダッシュボード・パラメータの各ノードを描画すること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    // ルート B（キャンバス上のノード）
    expect(screen.getByTestId('rf-node-f:B')).toBeInTheDocument()
    // 上流 Sales（生フィールド, column<0）
    expect(screen.getByTestId('rf-node-f:Sales')).toBeInTheDocument()
    // 下流 A / Param1（B を参照する計算・パラメータ）
    expect(screen.getByTestId('rf-node-f:A')).toBeInTheDocument()
    expect(screen.getByTestId('rf-node-f:Param1')).toBeInTheDocument()
    // シート・ダッシュボード
    expect(screen.getByTestId('rf-node-s:SheetA')).toBeInTheDocument()
    expect(screen.getByTestId('rf-node-d:Dash1')).toBeInTheDocument()
    // パラメータバッジがキャンバスノード内に出る
    const paramNode = screen.getByTestId('rf-node-f:Param1')
    expect(
      within(paramNode).getByText(t('graph.parameter')),
    ).toBeInTheDocument()
  })

  it('ヘッダーに中心オブジェクト名と種別ラベルを表示すること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'B' }),
    ).toBeInTheDocument()
  })

  it('サマリパネルに上流・下流・シート・ダッシュボードの各行が出ること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    // 見出し文言は凡例（ヘッダー）とパネルの両方に出るため getAllByText で存在確認する
    expect(screen.getAllByText(t('graph.upstream')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(t('graph.downstream')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(t('graph.sheets')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(t('graph.dashboards')).length).toBeGreaterThan(0)
  })
})

describe('ImpactGraphModal ヘッダー操作', () => {
  it('閉じるボタンで onClose が呼ばれること', () => {
    const onClose = vi.fn()
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByTitle(t('graph.close')))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape キーで onClose が呼ばれること', () => {
    const onClose = vi.fn()
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('onOpenObject 指定時は「詳細を開く」ボタンで現在ルートを渡すこと', () => {
    const onOpenObject = vi.fn()
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
        onOpenObject={onOpenObject}
      />,
    )
    fireEvent.click(screen.getByTestId('graph-open-detail'))
    expect(onOpenObject).toHaveBeenCalledWith({ kind: 'field', name: 'B' })
  })

  it('onOpenObject 未指定時は「詳細を開く」ボタンを出さないこと', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('graph-open-detail')).not.toBeInTheDocument()
  })

  it('「整列」ボタンでエラーなく再レイアウトが走ること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('graph-relayout'))
    // 再描画後もルートノードが残っている
    expect(screen.getByTestId('rf-node-f:B')).toBeInTheDocument()
  })
})

describe('ImpactGraphModal 全展開', () => {
  it('「全展開」ボタンで展開バッジ（+N）が消えること', () => {
    // sheet ルートは近傍のみ初期表示し、奥の計算チェーンは +N 展開で到達する。
    // SheetA は [A] を棚に置く。A=[B]*2、B=[Sales]+1 の上流チェーンが順に展開可能。
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'sheet', name: 'SheetA' }}
        onClose={vi.fn()}
      />,
    )
    // 展開前は展開ボタン（node-expand-*）が少なくとも 1 つある
    const before = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('data-testid')?.startsWith('node-expand-'))
    expect(before.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByTestId('graph-expand-all'))

    // 全展開後は「+N（未展開）」の展開ボタンが消える。
    // 残るのは展開済みノードの折りたたみ（−）ボタンのみ。
    const plusButtons = screen
      .getAllByRole('button')
      .filter(
        (b) =>
          b.getAttribute('data-testid')?.startsWith('node-expand-') &&
          b.textContent?.startsWith('+'),
      )
    expect(plusButtons.length).toBe(0)
  })
})

describe('ImpactGraphModal ノード操作', () => {
  it('展開ボタンで隣接ノードが増え、折りたたみで元に戻ること', () => {
    // SheetA ルート: 棚の A が初期表示。A の上流 B は未表示（A に +1 バッジ）。
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'sheet', name: 'SheetA' }}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('rf-node-f:B')).not.toBeInTheDocument()
    // A の展開ボタンを押すと B が現れる
    fireEvent.click(screen.getByTestId('node-expand-f:A'))
    expect(screen.getByTestId('rf-node-f:B')).toBeInTheDocument()
    // 折りたたみで B が消える
    fireEvent.click(screen.getByTestId('node-expand-f:A'))
    expect(screen.queryByTestId('rf-node-f:B')).not.toBeInTheDocument()
  })

  it('ノード本体クリックでも展開/折りたたみが切り替わること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'sheet', name: 'SheetA' }}
        onClose={vi.fn()}
      />,
    )
    // A ノード本体をクリック → 展開 → B が現れる
    fireEvent.click(screen.getByTestId('rf-node-f:A'))
    expect(screen.getByTestId('rf-node-f:B')).toBeInTheDocument()
  })

  it('◎（中心に表示）で中心が切り替わり、戻るボタンで元に戻ること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    // 初期は戻るボタンなし
    expect(screen.queryByTestId('graph-back-button')).not.toBeInTheDocument()
    // A を中心化
    act(() => {
      fireEvent.click(screen.getByTestId('node-center-f:A'))
    })
    expect(
      screen.getByRole('heading', { level: 2, name: 'A' }),
    ).toBeInTheDocument()
    // 戻るボタンが現れ、押すと B に戻る
    const back = screen.getByTestId('graph-back-button')
    act(() => {
      fireEvent.click(back)
    })
    expect(
      screen.getByRole('heading', { level: 2, name: 'B' }),
    ).toBeInTheDocument()
  })

  it('サマリパネルの行クリックで中心が切り替わること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    // パネルの上流セクションに Sales 行がある（ボタン）。クリックで中心化。
    const salesRows = screen.getAllByText('Sales')
    // パネル行（button 内）を選ぶ
    const panelBtn = salesRows
      .map((el) => el.closest('button'))
      .find((b): b is HTMLButtonElement => !!b)
    expect(panelBtn).toBeTruthy()
    act(() => {
      fireEvent.click(panelBtn!)
    })
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sales' }),
    ).toBeInTheDocument()
  })
})

describe('ImpactGraphModal ホバーカード', () => {
  it('計算フィールドにホバーすると計算式ツールチップが出ること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'Sales' }}
        onClose={vi.fn()}
      />,
    )
    // B は計算フィールド（[Sales] + 1）
    fireEvent.mouseEnter(screen.getByTestId('rf-node-f:B'), {
      clientX: 10,
      clientY: 10,
    })
    const tip = screen.getByTestId('graph-node-tooltip')
    expect(within(tip).getByText(t('drawer.formula'))).toBeInTheDocument()
    // マウスリーブで消える
    fireEvent.mouseLeave(screen.getByTestId('rf-node-f:B'))
    expect(screen.queryByTestId('graph-node-tooltip')).not.toBeInTheDocument()
  })

  it('パラメータにホバーすると現在値ツールチップが出ること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    fireEvent.mouseEnter(screen.getByTestId('rf-node-f:Param1'), {
      clientX: 10,
      clientY: 10,
    })
    const tip = screen.getByTestId('graph-node-tooltip')
    expect(within(tip).getByText(t('detail.current_value'))).toBeInTheDocument()
    expect(within(tip).getByText('High')).toBeInTheDocument()
  })
})

describe('ImpactGraphModal group ノード', () => {
  it('sheet ルートで集約 group ノードが描画され、クリックで展開されること', () => {
    render(
      <ImpactGraphModal
        doc={groupDoc}
        root={{ kind: 'sheet', name: 'BigSheet' }}
        onClose={vi.fn()}
      />,
    )
    // group ノードが少なくとも 1 つ描画される（rf-node-g:*）
    const groupNode = screen.getAllByTestId(/^rf-node-g:/).find((el) => el)
    expect(groupNode).toBeTruthy()
    // group ラベル（「N 件のフィールド」）が出る
    expect(screen.getAllByText(/件のフィールド/).length).toBeGreaterThan(0)

    // group ノード本体をクリックすると展開され、個別の生フィールドが現れる
    const rawBefore = screen.queryAllByTestId(/^rf-node-f:R/).length
    act(() => {
      fireEvent.click(groupNode!)
    })
    const rawAfter = screen.queryAllByTestId(/^rf-node-f:R/).length
    expect(rawAfter).toBeGreaterThan(rawBefore)
  })

  it('group ノードにホバーするとメンバー一覧ツールチップが出ること', () => {
    render(
      <ImpactGraphModal
        doc={groupDoc}
        root={{ kind: 'sheet', name: 'BigSheet' }}
        onClose={vi.fn()}
      />,
    )
    const groupNode = screen.getAllByTestId(/^rf-node-g:/)[0]
    fireEvent.mouseEnter(groupNode, { clientX: 10, clientY: 10 })
    const tip = screen.getByTestId('graph-node-tooltip')
    // メンバー数見出し（「N 件のフィールド」）
    expect(within(tip).getAllByText(/件のフィールド/).length).toBeGreaterThan(0)
  })
})

describe('ImpactGraphModal 差分レイアウト（パラメータ出現）', () => {
  it('上流展開でパラメータが新列に現れても崩れず描画されること', () => {
    render(
      <ImpactGraphModal
        doc={paramExpandDoc}
        root={{ kind: 'sheet', name: 'SheetP' }}
        onClose={vi.fn()}
      />,
    )
    // 初期表示に P は無い（Q のみ）
    expect(screen.queryByTestId('rf-node-f:P')).not.toBeInTheDocument()
    // Q を展開 → 差分レイアウトが走り、パラメータ P が新列レーンに現れる
    fireEvent.click(screen.getByTestId('node-expand-f:Q'))
    const paramNode = screen.getByTestId('rf-node-f:P')
    expect(
      within(paramNode).getByText(t('graph.parameter')),
    ).toBeInTheDocument()
    // 折りたたみ → 再度差分レイアウトで P が消える
    fireEvent.click(screen.getByTestId('node-expand-f:Q'))
    expect(screen.queryByTestId('rf-node-f:P')).not.toBeInTheDocument()
  })
})

describe('ImpactGraphModal ホバーカード（実体ノード）', () => {
  it('シート/ダッシュボードノードにホバーすると種別ラベルのツールチップが出ること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    // シートノード
    fireEvent.mouseEnter(screen.getByTestId('rf-node-s:SheetA'), {
      clientX: 5,
      clientY: 5,
    })
    let tip = screen.getByTestId('graph-node-tooltip')
    expect(within(tip).getAllByText(t('graph.sheets')).length).toBeGreaterThan(
      0,
    )
    fireEvent.mouseLeave(screen.getByTestId('rf-node-s:SheetA'))

    // ダッシュボードノード
    fireEvent.mouseEnter(screen.getByTestId('rf-node-d:Dash1'), {
      clientX: 5,
      clientY: 5,
    })
    tip = screen.getByTestId('graph-node-tooltip')
    expect(
      within(tip).getAllByText(t('graph.dashboards')).length,
    ).toBeGreaterThan(0)
  })
})

describe('ImpactGraphModal ホバーカード（バッジ分岐）', () => {
  it('LOD 計算フィールドはノードにもツールチップにも LOD バッジを出すこと', () => {
    // Sales ルートでは Lod（{ FIXED ... }）が下流に現れる
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'Sales' }}
        onClose={vi.fn()}
      />,
    )
    const lodNode = screen.getByTestId('rf-node-f:Lod')
    // ノードカードの LOD バッジ
    expect(within(lodNode).getByText(t('calctype.lod'))).toBeInTheDocument()
    // ホバーでツールチップにも LOD バッジ
    fireEvent.mouseEnter(lodNode, { clientX: 5, clientY: 5 })
    const tip = screen.getByTestId('graph-node-tooltip')
    expect(within(tip).getByText(t('calctype.lod'))).toBeInTheDocument()
  })

  it('生フィールドにホバーするとデータ型バッジを出すこと', () => {
    // B ルートの上流 Sales は生フィールド（dataType: real）
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    fireEvent.mouseEnter(screen.getByTestId('rf-node-f:Sales'), {
      clientX: 5,
      clientY: 5,
    })
    const tip = screen.getByTestId('graph-node-tooltip')
    expect(within(tip).getByText('real')).toBeInTheDocument()
  })
})

describe('ImpactGraphModal ルートノードクリック', () => {
  it('ルートノード本体クリックは中心を変えない（no-op）こと', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'B' }}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('rf-node-f:B'))
    // 中心は B のまま、戻るボタンも出ない
    expect(
      screen.getByRole('heading', { level: 2, name: 'B' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('graph-back-button')).not.toBeInTheDocument()
  })
})

describe('ImpactGraphModal 未解決ノード', () => {
  it('未解決フィールドは描画され、クリックしても中心が変わらないこと', () => {
    render(
      <ImpactGraphModal
        doc={unresolvedDoc}
        root={{ kind: 'sheet', name: 'SheetGhost' }}
        onClose={vi.fn()}
      />,
    )
    const ghost = screen.getByTestId('rf-node-f:Ghost')
    expect(ghost).toBeInTheDocument()
    // 未解決ノードには中心化ボタンも展開ボタンも出ない
    expect(screen.queryByTestId('node-center-f:Ghost')).not.toBeInTheDocument()
    expect(screen.queryByTestId('node-expand-f:Ghost')).not.toBeInTheDocument()
    // クリックしても no-op（中心はシートのまま）
    fireEvent.click(ghost)
    expect(
      screen.getByRole('heading', { level: 2, name: 'SheetGhost' }),
    ).toBeInTheDocument()
  })
})

describe('ImpactGraphModal truncated', () => {
  it('ノード数上限を超える doc では省略警告を出すこと', () => {
    render(
      <ImpactGraphModal
        doc={truncatedDoc}
        root={{ kind: 'sheet', name: 'HugeSheet' }}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(t('graph.truncated'))).toBeInTheDocument()
  })
})

describe('ImpactGraphModal dashboard ルート', () => {
  it('dashboard ルートでヘッダーにダッシュボード名を表示すること', () => {
    render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'dashboard', name: 'Dash1' }}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Dash1' }),
    ).toBeInTheDocument()
  })

  it('解決できないルートでは何も描画しない（null）こと', () => {
    const { container } = render(
      <ImpactGraphModal
        doc={doc}
        root={{ kind: 'field', name: 'Nonexistent' }}
        onClose={vi.fn()}
      />,
    )
    // モーダルのルート要素が描画されない
    expect(container.querySelector('.impact-modal')).toBeNull()
  })
})
