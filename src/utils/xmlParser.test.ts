import { describe, it, expect } from 'vitest'
import { parseTableauXml, normalizeFieldId } from './xmlParser'

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
    // Measure Names 等の組み込み疑似フィールドが自動補完されるため、
    // 実フィールドを名前で特定して検証する
    const field = result.datasources[0].fields.find(
      (f) => f.column === 'Calculation_123',
    )
    expect(field?.formula).toBe('[Sales] / [Profit]')
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

  it('ダッシュボードの zone レイアウト（座標・種別・ラベル）を抽出できること', () => {
    const layoutXml = `
    <workbook>
      <worksheets>
        <worksheet name="Sales Map" />
      </worksheets>
      <dashboards>
        <dashboard name="Layout Dash">
          <zones>
            <zone h='6510' id='1' type='text' w='100000' x='0' y='0'>
              <formatted-text>
                <run fontsize='15'>Dashboard Title</run>
              </formatted-text>
            </zone>
            <zone h='19531' id='11' name='Sales Map' w='20020' x='0' y='22786' />
            <zone custom-title='true' h='6510' id='14' mode='compact' param='[Parameters].[Region]' type='paramctrl' w='17090' x='41504' y='9766'>
              <formatted-text>
                <run fontsize='10'>SELECT REGION</run>
              </formatted-text>
            </zone>
            <zone h='4557' id='17' param='Image/Logo.png' type='bitmap' w='5762' x='93750' y='94401' />
          </zones>
        </dashboard>
      </dashboards>
    </workbook>`
    const result = parseTableauXml(layoutXml)
    const zones = result.dashboards[0].zones
    expect(zones).toHaveLength(4)

    const ws = zones?.find((z) => z.kind === 'worksheet')
    expect(ws?.name).toBe('Sales Map')
    expect(ws).toMatchObject({ x: 0, y: 22786, w: 20020, h: 19531 })

    const text = zones?.find((z) => z.kind === 'text')
    expect(text?.title).toBe('Dashboard Title')

    const param = zones?.find((z) => z.kind === 'paramctrl')
    expect(param?.title).toBe('SELECT REGION')

    const image = zones?.find((z) => z.kind === 'image')
    expect(image?.param).toBe('Image/Logo.png')
  })

  it('座標を持たない純レイアウトコンテナは zone レイアウトに含めず、子ゾーンだけ拾うこと', () => {
    const nestedXml = `
    <workbook>
      <worksheets>
        <worksheet name="Inner Sheet" />
      </worksheets>
      <dashboards>
        <dashboard name="Nested Layout">
          <zones>
            <zone type="layout-basic">
              <zones>
                <zone h='50000' id='9' name='Inner Sheet' w='50000' x='0' y='0' />
              </zones>
            </zone>
          </zones>
        </dashboard>
      </dashboards>
    </workbook>`
    const result = parseTableauXml(nestedXml)
    const zones = result.dashboards[0].zones
    expect(zones).toHaveLength(1)
    expect(zones?.[0]).toMatchObject({
      kind: 'worksheet',
      name: 'Inner Sheet',
    })
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

  it('グループフィールド（<group>）がデータソースのフィールドとして抽出されること', () => {
    const groupXml = `
    <workbook>
      <datasources>
        <datasource name="ds1">
          <column name="[Sales]" datatype="real" role="measure" type="quantitative" />
          <group caption='アクション (_TRUE)' hidden='true' name='[Action (_TRUE)]' name-style='unqualified'>
            <groupfilter function='crossjoin'>
              <groupfilter function='level-members' level='[Sales]' />
            </groupfilter>
          </group>
        </datasource>
      </datasources>
    </workbook>`
    const result = parseTableauXml(groupXml)
    const group = result.datasources[0].fields.find(
      (f) => f.column === 'Action (_TRUE)',
    )
    expect(group).toBeDefined()
    expect(group?.caption).toBe('アクション (_TRUE)')
  })

  it('組み込み疑似フィールド（Measure Names 等）が自動補完されること', () => {
    const result = parseTableauXml(dummyXml)
    const columns = result.datasources[0].fields.map((f) => f.column)
    expect(columns).toContain('Measure Names')
    expect(columns).toContain('Measure Values')
    expect(columns).toContain('Latitude (generated)')
    expect(columns).toContain('Longitude (generated)')
    expect(columns).toContain('Multiple Values')
  })

  it('3セグメントの棚参照から幻の依存関係（名前空間）が生成されないこと', () => {
    const threeSegXml = `
    <workbook>
      <worksheets>
        <worksheet name="TS Sheet">
          <table>
            <rows>[federated.abc123].[__tableau_internal_object_id__].[cnt:Foo.csv_ABC:qk]</rows>
            <cols>[federated.abc123].[sum:Sales:qk]</cols>
          </table>
        </worksheet>
      </worksheets>
    </workbook>`
    const result = parseTableauXml(threeSegXml)
    const deps = result.worksheets[0].dependencies
    expect(deps).not.toContain('__tableau_internal_object_id__')
    // 最終セグメント（実在するテーブルオブジェクト列）は解決される
    expect(deps).toContain('Foo.csv_ABC')
    expect(deps).toContain('Sales')
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

describe('xmlParser - マークカードのエンコーディング', () => {
  const encXml = `
  <workbook>
    <worksheets>
      <worksheet name="Enc Sheet">
        <table>
          <panes>
            <pane>
              <mark class="Shape" />
              <encodings>
                <text column="[federated.abc].[sum:Sales:qk]" />
                <tooltip column="[federated.abc].[none:Region:nk]" />
                <shape column="[federated.abc].[none:Category:nk]" />
                <color column="[federated.abc].[none:Segment:nk]" />
              </encodings>
            </pane>
          </panes>
        </table>
      </worksheet>
    </worksheets>
  </workbook>`

  it('tooltip のフィールドが label バケットに混入しないこと', () => {
    const result = parseTableauXml(encXml)
    const marks = result.worksheets[0].shelf!.marks
    // label には text 由来の1件のみ
    expect(marks.encodings.label).toHaveLength(1)
    expect(marks.encodings.label[0].name).toContain('Sales')
    // tooltip は tooltip バケットにのみ入る
    expect(marks.encodings.tooltip).toHaveLength(1)
    expect(marks.encodings.tooltip[0].name).toContain('Region')
  })

  it('shape エンコーディングが抽出されること', () => {
    const result = parseTableauXml(encXml)
    const marks = result.worksheets[0].shelf!.marks
    expect(marks.encodings.shape).toHaveLength(1)
    expect(marks.encodings.shape[0].name).toContain('Category')
  })
})

describe('xmlParser - ダッシュボードのフィールド使用', () => {
  it('パラメータコントロールと動的ゾーン表示のフィールド参照が usedFields に抽出されること', () => {
    const dbXml = `
    <workbook>
      <dashboards>
        <dashboard name="Dashboard 1">
          <zones>
            <zone id="1" name="Sheet A">
              <zone id="27" mode="list" param="[Parameters].[パラメーター 1]" type-v2="paramctrl" />
              <zone id="28" name="Sheet B">
                <visibility>
                  <single-value-field-node fieldname="[federated.abc].[isShowPage1 (コピー)_123]" />
                </visibility>
              </zone>
            </zone>
          </zones>
        </dashboard>
      </dashboards>
    </workbook>`
    const result = parseTableauXml(dbXml)
    const db = result.dashboards[0]
    expect(db.usedFields).toContain('パラメーター 1')
    expect(db.usedFields).toContain('isShowPage1 (コピー)_123')
  })

  it('type-v2 のフィルター/凡例はワークシートではなく正しい種別に分類され、レイアウトコンテナは描画対象外・浮動が判定されること', () => {
    // Tableau 実ファイルの構造: <zones> 直下の先頭がタイル配置のコンテナ、
    // 以降の兄弟が浮動オブジェクト。フィルタ/凡例は name を持つが type-v2 で分類する。
    const dbXml = `
    <workbook>
      <dashboards>
        <dashboard name="Dashboard 1">
          <zones>
            <zone id="4" type-v2="layout-basic" x="0" y="0" w="100000" h="100000">
              <zone id="32" name="Map" x="0" y="0" w="100000" h="100000" />
            </zone>
            <zone id="39" type-v2="text" x="1000" y="2000" w="45000" h="10000" />
            <zone id="46" name="Map" type-v2="filter" param="[federated.abc].[Region]" x="83000" y="95000" w="15000" h="3000" />
            <zone id="36" name="Map" type-v2="color" param="[federated.abc].[Sales]" x="44000" y="86000" w="17000" h="5000" />
          </zones>
        </dashboard>
      </dashboards>
    </workbook>`
    const zones = parseTableauXml(dbXml).dashboards[0].zones!
    const byId = (id: string) => zones.find((z) => z.id === id)!

    // レイアウトコンテナ（id=4）自体は描画対象外
    expect(byId('4')).toBeUndefined()

    // タイル配置のワークシートは floating=false（基盤レイヤー）
    expect(byId('32').kind).toBe('worksheet')
    expect(byId('32').floating).toBe(false)

    // フィルタ/凡例は name を持っていてもワークシートに誤分類しない
    expect(byId('46').kind).toBe('filter')
    expect(byId('36').kind).toBe('legend')

    // コンテナ外の zone は浮動、ドキュメント順が zOrder に入る
    expect(byId('39').floating).toBe(true)
    expect(byId('46').floating).toBe(true)
    expect(byId('32').zOrder).toBeLessThan(byId('46').zOrder!)
  })

  it('テキストオブジェクトの複数 run が全て連結され、Æ 改行マーカーが除去されること', () => {
    // 実ファイルではテキストが複数 run に分割され、語間の空白は run 末尾に入る。
    // 最初の run だけだと "The Golden" が "The" になり文言が欠ける。
    const dbXml = `
    <workbook>
      <dashboards>
        <dashboard name="Dashboard 1">
          <zones>
            <zone id="4" type-v2="layout-basic" x="0" y="0" w="100000" h="100000">
              <zone id="1" name="Map" x="0" y="0" w="100000" h="100000" />
            </zone>
            <zone id="39" type-v2="text" x="1000" y="2000" w="45000" h="10000">
              <formatted-text>
                <run fontsize="10">The </run>
                <run fontsize="10">Golden</run>
              </formatted-text>
            </zone>
            <zone id="49" type-v2="text" x="1000" y="5000" w="20000" h="13000">
              <formatted-text>
                <run>Data:</run>
                <run>Æ&#10;&#10;</run>
                <run>Created by @user</run>
              </formatted-text>
            </zone>
          </zones>
        </dashboard>
      </dashboards>
    </workbook>`
    const zones = parseTableauXml(dbXml).dashboards[0].zones!
    const byId = (id: string) => zones.find((z) => z.id === id)!
    // 全 run が語間空白を保って連結される
    expect(byId('39').title).toBe('The Golden')
    // Æ 改行マーカーは除去し、改行は 1 スペースにまとめる
    expect(byId('49').title).toBe('Data: Created by @user')
  })

  it('datagraph（動的ゾーン表示）のフィールド参照が document.usedFields に抽出されること', () => {
    const dgXml = `
    <workbook>
      <worksheets>
        <worksheet name="Sheet 1"><table><rows /></table></worksheet>
      </worksheets>
      <datagraph>
        <graph>
          <nodes>
            <single-value-field-node fieldname="[federated.abc].[isShowPage2 (コピー)_456]" node-guid="x" />
            <dashboard-zone-visibility-node dashboard-identifier="{GUID}" node-guid="y" />
          </nodes>
        </graph>
      </datagraph>
    </workbook>`
    const result = parseTableauXml(dgXml)
    expect(result.usedFields).toContain('isShowPage2 (コピー)_456')
  })
})

describe('xmlParser - normalizeFieldId', () => {
  it('ピルの複製インスタンス番号（:4 等）が除去されること', () => {
    expect(normalizeFieldId('[usr:Calculation_123:qk:4]')).toBe(
      'Calculation_123',
    )
  })

  it('空のロールセグメント（[:Measure Names]）が除去されること', () => {
    expect(normalizeFieldId('[:Measure Names]')).toBe('Measure Names')
  })

  it('日付切り捨て・日付パーツのプレフィックスが除去されること', () => {
    expect(normalizeFieldId('[tmn:Order Date:ok]')).toBe('Order Date')
    expect(normalizeFieldId('[yr:Order Date:ok]')).toBe('Order Date')
  })

  it('セットの IN/OUT プレフィックス（io:）が除去されること', () => {
    expect(normalizeFieldId('[io:Category セット:nk]')).toBe('Category セット')
  })

  it('テーブル計算プレフィックス（diff/pcto/ctd 等）が除去されること', () => {
    expect(normalizeFieldId('[diff:sum:Sales:qk:2]')).toBe('Sales')
    expect(normalizeFieldId('[pcto:sum:Female:qk]')).toBe('Female')
    expect(normalizeFieldId('[ctd:Customer ID:qk]')).toBe('Customer ID')
  })

  it('__tableau_internal_object_id__（名前空間）は空文字になること', () => {
    expect(normalizeFieldId('[__tableau_internal_object_id__]')).toBe('')
  })
})
