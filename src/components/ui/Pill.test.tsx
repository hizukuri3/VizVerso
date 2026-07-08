/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { Pill, SyntaxHighlightedFormula } from './Pill'

// nav.datasources キーを 'Parameters' に固定するモック。
// SyntaxHighlightedFormula 内の tokenRegex は [Parameters]/[パラメーター] という
// リテラルでのみパラメータ参照トークンを切り出すため、実際の翻訳（データソース）では
// パラメータ参照の紫色ハイライト分岐に到達できない。この分岐を確認する目的で
// nav.datasources のみ上書きし、他のキーは実際の翻訳にフォールバックする
// （プロダクトコードは変更しない）。
vi.mock('../../utils/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/i18n')>()
  return {
    ...actual,
    t: (key: string, params?: Record<string, string | number>) =>
      key === 'nav.datasources' ? 'Parameters' : actual.t(key as never, params),
  }
})

describe('Pill - データ型アイコン分岐', () => {
  it('dataType が string の場合は Abc アイコンが表示されること', () => {
    render(<Pill name="StringField" dataType="string" />)
    expect(screen.getByText('Abc')).toBeInTheDocument()
  })

  it('dataType が integer の場合は # アイコンが表示されること', () => {
    render(<Pill name="IntField" dataType="integer" />)
    expect(screen.getByText('#')).toBeInTheDocument()
  })

  it('dataType が real の場合は # アイコンが表示されること', () => {
    render(<Pill name="RealField" dataType="real" />)
    expect(screen.getByText('#')).toBeInTheDocument()
  })

  it('dataType が date の場合はカレンダーアイコン（svg rect）が表示されること', () => {
    const { container } = render(<Pill name="DateField" dataType="date" />)
    expect(container.querySelector('svg rect')).toBeInTheDocument()
  })

  it('dataType が datetime の場合もカレンダーアイコン（svg rect）が表示されること', () => {
    const { container } = render(
      <Pill name="DatetimeField" dataType="datetime" />,
    )
    expect(container.querySelector('svg rect')).toBeInTheDocument()
  })

  it('dataType が boolean の場合は T|F アイコンが表示されること', () => {
    render(<Pill name="BoolField" dataType="boolean" />)
    expect(screen.getByText('T|F')).toBeInTheDocument()
  })

  it('dataType が spatial の場合は地球アイコン（svg circle+path）が表示されること', () => {
    const { container } = render(
      <Pill name="SpatialField" dataType="spatial" />,
    )
    expect(container.querySelector('svg circle')).toBeInTheDocument()
    expect(container.querySelector('svg path')).toBeInTheDocument()
  })

  it('dataType 未指定かつ isContinuous=false の場合は Abc アイコンにフォールバックすること', () => {
    render(<Pill name="UnknownField" />)
    expect(screen.getByText('Abc')).toBeInTheDocument()
  })

  it('dataType 未指定かつ isContinuous=true の場合は # アイコンにフォールバックすること', () => {
    render(<Pill name="ContinuousField" isContinuous />)
    expect(screen.getByText('#')).toBeInTheDocument()
  })

  it('dataType が大文字混じりでも小文字化して判定されること', () => {
    render(<Pill name="MixedCaseField" dataType="STRING" />)
    expect(screen.getByText('Abc')).toBeInTheDocument()
  })
})

