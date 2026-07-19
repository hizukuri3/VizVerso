import { describe, it, expect } from 'vitest'
import { diffWorkbooks } from './workbookDiff'
import type {
  DashboardZone,
  TableauDashboard,
  TableauDocument,
  TableauField,
  TableauWorksheet,
  WorksheetPane,
  WorksheetShelf,
} from '../types/tableau'

// ── テスト用の最小ドキュメント組み立てヘルパー ──
function field(
  column: string,
  extra: Partial<TableauField> = {},
): TableauField {
  return { column, ...extra }
}

function doc(overrides: Partial<TableauDocument> = {}): TableauDocument {
  return {
    datasources: [],
    worksheets: [],
    dashboards: [],
    ...overrides,
  }
}

function sheet(
  name: string,
  extra: Partial<TableauWorksheet> = {},
): TableauWorksheet {
  return { name, dependencies: [], ...extra }
}

/** 空のエンコーディング棚を持つマークペインを作る。 */
function marks(extra: Partial<WorksheetPane> = {}): WorksheetPane {
  return {
    markType: '',
    encodings: {
      color: [],
      size: [],
      label: [],
      detail: [],
      tooltip: [],
      shape: [],
    },
    ...extra,
  }
}

/** 最小構成の棚オブジェクトを作る。 */
function shelfOf(extra: Partial<WorksheetShelf> = {}): WorksheetShelf {
  return {
    rows: [],
    cols: [],
    filters: [],
    panes: [],
    marks: marks(),
    ...extra,
  }
}

/** ダッシュボードゾーンを作る（座標は正規化 100000 基準）。 */
function zone(
  kind: DashboardZone['kind'],
  extra: Partial<DashboardZone> = {},
): DashboardZone {
  return { kind, x: 0, y: 0, w: 0, h: 0, ...extra }
}

/** ダッシュボードを作る。 */
function dash(
  name: string,
  extra: Partial<TableauDashboard> = {},
): TableauDashboard {
  return { name, worksheets: [], ...extra }
}

describe('diffWorkbooks - フィールドの追加/削除', () => {
  it('データソースのフィールド追加と削除を検出すること', () => {
    const before = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales'), field('Old Field')] },
      ],
    })
    const after = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales'), field('New Field')] },
      ],
    })

    const result = diffWorkbooks(before, after)
    expect(result.fields.added.map((lf) => lf.field.column)).toContain(
      'New Field',
    )
    expect(result.fields.removed.map((lf) => lf.field.column)).toContain(
      'Old Field',
    )
    // Sales は両方に存在し変更なし
    expect(result.fields.unchangedCount).toBe(1)
  })
})

describe('diffWorkbooks - formula 変更（空白正規化）', () => {
  it('空白のみの差はフィールド変更として扱わないこと', () => {
    const before = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Calc', { isCalc: true, formula: '[A] + [B]' })],
        },
      ],
    })
    const after = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Calc', { isCalc: true, formula: '[A]   +   [B]  ' })],
        },
      ],
    })
    const result = diffWorkbooks(before, after)
    expect(result.fields.changed).toHaveLength(0)
    expect(result.fields.unchangedCount).toBe(1)
  })

  it('実際に式が変わった場合は formula 変更を検出すること', () => {
    const before = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Calc', { isCalc: true, formula: '[A] + [B]' })],
        },
      ],
    })
    const after = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Calc', { isCalc: true, formula: '[A] - [B]' })],
        },
      ],
    })
    const result = diffWorkbooks(before, after)
    expect(result.fields.changed).toHaveLength(1)
    const change = result.fields.changed[0]
    expect(change.changes.some((c) => c.property === 'formula')).toBe(true)
    const formulaChange = change.changes.find((c) => c.property === 'formula')
    expect(formulaChange?.before).toBe('[A] + [B]')
    expect(formulaChange?.after).toBe('[A] - [B]')
  })
})

