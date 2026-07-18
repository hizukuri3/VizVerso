import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { buildExcelWorkbook } from './excelExporter'
import { extractTwbFromTwbx } from './twbxParser'
import { parseTableauXml } from './xmlParser'
import { t } from './i18n'
import type {
  TableauDocument,
  TableauDashboard,
  TableauField,
} from '../types/tableau'

// zone 座標(0-100000 正規化値)を実ピクセルに換算して出力することを検証する。
function makeDoc(dashboard: Partial<TableauDashboard>): TableauDocument {
  return {
    datasources: [],
    worksheets: [],
    dashboards: [
      {
        name: 'Dash',
        worksheets: [],
        zones: [
          {
            kind: 'worksheet',
            name: 'Sheet',
            x: 0,
            y: 0,
            w: 100000,
            h: 100000,
          },
        ],
        ...dashboard,
      },
    ],
  } as unknown as TableauDocument
}

// 「ダッシュボード オブジェクト」シートの1データ行から X/Y/W/H を取り出す
function readCoords(doc: TableauDocument) {
  const wb = buildExcelWorkbook(doc)
  const ws = wb.getWorksheet(t('excel.sheet_dashboard_objects'))!
  const row = ws.getRow(2) // 1 = ヘッダー, 2 = 最初のデータ
  // 列順: ダッシュボード名, 種別, 名前, マーク, 内容, X, Y, 幅, 高さ
  return {
    x: row.getCell(6).value,
    y: row.getCell(7).value,
    w: row.getCell(8).value,
    h: row.getCell(9).value,
  }
}

describe('excelExporter - ダッシュボードオブジェクトの座標', () => {
  it('実サイズ指定ありのダッシュボードは正規化値を px に換算すること', () => {
    const coords = readCoords(makeDoc({ width: 1300, height: 800 }))
    expect(coords).toEqual({ x: 0, y: 0, w: 1300, h: 800 })
  })

  it('サイズ不明のダッシュボードは正規化値のまま出力すること', () => {
    const coords = readCoords(makeDoc({ width: undefined, height: undefined }))
    expect(coords).toEqual({ x: 0, y: 0, w: 100000, h: 100000 })
  })

  it('部分的な座標も比率どおりに px 換算されること', () => {
    const doc = makeDoc({ width: 1300, height: 800 })
    doc.dashboards[0].zones = [
      {
        kind: 'worksheet',
        name: 'Sheet',
        x: 50000,
        y: 25000,
        w: 20000,
        h: 40000,
      },
    ]
    // 50000/100000*1300=650, 25000/100000*800=200, 20000/100000*1300=260, 40000/100000*800=320
    expect(readCoords(doc)).toEqual({ x: 650, y: 200, w: 260, h: 320 })
  })
})

// 実 twbx を通して、全シート生成パイプライン（フィールド解決・計算式表示・
// パラメータ・依存関係・ワークシート別マーク等）をひととおり実行して検証する。
async function loadDoc(fixture: string): Promise<TableauDocument> {
  const filePath = resolve(__dirname, `../../tests/fixtures/${fixture}`)
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const buffer = readFileSync(filePath)
  const xml = await extractTwbFromTwbx(new Uint8Array(buffer))
  return parseTableauXml(xml)
}

describe('excelExporter - 実ファイルからのワークブック生成', () => {
  it('sample.twbx から装飾済みワークブックを構築できること', async () => {
    const doc = await loadDoc('sample.twbx')
    const wb = buildExcelWorkbook(doc)

    // 少なくとも「使い方」＋データシートが生成される
    expect(wb.worksheets.length).toBeGreaterThan(1)

    // 使い方シートが先頭にある
    expect(wb.worksheets[0].name).toBe(t('excel.guide.tab'))

    // フィールド一覧シートにヘッダー＋データ行が存在する
    const fieldsSheet = wb.getWorksheet(t('excel.sheet_fields'))
    expect(fieldsSheet).toBeDefined()
    expect(fieldsSheet!.rowCount).toBeGreaterThan(1)

    // すべてのシート名が Excel 制約（31文字以内・一意）を満たす
    const names = wb.worksheets.map((w) => w.name)
    expect(new Set(names).size).toBe(names.length)
    names.forEach((n) => expect(n.length).toBeLessThanOrEqual(31))
  })
})

