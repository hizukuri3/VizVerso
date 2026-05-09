# データソース・パラメータ表示のアップグレード計画

現在のデータソース表示では、パラメータも通常のフィールドと同様に「計算式」と「標準フィールド」として表示されています。
しかし、パラメータは本質的にユーザー定義の定数であり、選択可能な「リスト」や「範囲」を持っています。
これらを正確に解析・表示するようにアップグレードします。

## ユーザーレビューが必要な事項
- パラメータのリスト表示における「別名（エイリアス）」と「実際の値」の表示形式。
- 範囲指定（最小・最大・ステップ）の表示レイアウト。

## 変更内容

### 1. 型定義の拡張
#### [MODIFY] [tableau.ts](file:///Users/hizukuri/Documents/workspace/Tableau/src/types/tableau.ts)
`TableauField` インターフェースに、パラメータ情報を保持するためのフィールドを追加します。
- `paramDomainType`: 'list' | 'range' | 'any'
- `paramMembers`: `{ value: string; alias?: string }[]`
- `paramRange`: `{ min?: string; max?: string; step?: string }`

### 2. XMLパーサーの強化
#### [MODIFY] [xmlParser.ts](file:///Users/hizukuri/Documents/workspace/Tableau/src/utils/xmlParser.ts)
`parseTableauXml` 関数内で、`<column>` タグから以下の情報を抽出するように修正します。
- `param-domain-type` 属性。
- `<members>` タグ内の各 `<member>`（リスト形式の場合）。
- `<range>` タグ（範囲形式の場合）。

### 3. UIの改善 (DetailView)
#### [MODIFY] [DetailView.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/DetailView.tsx)
データソースが "Parameters" の場合、特別なレイアウトを適用します。
- 「計算フィールド」「標準フィールド」の分離をやめ、「パラメータ」として一括表示。
- 各パラメータのカード内で、その設定（リストまたは範囲）を視覚的に表示。

### 4. 詳細ドロワーの改善 (SideDrawer)
#### [MODIFY] [SideDrawer.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/SideDrawer.tsx)
フィールドがパラメータである場合、その設定詳細を表示するセクションを追加します。

### 5. 多言語対応
#### [MODIFY] [ja.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/ja.json) / [en.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/en.json)
「パラメータ設定」「リスト」「範囲」「最小」「最大」「ステップ」などの新規用語を追加します。

## 検証計画

### 自動テスト
- パーサーのテストコードに、リストおよび範囲を持つパラメータのXMLサンプルを追加し、正しくパースされることを確認。

### 手動検証
1. パラメータを含む Tableau ワークブック (.twbx) をアップロード。
2. データソース一覧から「Parameters」を選択。
3. リスト値や範囲の設定が正しく表示されていることを確認。
4. 各パラメータをクリックし、詳細ドロワーでも設定が確認できることを検証。
