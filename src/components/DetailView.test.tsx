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

// ─────────────────────────────────────────
// ダッシュボードビュー用フィクスチャ
// worksheets: caption あり / caption なし の2枚
// ─────────────────────────────────────────
const dashboardDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [{ column: 'Sales', isCalc: false, dataType: 'real' }],
    },
  ],
  worksheets: [
    { name: 'Sheet 1', caption: 'シート1', dependencies: [], localFields: [] },
    // caption を持たない → ws.name がそのまま表示される（302行の分岐）
    { name: 'Sheet 2', dependencies: [], localFields: [] },
  ],
  dashboards: [{ name: 'Dashboard 1', worksheets: ['Sheet 1', 'Sheet 2'] }],
}

// ─────────────────────────────────────────
// パラメータデータソース用フィクスチャ
// list / range（step有無）/ any（明示・暗黙）の各ドメインを網羅
// ─────────────────────────────────────────
const parametersDoc: TableauDocument = {
  datasources: [
    {
      name: 'Parameters',
      fields: [
        {
          column: 'ListParam',
          caption: 'リストパラメータ',
          dataType: 'integer',
          paramDomainType: 'list',
          // alias あり（Value行が出る）/ alias なし（value を表示）の両方
          paramMembers: [{ value: 1, alias: 'One' }, { value: 2 }],
        },
        {
          column: 'RangeParam',
          caption: '範囲パラメータ',
          dataType: 'real',
          paramDomainType: 'range',
          paramRange: { min: '0', max: '100', step: '10' },
        },
        {
          column: 'RangeParamNoStep',
          caption: 'ステップ無し範囲',
          dataType: 'real',
          paramDomainType: 'range',
          paramRange: { min: '1', max: '9' }, // step 無し（686行の分岐）
        },
        {
          column: 'AnyParamExplicit',
          caption: '任意パラメータ明示',
          dataType: 'string',
          paramDomainType: 'any',
        },
        {
          // paramDomainType 未指定 → 'any' フォールバック（634行・700行の分岐）
          column: 'AnyParamImplicit',
          caption: '任意パラメータ暗黙',
          dataType: 'string',
        },
      ],
    },
  ],
  worksheets: [],
  dashboards: [],
}

// ─────────────────────────────────────────
// マルチペインワークシート用フィクスチャ
// すべて/名前重複/軸ラベル/フォールバック/集計プレフィックスを網羅
// ─────────────────────────────────────────
const multiPaneDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      caption: 'データソース1',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        { column: 'Profit', isCalc: false, dataType: 'real' },
        { column: 'Category', isCalc: false, dataType: 'string' },
        { column: 'Geo', isCalc: false, dataType: 'spatial' },
        // 軸参照の min(0) 調整分岐（458行）を通すためのフィールド
        {
          column: 'MinZero',
          caption: 'MIN(0)',
          isCalc: false,
          dataType: 'real',
        },
      ],
    },
  ],
  worksheets: [
    {
      name: 'WS Multi',
      caption: 'マルチペイン',
      dependencies: ['Sales', 'Profit', 'Category', 'Geo'],
      datasourceNames: ['ds1'],
      localFields: [],
      shelf: {
        // isContinuous 未指定 & インデックス未登録 → getFieldInfo フォールバック（327/332/334行）
        cols: [{ name: 'NoSuchField' }],
        rows: [{ name: 'sum:Sales:qk', isContinuous: true }], // 集計: 合計
        filters: [{ name: 'avg:Profit:qk', isContinuous: true }], // 集計: 平均
        panes: [
          // p0: hasAllPane && index0 → 「すべて」。集計 min とテーブル計算 rank を含む
          {
            markType: 'bar',
            encodings: {
              ...emptyEncodings(),
              color: [{ name: 'min:Sales:qk', isContinuous: true }],
              tooltip: [{ name: 'rank:Sales:qk', isContinuous: true }],
            },
          },
          // p1: pane.name あり（452行）。集計 max
          {
            name: '同名',
            markType: 'line',
            encodings: {
              ...emptyEncodings(),
              size: [{ name: 'max:Profit:qk', isContinuous: true }],
            },
          },
          // p2: pane.name 重複（482行 → 「同名(2)」）。集計 count
          {
            name: '同名',
            markType: 'square',
            encodings: {
              ...emptyEncodings(),
              shape: [{ name: 'cnt:Category:nk', isContinuous: false }],
            },
          },
          // p3: yAxisName あり（453〜458行）。集計 attr
          {
            markType: 'circle',
            yAxisName: 'MinZero',
            encodings: {
              ...emptyEncodings(),
              label: [{ name: 'attr:Category:nk', isContinuous: false }],
            },
          },
          // p4: 名前も軸も無し → color[0] フォールバック（464行）。集計 collect
          {
            markType: 'automatic',
            encodings: {
              ...emptyEncodings(),
              color: [{ name: 'collect:Geo:qk', isContinuous: true }],
            },
          },
          // p5: color 空 detail 有り → detail[0] フォールバック
          {
            markType: 'automatic',
            encodings: {
              ...emptyEncodings(),
              detail: [{ name: 'Category', isContinuous: false }],
            },
          },
          // p6: color/detail 空 label 有り → label[0] フォールバック
          {
            markType: 'automatic',
            encodings: {
              ...emptyEncodings(),
              label: [{ name: 'Profit', isContinuous: true }],
            },
          },
          // p7: color/detail/label すべて空 size のみ → firstField undefined → 「マーク N」（467/470行）
          {
            markType: 'automatic',
            encodings: {
              ...emptyEncodings(),
              size: [{ name: 'Sales', isContinuous: true }],
            },
          },
          // p8: 全エンコーディング空 → 非表示（428行）
          {
            markType: 'automatic',
            encodings: emptyEncodings(),
          },
        ],
        marks: {
          markType: 'bar',
          encodings: emptyEncodings(),
        },
      },
    },
  ],
  dashboards: [],
}