describe('diffWorkbooks - caption 変更', () => {
  it('フィールドの caption 変更を検出すること', () => {
    const before = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales', { caption: '売上' })] },
      ],
    })
    const after = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales', { caption: '売上高' })] },
      ],
    })
    const result = diffWorkbooks(before, after)
    expect(result.fields.changed).toHaveLength(1)
    expect(
      result.fields.changed[0].changes.some((c) => c.property === 'caption'),
    ).toBe(true)
  })

  it('データソースの caption 変更を検出すること（フィールドとは別カテゴリ）', () => {
    const before = doc({
      datasources: [{ name: 'DS', caption: '旧DS', fields: [] }],
    })
    const after = doc({
      datasources: [{ name: 'DS', caption: '新DS', fields: [] }],
    })
    const result = diffWorkbooks(before, after)
    expect(result.datasources.changed).toHaveLength(1)
    expect(
      result.datasources.changed[0].changes.some(
        (c) => c.property === 'caption',
      ),
    ).toBe(true)
  })
})

describe('diffWorkbooks - ワークシートの dependencies 変化', () => {
  it('依存フィールドの追加/削除を検出すること', () => {
    const before = doc({
      worksheets: [sheet('Sheet 1', { dependencies: ['Sales', 'Profit'] })],
    })
    const after = doc({
      worksheets: [sheet('Sheet 1', { dependencies: ['Sales', 'Discount'] })],
    })
    const result = diffWorkbooks(before, after)
    expect(result.worksheets.changed).toHaveLength(1)
    const props = result.worksheets.changed[0].changes
    expect(props.some((c) => c.property === 'dependencies')).toBe(true)
    // 追加 Discount / 削除 Profit
    expect(
      props.some(
        (c) => c.property === 'dependencies' && c.after === 'Discount',
      ),
    ).toBe(true)
    expect(
      props.some((c) => c.property === 'dependencies' && c.before === 'Profit'),
    ).toBe(true)
  })
})

describe('diffWorkbooks - ダッシュボードのシート構成変化', () => {
  it('含まれるシートの追加/削除を検出すること', () => {
    const before = doc({
      dashboards: [{ name: 'DB', worksheets: ['Sheet 1', 'Sheet 2'] }],
    })
    const after = doc({
      dashboards: [{ name: 'DB', worksheets: ['Sheet 1', 'Sheet 3'] }],
    })
    const result = diffWorkbooks(before, after)
    expect(result.dashboards.changed).toHaveLength(1)
    const props = result.dashboards.changed[0].changes
    expect(
      props.some((c) => c.property === 'worksheets' && c.after === 'Sheet 3'),
    ).toBe(true)
    expect(
      props.some((c) => c.property === 'worksheets' && c.before === 'Sheet 2'),
    ).toBe(true)
  })
})