describe('Pill - 計算式・見た目・状態のスタイル分岐', () => {
  it('isCalc=true の場合は "=" が表示されること', () => {
    render(<Pill name="CalcField" isCalc />)
    expect(screen.getByText('=')).toBeInTheDocument()
  })

  it('isCalc 未指定の場合は "=" が表示されないこと', () => {
    render(<Pill name="PlainField" />)
    expect(screen.queryByText('=')).not.toBeInTheDocument()
  })

  it('isContinuous=true の場合は背景色が緑系（#10b981）になること', () => {
    const { container } = render(<Pill name="ContField" isContinuous />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    expect(pill.style.backgroundColor).toBe('rgb(16, 185, 129)')
  })

  it('isContinuous=false（既定）の場合は背景色が青系（#0284c7）になること', () => {
    const { container } = render(<Pill name="DiscField" />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    expect(pill.style.backgroundColor).toBe('rgb(2, 132, 199)')
  })

  it('isUnused=true の場合は未使用バッジが表示されること', () => {
    render(<Pill name="UnusedField" isUnused />)
    expect(screen.getByTestId('unused-badge')).toBeInTheDocument()
  })

  it('isUnused 未指定の場合は未使用バッジが表示されないこと', () => {
    render(<Pill name="UsedField" />)
    expect(screen.queryByTestId('unused-badge')).not.toBeInTheDocument()
  })

  it('isActive=true の場合はハイライト用クラス（ring-4）が付与されること', () => {
    const { container } = render(<Pill name="ActiveField" isActive />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    expect(pill.className).toContain('ring-4')
  })

  it('isActive 未指定の場合はハイライト用クラスが付与されないこと', () => {
    const { container } = render(<Pill name="InactiveField" />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    expect(pill.className).not.toContain('ring-4')
  })

  it('onClick 指定時は role=button・tabIndex=0 が設定されクリックで呼ばれること', () => {
    const onClick = vi.fn()
    const { container } = render(
      <Pill name="ClickableField" onClick={onClick} />,
    )
    const pill = container.querySelector('.pill-container') as HTMLElement
    expect(pill).toHaveAttribute('role', 'button')
    expect(pill).toHaveAttribute('tabIndex', '0')

    fireEvent.click(pill)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('onClick 未指定時は role・tabIndex が設定されないこと', () => {
    const { container } = render(<Pill name="NonClickableField" />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    expect(pill).not.toHaveAttribute('role')
    expect(pill).not.toHaveAttribute('tabIndex')
  })

  it('onClick 指定時に Enter キーで onClick が呼ばれること', () => {
    const onClick = vi.fn()
    const { container } = render(<Pill name="KeyField" onClick={onClick} />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    fireEvent.keyDown(pill, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('onClick 指定時にスペースキーで onClick が呼ばれること', () => {
    const onClick = vi.fn()
    const { container } = render(<Pill name="KeyField2" onClick={onClick} />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    fireEvent.keyDown(pill, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('onClick 指定時に Enter/スペース以外のキーでは onClick が呼ばれないこと', () => {
    const onClick = vi.fn()
    const { container } = render(<Pill name="KeyField3" onClick={onClick} />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    fireEvent.keyDown(pill, { key: 'a' })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('onClick 未指定時にキー押下してもエラーにならないこと', () => {
    const { container } = render(<Pill name="KeyField4" />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    expect(() => fireEvent.keyDown(pill, { key: 'Enter' })).not.toThrow()
  })

  it('caption が指定された場合は caption が表示され、name は表示されないこと', () => {
    render(<Pill name="PhysicalName" caption="表示名" />)
    expect(screen.getByText('表示名')).toBeInTheDocument()
    expect(screen.queryByText('PhysicalName')).not.toBeInTheDocument()
  })
})

describe('Pill - ホバー時のツールチップ表示', () => {
  it('マウスオーバーで計算式がある場合はシンタックスハイライトされた計算式がツールチップに表示されること', () => {
    const { container } = render(
      <Pill name="Calc1" caption="計算1" formula="[Sales] * 2" isCalc />,
    )
    const pill = container.querySelector('.pill-container') as HTMLElement
    fireEvent.mouseEnter(pill)

    // ツールチップは document.body に portal されるため、portal コンテナに絞って検索する
    const tooltip = document.body.querySelector(
      '.fixed.z-\\[9999\\]',
    ) as HTMLElement
    expect(tooltip).toBeInTheDocument()
    expect(within(tooltip).getByText('計算1')).toBeInTheDocument()
    expect(within(tooltip).getByText(/Sales/)).toBeInTheDocument()
  })

  it('マウスオーバーで計算式がない場合は物理名がツールチップに表示されること', () => {
    const { container } = render(<Pill name="RawField" />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    fireEvent.mouseEnter(pill)

    const tooltip = document.body.querySelector(
      '.fixed.z-\\[9999\\]',
    ) as HTMLElement
    expect(tooltip).toBeInTheDocument()
    expect(within(tooltip).getByText(/物理名/)).toBeInTheDocument()
    // タイトル（キャプション代わりの name）と物理名表示の2箇所に RawField が出現する
    expect(within(tooltip).getAllByText(/RawField/).length).toBe(2)
  })

  it('マウスリーブでツールチップが非表示になること', () => {
    const { container } = render(<Pill name="HoverField" />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    fireEvent.mouseEnter(pill)
    expect(
      document.body.querySelector('.fixed.z-\\[9999\\]'),
    ).toBeInTheDocument()

    fireEvent.mouseLeave(pill)
    expect(
      document.body.querySelector('.fixed.z-\\[9999\\]'),
    ).not.toBeInTheDocument()
  })

  it('アンカーの上方に十分な余白がある場合はツールチップが上側に配置されること（isBelow=false）', () => {
    const { container } = render(<Pill name="TopField" />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    // top が十分大きく、上に表示しても画面上端(10px)を割らないケース
    vi.spyOn(pill, 'getBoundingClientRect').mockReturnValue({
      top: 500,
      bottom: 520,
      left: 100,
      right: 200,
      width: 100,
      height: 20,
      x: 100,
      y: 500,
      toJSON: () => '',
    } as DOMRect)

    fireEvent.mouseEnter(pill)
    expect(
      document.body.querySelector('.fixed.z-\\[9999\\]'),
    ).toBeInTheDocument()
  })

  it('ビューポート高さが極端に小さい場合、下方向配置でも下端に収まるよう補正されること', () => {
    const originalHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', {
      value: 5,
      configurable: true,
    })

    try {
      const { container } = render(<Pill name="TinyViewportField" />)
      const pill = container.querySelector('.pill-container') as HTMLElement
      fireEvent.mouseEnter(pill)
      expect(
        document.body.querySelector('.fixed.z-\\[9999\\]'),
      ).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerHeight', {
        value: originalHeight,
        configurable: true,
      })
    }
  })

  it('アンカーが画面右端付近にある場合、ツールチップの左位置が画面内に収まるよう補正されること', () => {
    const { container } = render(<Pill name="RightEdgeField" />)
    const pill = container.querySelector('.pill-container') as HTMLElement
    // left が画面幅を超えるほど大きいケース（右端補正・左端未満補正の両方を確認）
    vi.spyOn(pill, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 20,
      left: 2000,
      right: 2100,
      width: 100,
      height: 20,
      x: 2000,
      y: 0,
      toJSON: () => '',
    } as DOMRect)

    fireEvent.mouseEnter(pill)
    expect(
      document.body.querySelector('.fixed.z-\\[9999\\]'),
    ).toBeInTheDocument()
  })
})

describe('SyntaxHighlightedFormula - 計算式のシンタックスハイライト', () => {
  it('formula が空文字の場合は何も描画されないこと', () => {
    const { container } = render(<SyntaxHighlightedFormula formula="" />)
    expect(container.firstChild).toBeNull()
  })

  it('フィールド参照 [X] はオレンジ色でハイライトされること', () => {
    const { container } = render(<SyntaxHighlightedFormula formula="[Sales]" />)
    const span = container.querySelector('.text-orange-400')
    expect(span).toHaveTextContent('[Sales]')
  })

  it('[Parameters].[X] 形式のパラメータ参照は紫色でハイライトされること', () => {
    const { container } = render(
      <SyntaxHighlightedFormula formula="[Parameters].[Target]" />,
    )
    const span = container.querySelector('.text-purple-500')
    expect(span).toHaveTextContent('[Parameters].[Target]')
  })

  it('ダブルクォート文字列リテラルはグレーでハイライトされること', () => {
    const { container } = render(
      <SyntaxHighlightedFormula formula='"Hello World"' />,
    )
    const span = container.querySelector('.text-slate-400')
    expect(span).toHaveTextContent('"Hello World"')
  })

  it('シングルクォート文字列リテラルもグレーでハイライトされること', () => {
    const { container } = render(
      <SyntaxHighlightedFormula formula="'Hello World'" />,
    )
    const span = container.querySelector('.text-slate-400')
    expect(span).toHaveTextContent("'Hello World'")
  })

  it('IF/THEN/ELSE/END キーワードは太字大文字でハイライトされること', () => {
    const { container } = render(
      <SyntaxHighlightedFormula formula='if [Sales] > 0 then "Yes" else "No" end' />,
    )
    const boldSpans = Array.from(
      container.querySelectorAll('.font-bold.text-slate-800'),
    ).map((el) => el.textContent)
    expect(boldSpans).toEqual(
      expect.arrayContaining(['IF', 'THEN', 'ELSE', 'END']),
    )
  })

  it('関数名（大文字+カッコ）は青色でハイライトされること', () => {
    const { container } = render(
      <SyntaxHighlightedFormula formula="SUM([Sales])" />,
    )
    const span = container.querySelector('.text-blue-600')
    expect(span).toHaveTextContent('SUM')
  })

  it('どのパターンにも一致しない演算子・文字列はグレー（既定色）で表示されること', () => {
    const { container } = render(
      <SyntaxHighlightedFormula formula="[Sales] + [Profit]" />,
    )
    const plainSpan = container.querySelector('.text-slate-600')
    expect(plainSpan).toHaveTextContent('+')
  })

  it('複数行の計算式は行ごとに別の行として描画され、行番号が振られること', () => {
    const { container } = render(
      <SyntaxHighlightedFormula formula={'[Sales]\n[Profit]'} />,
    )
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)
    expect(rows[0]).toHaveTextContent('1')
    expect(rows[1]).toHaveTextContent('2')
  })
})
