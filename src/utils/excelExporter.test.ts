import { describe, it, expect } from 'vitest'
import { buildExcelWorkbook } from './excelExporter'
import { t } from './i18n'
import type { TableauDocument, TableauDashboard } from '../types/tableau'

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