describe('diffWorkbooks - 論理フィールドへの集約', () => {
  it('データソース定義＋複数シートの再宣言を1論理フィールドに集約し、caption 変更を1エントリにまとめること', () => {
    // データソース定義に Calc があり、2枚のシートが同じフィールドを再宣言している。
    const mkDoc = (caption: string): TableauDocument =>
      doc({
        datasources: [
          {
            name: 'DS',
            fields: [
              field('Calculation_1', {
                caption,
                isCalc: true,
                formula: '[Sales] * 2',
                datasourceName: 'DS',
              }),
            ],
          },
        ],
        worksheets: [
          sheet('Sheet A', {
            localFields: [
              field('Calculation_1', { caption, datasourceName: 'DS' }),
            ],
          }),
          sheet('Sheet B', {
            localFields: [
              field('Calculation_1', { caption, datasourceName: 'DS' }),
            ],
          }),
        ],
      })

    const result = diffWorkbooks(mkDoc('売上'), mkDoc('売上高'))
    // 7行ではなく1エントリに集約される
    expect(result.fields.changed).toHaveLength(1)
    const entry = result.fields.changed[0]
    // caption 変更が1件だけ（property 単位で重複排除）
    const captionChanges = entry.changes.filter((c) => c.property === 'caption')
    expect(captionChanges).toHaveLength(1)
    // 再宣言している2シートが declaredInSheets に入る
    expect(entry.after.declaredInSheets).toEqual(
      expect.arrayContaining(['Sheet A', 'Sheet B']),
    )
    expect(entry.after.declaredInSheets).toHaveLength(2)
  })

  it('サマリー件数が論理フィールド単位になること（再宣言で水増しされない）', () => {
    const mkDoc = (): TableauDocument =>
      doc({
        datasources: [
          { name: 'DS', fields: [field('Sales', { caption: '売上' })] },
        ],
        worksheets: [
          sheet('S1', {
            localFields: [
              field('Sales', { caption: '売上', datasourceName: 'DS' }),
            ],
          }),
          sheet('S2', {
            localFields: [
              field('Sales', { caption: '売上', datasourceName: 'DS' }),
            ],
          }),
        ],
      })
    const result = diffWorkbooks(mkDoc(), mkDoc())
    // 論理フィールドは Sales の1つだけ
    expect(result.fields.unchangedCount).toBe(1)
    expect(result.fields.changed).toHaveLength(0)
    expect(result.fields.added).toHaveLength(0)
    expect(result.fields.removed).toHaveLength(0)
  })

  it('どのデータソースにも属さないシート固有フィールドは従来どおり検出されること', () => {
    // datasourceName が未知（データソース定義に存在しない）→ シート固有として扱う
    const before = doc({
      datasources: [{ name: 'DS', fields: [field('Sales')] }],
      worksheets: [
        sheet('S1', {
          localFields: [
            field('SheetLocal', {
              caption: 'ローカル',
              datasourceName: 'Unknown',
            }),
          ],
        }),
      ],
    })
    const after = doc({
      datasources: [{ name: 'DS', fields: [field('Sales')] }],
      worksheets: [
        sheet('S1', {
          localFields: [
            field('SheetLocal', {
              caption: 'ローカル改',
              datasourceName: 'Unknown',
            }),
          ],
        }),
      ],
    })
    const result = diffWorkbooks(before, after)
    const changed = result.fields.changed.find(
      (c) => c.after.field.column === 'SheetLocal',
    )
    expect(changed).toBeDefined()
    expect(changed?.after.field.datasourceName).toBe('ws:S1')
    expect(changed?.changes.some((c) => c.property === 'caption')).toBe(true)
  })
})