// ─────────────────────────────────────────
// マップ（複数レイヤー）ワークシート用フィクスチャ
// pane.name が 'mp.' を含む → isMapChart 分岐（444〜445行）
// cols 側にメジャーを寄せて splitMeasures の else 側（439行）も通す
// ─────────────────────────────────────────
const mapDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      fields: [
        { column: 'Geo', isCalc: false, dataType: 'spatial' },
        { column: 'Category', isCalc: false, dataType: 'string' },
        { column: 'Sales', isCalc: false, dataType: 'real' },
      ],
    },
  ],
  worksheets: [
    {
      name: 'Map WS',
      dependencies: ['Geo'],
      datasourceNames: ['ds1'],
      localFields: [],
      shelf: {
        rows: [],
        cols: [{ name: 'sum:Sales:qk', isContinuous: true }], // colMeasures 優勢
        filters: [],
        panes: [
          // p0: pane.name に 'mp.' → ヘッダは pane.name（445行 左）
          {
            name: 'mp.layer0',
            markType: 'map',
            encodings: {
              ...emptyEncodings(),
              color: [{ name: 'Category', isContinuous: false }],
            },
          },
          // p1: name 無し → 「Layer 2」（445行 右）
          {
            markType: 'map',
            encodings: {
              ...emptyEncodings(),
              detail: [{ name: 'Geo', isContinuous: false }],
            },
          },
        ],
        marks: { markType: 'map', encodings: emptyEncodings() },
      },
    },
  ],
  dashboards: [],
}

// ─────────────────────────────────────────
// データソース標準フィールド用フィクスチャ
// 未使用カウントチップ / 使用中・未使用ラベル / アクティブ行を網羅
// ─────────────────────────────────────────
const standardFieldsDoc: TableauDocument = {
  datasources: [
    {
      name: 'ds2',
      caption: 'DS2',
      fields: [
        { column: 'UsedField', isCalc: false, dataType: 'string' }, // 使用中
        { column: 'UnusedField', isCalc: false, dataType: 'integer' }, // 未使用
        {
          column: 'CalcUsed',
          caption: '使用中計算',
          isCalc: true,
          formula: '[UsedField]',
          dataType: 'string',
        },
      ],
    },
  ],
  worksheets: [
    { name: 'S', dependencies: ['UsedField', 'CalcUsed'], localFields: [] },
  ],
  dashboards: [],
}

describe('DetailView - 空状態', () => {
  it('selectedId / selectedType が null のときは空状態プレースホルダを表示する', () => {
    render(
      <DetailView doc={worksheetDoc} selectedId={null} selectedType={null} />,
    )
    // 空状態のヒント文言が表示される
    expect(
      screen.getByText((_, el) =>
        el?.tagName.toLowerCase() === 'p' ? true : false,
      ),
    ).toBeInTheDocument()
    // ワークシートやデータソースの見出しは描画されない
    expect(screen.queryByText('シート1')).not.toBeInTheDocument()
  })
})

describe('DetailView - ダッシュボードビュー', () => {
  it('内包ワークシートが caption / name で一覧表示されること', () => {
    render(
      <DetailView
        doc={dashboardDoc}
        selectedId="Dashboard 1"
        selectedType="dashboard"
      />,
    )
    // caption ありは caption、caption なしは name を表示
    expect(screen.getByText('シート1')).toBeInTheDocument()
    expect(screen.getByText('Sheet 2')).toBeInTheDocument()
  })

  it('ワークシートカードのクリックで onNavigate が呼ばれること', () => {
    const onNavigate = vi.fn()
    render(
      <DetailView
        doc={dashboardDoc}
        selectedId="Dashboard 1"
        selectedType="dashboard"
        onNavigate={onNavigate}
      />,
    )
    fireEvent.click(screen.getByText('シート1'))
    expect(onNavigate).toHaveBeenCalledWith('worksheet', 'Sheet 1')
  })
})

