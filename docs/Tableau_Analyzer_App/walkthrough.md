# シート名抽出不具合の修正および水平展開完了

「Annotations Button: Inactive」などのコロンを含むシート名が「Inactive」と誤って短縮される不具合を修正しました。また、UI表示やExcel出力においても同様の現象が発生しないよう水平展開を行いました。

## 修正内容

### 1. 根本原因の修正 (`src/utils/xmlParser.ts`)

- **問題**: `strip` 関数が、すべての名称に対して「集計関数」や「型識別子」を除去するロジック（コロンで分割して最後を取る）を適用していました。
- **修正**:
  - `stripBrackets`: 括弧 `[]` を取り除くだけの関数を作成し、シート名やダッシュボード名などに使用。
  - `stripFieldRef`: 計算式などのフィールド参照用に、集計・型除去を行う関数として分離。
- **効果**: シート名に含まれるコロンが保持されるようになりました。

### 2. 表示ロジックの修正 (`src/components/DetailView.tsx`)

- **問題**: UI上の表示用クレンジングでも、コロン以降を抽出する処理がありました。
- **修正**: コロン以降を抽出する処理を「末尾が型識別子（`:qk` 等）である場合」のみに制限しました。

### 3. Excel出力の修正 (`src/utils/excelExporter.ts`)

- **問題**: Excel出力時のフィールド名解決ロジックでも同様の問題がありました。
- **修正**: 上記と同様、型識別子を確認する堅牢なロジックに更新しました。

## 検証結果

### 自動テスト

- `src/utils/xmlParser.test.ts` に「コロンを含むシート名」のテストケースを追加し、正常にパスすることを確認しました。
  - `worksheet name="Annotations Button: Inactive"` → `Annotations Button: Inactive` (OK)
  - `dashboard name="Main: Dash"` → `Main: Dash` (OK)

### 手動確認

- `Sample.twbx` の解析において、「Annotations Button: Inactive」が正しく表示・出力されるようになっていることを確認しました。
