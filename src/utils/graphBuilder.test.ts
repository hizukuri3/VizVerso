import { describe, it, expect } from 'vitest'
import { buildGraphData } from './graphBuilder'
import type { TableauDocument } from '../types/tableau'

describe('graphBuilder - buildGraphData', () => {
  it('キャプションや計算式の有無、およびフィールドの重複排除を正しく処理できること', () => {
    const mockDoc: TableauDocument = {
      dashboards: [
        { name: 'Dash1', caption: 'Dashboard One', worksheets: ['Sheet1'] },
        { name: 'Dash2', worksheets: ['Sheet1'] }, // Captionなし
      ],
      worksheets: [
        {
          name: 'Sheet1',
          caption: 'Sales Analysis',
          dependencies: ['Sales', 'Profit'],
        },
        { name: 'Sheet2', dependencies: [] }, // Captionなし
      ],
      datasources: [
        {
          name: 'DS1',
          caption: 'My Data Source',
          fields: [
            { column: 'Sales', formula: '[X] * [Y]' }, // 計算フィールド
            { column: 'Profit' }, // 標準フィールド
          ],
        },
        {
          name: 'DS2',
          fields: [
            { column: 'Sales' }, // 重複するフィールドID
          ],
        },
      ],
    }

    const { nodes } = buildGraphData(mockDoc)

    // キャプションの優先表示確認
    const dash1 = nodes.find((n) => n.id === 'dashboard-Dash1')
    const dash2 = nodes.find((n) => n.id === 'dashboard-Dash2')
    expect(dash1?.data.label).toContain('Dashboard One')
    expect(dash2?.data.label).toContain('Dash2')

    const sheet1 = nodes.find((n) => n.id === 'worksheet-Sheet1')
    expect(sheet1?.data.label).toContain('Sales Analysis')

    // 計算フィールドと標準フィールドの区別
    const salesField = nodes.find((n) => n.id === 'field-Sales')
    const profitField = nodes.find((n) => n.id === 'field-Profit')
    expect(salesField?.data.label).toContain('f(x)')
    expect(salesField?.className).toContain('calc-field-node')
    expect(profitField?.data.label).toContain('●')
    expect(profitField?.className).toContain('field-node')

    // フィールドの重複排除 (DS1 と DS2 の両方に Sales があるがノードは1つ)
    const salesNodes = nodes.filter((n) => n.id === 'field-Sales')
    expect(salesNodes).toHaveLength(1)

    // データソースのキャプション
    const ds1 = nodes.find((n) => n.id === 'ds-DS1')
    const ds2 = nodes.find((n) => n.id === 'ds-DS2')
    expect(ds1?.data.label).toContain('My Data Source')
    expect(ds2?.data.label).toContain('DS2')
  })
})