describe('diffWorkbooks - フィールドの追加検出（型/パラメータ系）', () => {
  it('連続/不連続（type）の変更を fieldType として検出すること', () => {
    const before = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales', { type: 'nominal' })] },
      ],
    })
    const after = doc({
      datasources: [
        { name: 'DS', fields: [field('Sales', { type: 'quantitative' })] },
      ],
    })
    const result = diffWorkbooks(before, after)
    const change = result.fields.changed[0]?.changes.find(
      (c) => c.property === 'fieldType',
    )
    expect(change?.before).toBe('nominal')
    expect(change?.after).toBe('quantitative')
  })

  it('パラメータの現在値（value）変更を paramValue として検出すること', () => {
    const before = doc({
      datasources: [{ name: 'DS', fields: [field('Param', { value: 10 })] }],
    })
    const after = doc({
      datasources: [{ name: 'DS', fields: [field('Param', { value: 20 })] }],
    })
    const result = diffWorkbooks(before, after)
    const change = result.fields.changed[0]?.changes.find(
      (c) => c.property === 'paramValue',
    )
    expect(change?.before).toBe('10')
    expect(change?.after).toBe('20')
  })

  it('value が undefined から定義された場合も paramValue 変更として検出すること', () => {
    const before = doc({
      datasources: [{ name: 'DS', fields: [field('Param')] }],
    })
    const after = doc({
      datasources: [{ name: 'DS', fields: [field('Param', { value: 'X' })] }],
    })
    const result = diffWorkbooks(before, after)
    const change = result.fields.changed[0]?.changes.find(
      (c) => c.property === 'paramValue',
    )
    expect(change?.before).toBe('')
    expect(change?.after).toBe('X')
  })

  it('許容値の種類（paramDomainType）変更を paramDomain として検出すること', () => {
    const before = doc({
      datasources: [
        { name: 'DS', fields: [field('Param', { paramDomainType: 'list' })] },
      ],
    })
    const after = doc({
      datasources: [
        { name: 'DS', fields: [field('Param', { paramDomainType: 'range' })] },
      ],
    })
    const result = diffWorkbooks(before, after)
    const change = result.fields.changed[0]?.changes.find(
      (c) => c.property === 'paramDomain',
    )
    expect(change?.before).toBe('list')
    expect(change?.after).toBe('range')
  })

  it('値の範囲（paramRange）を直列化して paramRange 変更を検出すること', () => {
    const before = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Param', { paramRange: { min: '0', max: '10' } })],
        },
      ],
    })
    const after = doc({
      datasources: [
        {
          name: 'DS',
          fields: [
            field('Param', { paramRange: { min: '0', max: '100', step: '5' } }),
          ],
        },
      ],
    })
    const result = diffWorkbooks(before, after)
    const change = result.fields.changed[0]?.changes.find(
      (c) => c.property === 'paramRange',
    )
    expect(change?.before).toBe('0..10')
    expect(change?.after).toBe('0..100 step 5')
  })

  it('値リスト（paramMembers）の増減を paramMembers としてリスト検出すること', () => {
    const before = doc({
      datasources: [
        {
          name: 'DS',
          fields: [field('Param', { paramMembers: [{ value: 'A' }] })],
        },
      ],
    })
    const after = doc({
      datasources: [
        {
          name: 'DS',
          fields: [
            field('Param', {
              paramMembers: [{ value: 'A' }, { value: 'B', alias: 'Beta' }],
            }),
          ],
        },
      ],
    })
    const result = diffWorkbooks(before, after)
    const props = result.fields.changed[0]?.changes ?? []
    expect(
      props.some(
        (c) => c.property === 'paramMembers' && c.after === 'B (Beta)',
      ),
    ).toBe(true)
  })
})

describe('diffWorkbooks - ワークシートの追加検出（caption/エンコーディング）', () => {
  it('ワークシートの caption 変更を検出すること', () => {
    const before = doc({ worksheets: [sheet('S1', { caption: '旧' })] })
    const after = doc({ worksheets: [sheet('S1', { caption: '新' })] })
    const result = diffWorkbooks(before, after)
    expect(
      result.worksheets.changed[0]?.changes.some(
        (c) => c.property === 'caption',
      ),
    ).toBe(true)
  })

  it('マークカードの色エンコーディング増減を encodingColor として検出すること', () => {
    const before = doc({
      worksheets: [
        sheet('S1', {
          shelf: shelfOf({
            marks: marks({
              encodings: {
                color: [{ name: 'Sales' }],
                size: [],
                label: [],
                detail: [],
                tooltip: [],
                shape: [],
              },
            }),
          }),
        }),
      ],
    })
    const after = doc({
      worksheets: [
        sheet('S1', {
          shelf: shelfOf({
            marks: marks({
              encodings: {
                color: [{ name: 'Profit' }],
                size: [],
                label: [],
                detail: [],
                tooltip: [],
                shape: [],
              },
            }),
          }),
        }),
      ],
    })
    const result = diffWorkbooks(before, after)
    const props = result.worksheets.changed[0]?.changes ?? []
    expect(
      props.some((c) => c.property === 'encodingColor' && c.after === 'Profit'),
    ).toBe(true)
    expect(
      props.some((c) => c.property === 'encodingColor' && c.before === 'Sales'),
    ).toBe(true)
  })
})