describe('DetailView - パラメータデータソースビュー', () => {
  it('list / range / any の各ドメインが表示されること', () => {
    render(
      <DetailView
        doc={parametersDoc}
        selectedId="Parameters"
        selectedType="datasource"
      />,
    )
    // パラメータ見出し
    expect(screen.getByText('パラメーター')).toBeInTheDocument()
    // list: alias 表示（One）と、alias 無しメンバーの value（2）
    expect(screen.getByText('One')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // alias ありメンバーの Value 行
    expect(screen.getByText('Value: 1')).toBeInTheDocument()
    // range: 最小値・最大値・ステップ
    expect(screen.getAllByText('最小値').length).toBeGreaterThan(0)
    expect(screen.getAllByText('最大値').length).toBeGreaterThan(0)
    expect(screen.getByText('ステップ')).toBeInTheDocument()
    // any: すべての値
    expect(screen.getAllByText('すべての値').length).toBe(2)
  })
})

describe('DetailView - マルチペインワークシート', () => {
  beforeEach(() => {
    // jsdom は scrollIntoView 未実装のためモックする
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('「すべて」ペインと重複ペイン名の連番が表示されること', () => {
    render(
      <DetailView
        doc={multiPaneDoc}
        selectedId="WS Multi"
        selectedType="worksheet"
      />,
    )
    // hasAllPane && index0 → 「すべて」
    expect(screen.getByText('すべて')).toBeInTheDocument()
    // pane.name の重複は (2) が付与される
    expect(screen.getByText('同名')).toBeInTheDocument()
    expect(screen.getByText('同名(2)')).toBeInTheDocument()
    // 軸参照 MIN(0) の調整ヘッダ
    expect(screen.getByText('集計(MIN(0))')).toBeInTheDocument()
  })

  it('集計プレフィックスがキャプションに反映されること', () => {
    render(
      <DetailView
        doc={multiPaneDoc}
        selectedId="WS Multi"
        selectedType="worksheet"
      />,
    )
    // 合計 / 平均 / 最小 / 最大 / カウント / 属性 / 収集
    expect(screen.getByText('合計(Sales)')).toBeInTheDocument()
    expect(screen.getByText('平均(Profit)')).toBeInTheDocument()
    expect(screen.getByText('最小(Sales)')).toBeInTheDocument()
    expect(screen.getByText('最大(Profit)')).toBeInTheDocument()
    expect(screen.getByText('カウント(Category)')).toBeInTheDocument()
    expect(screen.getByText('属性(Category)')).toBeInTheDocument()
    // 収集(Geo) はフォールバックのペインヘッダにも出るため複数一致
    expect(screen.getAllByText('収集(Geo)').length).toBeGreaterThan(0)
    // テーブル計算は △ が付与される
    expect(screen.getByText('Sales △')).toBeInTheDocument()
    // インデックス未登録フィールドは正規化名でフォールバック表示
    expect(screen.getByText('NoSuchField')).toBeInTheDocument()
  })

  it('activeFieldName に一致するピルで scrollIntoView が呼ばれること', () => {
    render(
      <DetailView
        doc={multiPaneDoc}
        selectedId="WS Multi"
        selectedType="worksheet"
        activeFieldName="Sales"
      />,
    )
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

describe('DetailView - マップ複数レイヤーワークシート', () => {
  it('mp. を含むペインはレイヤー名で、名前なしは Layer 連番で表示されること', () => {
    render(
      <DetailView doc={mapDoc} selectedId="Map WS" selectedType="worksheet" />,
    )
    expect(screen.getByText('mp.layer0')).toBeInTheDocument()
    expect(screen.getByText('Layer 2')).toBeInTheDocument()
  })
})

describe('DetailView - データソース標準フィールド', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('未使用カウントチップと使用中・未使用ラベルが表示されること', () => {
    render(
      <DetailView
        doc={standardFieldsDoc}
        selectedId="ds2"
        selectedType="datasource"
      />,
    )
    // 標準フィールドの未使用カウントチップ（UnusedField が1件）
    expect(screen.getByText('未使用 1')).toBeInTheDocument()
    // 使用中ラベルと未使用バッジの双方が標準フィールド行に出る
    expect(screen.getByText('使用中')).toBeInTheDocument()
    expect(screen.getByText('未使用')).toBeInTheDocument()
  })

  it('activeFieldName に一致する標準フィールド行がハイライトされること', () => {
    render(
      <DetailView
        doc={standardFieldsDoc}
        selectedId="ds2"
        selectedType="datasource"
        activeFieldName="UsedField"
      />,
    )
    // アクティブ行では scrollIntoView が呼ばれる
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

describe('DetailView - 計算式ビューのアクティブ強調', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('activeFieldName に一致する計算式行がアクティブ表示になること', () => {
    render(
      <DetailView
        doc={datasourceDoc}
        selectedId="ds1"
        selectedType="datasource"
        activeFieldName="LOD Field"
      />,
    )
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

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
