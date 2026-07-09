export interface TableauField {
  column: string
  datasourceName?: string // 所属データソース名
  formula?: string // 計算式（あれば）
  class?: string
  caption?: string
  role?: string // dimension / measure
  type?: string // quantitative (連続/緑) / nominal, ordinal (不連続/青)
  dataType?: string // string, real, integer, date, datetime, boolean, spatial
  isCalc?: boolean
  parentName?: string // テーブル名/ファイル名
  isContinuous?: boolean
  paramDomainType?: 'list' | 'range' | 'any'
  paramMembers?: { value: string | number; alias?: string }[]
  paramRange?: { min?: string; max?: string; step?: string }
  value?: string | number // 現在の値（パラメータ等）
}

export interface ShelfField {
  name: string
  isContinuous?: boolean // true = 緑ピル, false = 青ピル
}

export interface TableauDatasource {
  name: string
  caption?: string
  fields: TableauField[] // 計算式だけでなく全フィールドを保持
}

export interface WorksheetPane {
  id?: string
  name?: string
  yAxisName?: string // 対応する Y 軸のフィールド名
  xAxisName?: string // 対応する X 軸のフィールド名
  markType: string // XML の mark class（空 = automatic）
  resolvedMarkType?: string // automatic 時の推定マークタイプ
  encodings: {
    color: ShelfField[]
    size: ShelfField[]
    label: ShelfField[]
    detail: ShelfField[]
    tooltip: ShelfField[]
    shape: ShelfField[]
  }
}

export interface WorksheetShelf {
  rows: ShelfField[]
  cols: ShelfField[]
  filters: ShelfField[]
  panes: WorksheetPane[] // 複数レイヤー対応
  marks: WorksheetPane // 互換性のためのメインペイン
}

export interface TableauWorksheet {
  name: string
  caption?: string
  dependencies: string[] // 使用しているフィールド名一覧
  datasourceNames?: string[] // 依存するデータソース名一覧
  shelf?: WorksheetShelf // 棚別フィールド
  localFields?: TableauField[] // ワークシート固有のフィールド（計算フィールド等）
}

/**
 * ダッシュボード上に配置された 1 オブジェクト（zone）のレイアウト情報。
 * x/y/w/h は Tableau の正規化座標（ダッシュボード全体 = 100000 × 100000）。
 */
export interface DashboardZone {
  id?: string
  name?: string // worksheet zone の場合、参照するワークシート名
  kind:
    | 'worksheet'
    | 'text'
    | 'paramctrl'
    | 'image'
    | 'legend'
    | 'filter'
    | 'other'
  rawType?: string // 元の type 属性（フォールバック/デバッグ用）
  x: number
  y: number
  w: number
  h: number
  title?: string // 表示ラベル（text/paramctrl の run テキスト、なければ name）
  param?: string // paramctrl / image の param 属性
  floating?: boolean // 浮動オブジェクト（レイアウトコンテナ外に配置）かどうか
  zOrder?: number // 重ね順（ドキュメント順。大きいほど手前＝Z軸で上）
}

export interface TableauDashboard {
  name: string
  caption?: string
  worksheets: string[] // 配置されているワークシート名のリスト
  usedFields?: string[] // パラメータコントロールや動的ゾーン表示が参照するフィールド
  zones?: DashboardZone[] // レイアウトマップ描画用の配置情報
}

export interface TableauDocument {
  datasources: TableauDatasource[]
  worksheets: TableauWorksheet[]
  dashboards: TableauDashboard[]
  usedFields?: string[] // datagraph（動的ゾーン表示）等、ワークブックレベルで参照されるフィールド
}