describe('diffWorkbooks - ダッシュボードの追加検出（caption/size/usedFields）', () => {
  it('ダッシュボードの caption 変更を検出すること', () => {
    const before = doc({ dashboards: [dash('DB', { caption: '旧' })] })
    const after = doc({ dashboards: [dash('DB', { caption: '新' })] })
    const result = diffWorkbooks(before, after)
    expect(
      result.dashboards.changed[0]?.changes.some(
        (c) => c.property === 'caption',
      ),
    ).toBe(true)
  })

  it('サイズ（width/height）変更を size として直列化検出すること', () => {
    const before = doc({
      dashboards: [dash('DB', { width: 800, height: 600 })],
    })
    const after = doc({
      dashboards: [dash('DB', { width: 1000, height: 600 })],
    })
    const result = diffWorkbooks(before, after)
    const change = result.dashboards.changed[0]?.changes.find(
      (c) => c.property === 'size',
    )
    expect(change?.before).toBe('800×600')
    expect(change?.after).toBe('1000×600')
  })

  it('両方 undefined 同士の size は差分にしないこと', () => {
    const before = doc({ dashboards: [dash('DB', { usedFields: ['A'] })] })
    const after = doc({ dashboards: [dash('DB', { usedFields: ['A'] })] })
    const result = diffWorkbooks(before, after)
    expect(result.dashboards.changed).toHaveLength(0)
  })

  it('参照フィールド（usedFields）の増減を検出すること', () => {
    const before = doc({ dashboards: [dash('DB', { usedFields: ['A'] })] })
    const after = doc({ dashboards: [dash('DB', { usedFields: ['A', 'B'] })] })
    const result = diffWorkbooks(before, after)
    const props = result.dashboards.changed[0]?.changes ?? []
    expect(
      props.some((c) => c.property === 'usedFields' && c.after === 'B'),
    ).toBe(true)
  })
})