// 集計種別・計算種別・パラメータ種別・全 zone 種別を網羅した合成ドキュメントで、
// 各シートビルダーの分岐（集計ラベル付与 / list・range・any / LOD・表計算 等）を通す。
function richDoc(): TableauDocument {
  const base = (column: string, extra: Partial<TableauField> = {}) => ({
    column,
    caption: column.replace(/[[\]]/g, ''),
    role: 'measure',
    dataType: 'real',
    ...extra,
  })
  const sf = (name: string) => ({ name })
  const emptyEnc = () => ({
    color: [],
    size: [],
    label: [],
    detail: [],
    tooltip: [],
    shape: [],
  })
  return {
    datasources: [
      {
        name: 'Orders',
        caption: 'Orders',
        fields: [
          base('[Sales]'),
          base('[Profit]'),
          base('[Qty]'),
          base('[Discount]'),
          base('[Orders]'),
          base('[Category]', { role: 'dimension', dataType: 'string' }),
          base('[Geo]', { dataType: 'spatial' }),
          base('[Region]', { role: 'dimension', dataType: 'string' }),
          base('[LOD Calc]', {
            formula: '{FIXED [Region] : SUM([Sales])}',
            role: 'measure',
          }),
          base('[Table Calc]', {
            formula: 'RANK(SUM([Sales]))',
            role: 'measure',
          }),
          base('[Alias Calc]', { class: '[Sales]' }),
        ],
      },
      {
        name: 'Parameters',
        caption: 'Parameters',
        fields: [
          base('[P List]', {
            role: 'dimension',
            dataType: 'string',
            paramDomainType: 'list',
            paramMembers: [{ value: 'East', alias: 'E' }, { value: 'West' }],
            value: '"East"',
          }),
          base('[P Range]', {
            dataType: 'integer',
            paramDomainType: 'range',
            paramRange: { min: '1', max: '10', step: '1' },
            value: 5,
          }),
          base('[P Any]', {
            role: 'dimension',
            dataType: 'string',
            paramDomainType: 'any',
            value: '"free"',
          }),
        ],
      },
    ],
    worksheets: [
      {
        name: 'Sheet 1',
        caption: 'Sheet 1',
        dependencies: ['[sum:Sales]', '[Region]', '[LOD Calc]', '[Table Calc]'],
        shelf: {
          cols: [sf('[sum:Sales]')],
          rows: [sf('[Region]')],
          filters: [sf('[avg:Discount]')],
          panes: [
            {
              name: 'mp.pane',
              markType: 'bar',
              encodings: {
                color: [sf('[max:Profit]')],
                size: [sf('[min:Qty]')],
                shape: [sf('[attr:Category]')],
                label: [sf('[cnt:Orders]')],
                detail: [sf('[collect:Geo]')],
                tooltip: [sf('[rank:Sales]')],
              },
            },
          ],
          marks: { markType: 'bar', encodings: emptyEnc() },
        },
      },
    ],
    dashboards: [
      {
        name: 'DB',
        caption: 'DB',
        worksheets: ['Sheet 1'],
        width: 1300,
        height: 800,
        zones: [
          {
            kind: 'worksheet',
            name: 'Sheet 1',
            x: 0,
            y: 0,
            w: 50000,
            h: 100000,
          },
          {
            kind: 'text',
            title: 'A title',
            x: 50000,
            y: 0,
            w: 50000,
            h: 20000,
          },
          {
            kind: 'paramctrl',
            param: '[P List]',
            title: 'Pick',
            x: 50000,
            y: 20000,
            w: 50000,
            h: 10000,
          },
          {
            kind: 'image',
            param: 'assets/logo.png',
            x: 50000,
            y: 30000,
            w: 50000,
            h: 20000,
          },
          { kind: 'legend', x: 50000, y: 50000, w: 50000, h: 20000 },
          { kind: 'filter', x: 50000, y: 70000, w: 50000, h: 20000 },
          { kind: 'other', x: 50000, y: 90000, w: 50000, h: 10000 },
        ],
      },
    ],
  } as unknown as TableauDocument
}

describe('excelExporter - 各種別を網羅した合成データ', () => {
  it('集計・計算・パラメータ・全 zone 種別を含んでも例外なく構築できること', () => {
    const wb = buildExcelWorkbook(richDoc())

    // パラメータシート（list/range/any の 3 行 + ヘッダー）
    const paramSheet = wb.getWorksheet(t('excel.sheet_parameters'))
    expect(paramSheet).toBeDefined()
    expect(paramSheet!.rowCount).toBe(4)

    // ダッシュボードオブジェクトシートに全 7 zone が出力される
    const objSheet = wb.getWorksheet(t('excel.sheet_dashboard_objects'))
    expect(objSheet!.rowCount).toBe(8) // ヘッダー + 7 zone

    // フィールド一覧に LOD / 表計算を含む計算フィールドが出力される
    const fieldsSheet = wb.getWorksheet(t('excel.sheet_fields'))
    expect(fieldsSheet!.rowCount).toBeGreaterThan(1)
  })
})
