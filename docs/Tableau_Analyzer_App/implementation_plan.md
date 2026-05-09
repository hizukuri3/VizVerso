# シート名抽出不具合の修正（水平展開含む）

## 現状と原因
`src/utils/xmlParser.ts` 内の `strip` 関数が、名前の中にコロン `:` が含まれている場合に「集計関数（sum:等）」や「型識別子（:qk等）」と誤認して、コロン以降のみを抽出してしまっています。
シート名（`worksheet name`, `dashboard name`, `zone name`）は、フィールド参照（`[Field]:qk` 等）とは異なり、このような短縮処理を行ってはいけません。

## 修正方針

### 1. `src/utils/xmlParser.ts` の修正
- `strip` 関数を以下の2つに分離、または用途に応じて処理を切り替えます。
  - `stripBrackets(name: string)`: `[]` を取り除くだけの処理。シート名、ダッシュボード名、データソース名に使用。
  - `stripFieldRef(name: string)`: `[]` の除去に加え、コロンによる集計・型の除去も行う。フィールド参照の解析に使用。
- 各パース箇所で適切な関数を呼び出すように修正します。

### 2. `src/components/DetailView.tsx` の確認と修正
- `DetailView.tsx` 内の `getCaption` や `getFieldInfo > clean` においても、同様にシート名に対して過度なクレンジングが行われていないか確認し、必要であれば修正します。

### 3. 水平展開（他の不具合の防止）
- パラメータ名やデータソース名など、コロンを含みうる「実体名」のパース箇所をすべて点検します。
- テストコードにコロンを含むシート名のケースを追加し、再発を防止します。

## 変更ファイル

### [MODIFY] [xmlParser.ts](file:///Users/hizukuri/Documents/workspace/Tableau/src/utils/xmlParser.ts)
- `strip` 関数の見直しと、各呼び出し箇所の修正。

### [MODIFY] [DetailView.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/DetailView.tsx)
- UI表示時のフィルタリングロジックの修正。

## 検証計画

### 自動テスト
- `xmlParser.test.ts` に「コロンを含むシート名」のテストケースを追加。
- 既存のテストが壊れていないことを確認。

### 手動確認
- `Sample.twbx` を読み込み、「Annotations Button: Inactive」が正しく表示されることを確認。