describe('diffWorkbooks - ダッシュボードゾーンの diff', () => {
  it('ゾーンの追加/削除を zones として検出すること', () => {
    const before = doc({
      dashboards: [dash('DB', { zones: [zone('worksheet', { name: 'S1' })] })],
    })
    const after = doc({
      dashboards: [
        dash('DB', {
          zones: [
            zone('worksheet', { name: 'S1' }),
            zone('text', { title: 'メモ' }),
          ],
        }),
      ],
    })
    const result = diffWorkbooks(before, after)
    const props = result.dashboards.changed[0]?.changes ?? []
    expect(
      props.some((c) => c.property === 'zones' && c.after === 'メモ [text]'),
    ).toBe(true)
  })

  it('kind が other のゾーンは対象外とすること', () => {
    const before = doc({ dashboards: [dash('DB', { zones: [] })] })
    const after = doc({
      dashboards: [
        dash('DB', { zones: [zone('other', { name: 'container' })] }),
      ],
    })
    const result = diffWorkbooks(before, after)
    expect(result.dashboards.changed).toHaveLength(0)
  })

  it('x/y/w/h の変化を zoneLayout として px 換算で検出すること', () => {
    const before = doc({
      dashboards: [
        dash('DB', {
          width: 1000,
          height: 1000,
          zones: [
            zone('worksheet', { name: 'S1', x: 0, y: 0, w: 50000, h: 50000 }),
          ],
        }),
      ],
    })
    const after = doc({
      dashboards: [
        dash('DB', {
          width: 1000,
          height: 1000,
          zones: [
            zone('worksheet', {
              name: 'S1',
              x: 50000,
              y: 0,
              w: 50000,
              h: 50000,
            }),
          ],
        }),
      ],
    })
    const result = diffWorkbooks(before, after)
    const change = result.dashboards.changed[0]?.changes.find(
      (c) => c.property === 'zoneLayout',
    )
    expect(change?.before).toBe('S1 [worksheet]: 0,0 500×500px')
    expect(change?.after).toBe('S1 [worksheet]: 500,0 500×500px')
  })

  it('ダッシュボードサイズが無い場合は % 換算でフォールバックすること', () => {
    const before = doc({
      dashboards: [
        dash('DB', {
          zones: [
            zone('worksheet', { name: 'S1', x: 0, y: 0, w: 50000, h: 50000 }),
          ],
        }),
      ],
    })
    const after = doc({
      dashboards: [
        dash('DB', {
          zones: [
            zone('worksheet', {
              name: 'S1',
              x: 50000,
              y: 0,
              w: 50000,
              h: 50000,
            }),
          ],
        }),
      ],
    })
    const result = diffWorkbooks(before, after)
    const change = result.dashboards.changed[0]?.changes.find(
      (c) => c.property === 'zoneLayout',
    )
    expect(change?.before).toBe('S1 [worksheet]: 0.0%,0.0% 50.0%×50.0%')
    expect(change?.after).toBe('S1 [worksheet]: 50.0%,0.0% 50.0%×50.0%')
  })

  it('同一キーのゾーンが複数ある場合は出現順で1対1対応させること', () => {
    const before = doc({
      dashboards: [
        dash('DB', {
          width: 1000,
          height: 1000,
          zones: [
            zone('worksheet', { name: 'S', x: 0, y: 0, w: 100, h: 100 }),
            zone('worksheet', { name: 'S', x: 10000, y: 0, w: 100, h: 100 }),
          ],
        }),
      ],
    })
    const after = doc({
      dashboards: [
        dash('DB', {
          width: 1000,
          height: 1000,
          zones: [
            zone('worksheet', { name: 'S', x: 0, y: 0, w: 100, h: 100 }),
            zone('worksheet', { name: 'S', x: 20000, y: 0, w: 100, h: 100 }),
          ],
        }),
      ],
    })
    const result = diffWorkbooks(before, after)
    const props = result.dashboards.changed[0]?.changes ?? []
    const layoutChanges = props.filter((c) => c.property === 'zoneLayout')
    // 2番目のゾーンだけが移動 → zoneLayout は1件
    expect(layoutChanges).toHaveLength(1)
    // 追加/削除は発生しない
    expect(props.some((c) => c.property === 'zones')).toBe(false)
  })

  it('floating / zOrder だけの変化はゾーン差分にしないこと', () => {
    const before = doc({
      dashboards: [
        dash('DB', {
          width: 1000,
          height: 1000,
          zones: [
            zone('worksheet', {
              name: 'S1',
              x: 0,
              y: 0,
              w: 100,
              h: 100,
              floating: false,
              zOrder: 1,
            }),
          ],
        }),
      ],
    })
    const after = doc({
      dashboards: [
        dash('DB', {
          width: 1000,
          height: 1000,
          zones: [
            zone('worksheet', {
              name: 'S1',
              x: 0,
              y: 0,
              w: 100,
              h: 100,
              floating: true,
              zOrder: 5,
            }),
          ],
        }),
      ],
    })
    const result = diffWorkbooks(before, after)
    expect(result.dashboards.changed).toHaveLength(0)
  })
})

describe('diffWorkbooks - 全一致', () => {
  it('同一ドキュメントでは全カテゴリが unchanged となること', () => {
    const base = doc({
      datasources: [
        {
          name: 'DS',
          caption: 'DS',
          fields: [
            field('Sales'),
            field('Calc', { isCalc: true, formula: '[Sales] * 2' }),
          ],
        },
      ],
      worksheets: [sheet('Sheet 1', { dependencies: ['Sales'] })],
      dashboards: [{ name: 'DB', worksheets: ['Sheet 1'] }],
    })
    // ディープコピーで同一内容の別インスタンスを用意
    const clone: TableauDocument = JSON.parse(JSON.stringify(base))
    const result = diffWorkbooks(base, clone)

    for (const category of [
      result.datasources,
      result.fields,
      result.worksheets,
      result.dashboards,
    ]) {
      expect(category.added).toHaveLength(0)
      expect(category.removed).toHaveLength(0)
      expect(category.changed).toHaveLength(0)
    }
    expect(result.datasources.unchangedCount).toBe(1)
    expect(result.fields.unchangedCount).toBe(2)
    expect(result.worksheets.unchangedCount).toBe(1)
    expect(result.dashboards.unchangedCount).toBe(1)
  })
})
