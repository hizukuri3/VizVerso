import { describe, it, expect } from 'vitest'
import { parseTableauXml } from './xmlParser'

const dummyXml = `<?xml version='1.0' encoding='utf-8' ?>
<workbook>
  <datasources>
    <datasource caption="Sample Data" name="ds1">
      <column caption="Profit Ratio" name="[Calculation_123]">
        <calculation class="tableau" formula="[Sales] / [Profit]" />
      </column>
    </datasource>
  </datasources>
  <worksheets>
    <worksheet name="Sales Sheet">
      <table>
        <view>
          <datasource-dependencies datasource="ds1">
            <column name="[Calculation_123]" />
          </datasource-dependencies>
        </view>
      </table>
    </worksheet>
  </worksheets>
  <dashboards>
    <dashboard name="Main Dashboard">
      <zones>
        <zone name="Sales Sheet" type="worksheet" />
      </zones>
    </dashboard>
  </dashboards>
</workbook>
`

describe('xmlParser - parseTableauXml', () => {
  it('ダッシュボードに含まれるシート構成を抽出できること', () => {
    const result = parseTableauXml(dummyXml)
    expect(result.dashboards).toHaveLength(1)
    expect(result.dashboards[0].name).toBe('Main Dashboard')
    expect(result.dashboards[0].worksheets).toContain('Sales Sheet')
  })

  it('シートと依存フィールドを抽出できること', () => {
    const result = parseTableauXml(dummyXml)
    expect(result.worksheets).toHaveLength(1)
    expect(result.worksheets[0].name).toBe('Sales Sheet')
    expect(result.worksheets[0].dependencies).toContain('Calculation_123')
  })

  it('データソースからフィールドを抽出できること', () => {
    const result = parseTableauXml(dummyXml)
    expect(result.datasources).toHaveLength(1)
    expect(result.datasources[0].name).toBe('ds1')
    expect(result.datasources[0].fields).toHaveLength(1)
    expect(result.datasources[0].fields[0].column).toBe('Calculation_123')
    expect(result.datasources[0].fields[0].formula).toBe('[Sales] / [Profit]')
  })

  it('ネストされたゾーン構造からワークシートを再帰的に抽出できること', () => {
    const complexDbXml = `
    <workbook>
      <worksheets>
        <worksheet name="Sheet In Nest" />
      </worksheets>
      <dashboards>
        <dashboard name="Nested DB">
          <zones>
            <zone type="layout-basic">
              <zones>
                <zone name="Sheet In Nest" type="worksheet" />
              </zones>
            </zone>
          </zones>
        </dashboard>
      </dashboards>
    </workbook>`
    const result = parseTableauXml(complexDbXml)
    expect(result.dashboards[0].worksheets).toContain('Sheet In Nest')
  })

  it('空のワークブックをパースしてもクラッシュせず空のデータを返すこと', () => {
    const emptyXml = `<workbook></workbook>`
    const result = parseTableauXml(emptyXml)
    expect(result.datasources).toEqual([])
    expect(result.worksheets).toEqual([])
    expect(result.dashboards).toEqual([])
  })

  it('XXE攻撃などの悪意のある実体参照を含むXMLでもクラッシュしないこと（または安全にパースされること）', () => {
    // ブラウザのDOMParserはデフォルトでXXEに対して安全だが、念のためテストする
    const maliciousXml = `<?xml version="1.0"?>
    <!DOCTYPE foo [
      <!ENTITY xxe SYSTEM "file:///etc/passwd">
    ]>
    <workbook><test>&xxe;</test></workbook>`

    const result = parseTableauXml(maliciousXml)
    // 抽出エラーにならない、または安全に空データが返ることを期待
    expect(result.dashboards).toEqual([])
  })
  it('コロンを含むシート名が正しく抽出されること', () => {
    const colonXml = `
    <workbook>
      <worksheets>
        <worksheet name="Annotations Button: Inactive" />
      </worksheets>
      <dashboards>
        <dashboard name="Main: Dash">
          <zones>
            <zone name="Annotations Button: Inactive" />
          </zones>
        </dashboard>
      </dashboards>
    </workbook>`
    const result = parseTableauXml(colonXml)
    expect(result.worksheets[0].name).toBe('Annotations Button: Inactive')
    expect(result.dashboards[0].name).toBe('Main: Dash')
    expect(result.dashboards[0].worksheets).toContain(
      'Annotations Button: Inactive',
    )
  })

  it('複雑なフィールドIDの正規化と計算式の復号が正しく行われること', () => {
    const complexXml = `
    <workbook>
      <datasources>
        <datasource name="ds1">
          <column caption="My Field" name="[excel-direct.456].[sum:Calculation_ABC:qk]">
            <calculation class="tableau" formula="[A] &gt; [B] &amp;&#x20;[C]&#x0D;" />
          </column>
        </datasource>
      </datasources>
    </workbook>`
    const result = parseTableauXml(complexXml)
    const field = result.datasources[0].fields[0]
    // excel-direct. や sum:, :qk が除去され、Calculation_ABC になることを確認
    expect(field.column).toBe('Calculation_ABC')
    // エンティティ復号確認 (&#x20; はスペース, &#x0D; はCR(除去対象))
    expect(field.formula).toBe('[A] > [B] & [C]')
  })

  it('column-instance からの依存関係が正規化されて抽出されること', () => {
    const ciXml = `
    <workbook>
      <worksheets>
        <worksheet name="CI Sheet">
          <table>
            <view>
              <datasource-dependencies datasource="ds1">
                <column-instance name="[none:Sales:nk]" column="[Sales]" derivation="none" />
                <column name="[Profit]" />
              </datasource-dependencies>
            </view>
          </table>
        </worksheet>
      </worksheets>
    </workbook>`
    const result = parseTableauXml(ciXml)
    // none:Sales:nk は Sales に正規化されるため、dependencies には Sales が含まれる
    expect(result.worksheets[0].dependencies).toContain('Sales')
    expect(result.worksheets[0].dependencies).toContain('Profit')
  })
})
