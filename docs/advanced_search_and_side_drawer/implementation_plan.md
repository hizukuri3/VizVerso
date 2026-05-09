# 高度な検索機能とサイドペイン詳細表示の実装計画

## 目的
Verso-viz の操作性を向上させるため、計算フィールドの依存関係を考慮した検索機能と、詳細情報を即座に確認できるサイドドロワーを実装します。

## ユーザーレビューが必要な事項
- **URLパラメータの形式**: `?type=datasource&id=DS_NAME&field=FIELD_NAME&q=QUERY` のような形式を想定していますが、既存のルーティング要件があれば調整します。
- **ハイライトの色使い**: 計算式内の関数、フィールド名、検索キーワードのハイライト色について、現在のデザインシステム（Blue/Slate）に合わせた配色を提案します。

## Proposed Changes

### 1. 検索エンジンと依存関係解析の強化
#### [MODIFY] [useSearch.ts](file:///Users/hizukuri/Documents/workspace/Tableau/src/hooks/useSearch.ts)
- あいまい検索（Fuzzy Search）の精度向上。
- フィールドがどのデータソースに属しているかの情報を検索結果に確実に含める。
- 依存関係のインデックス作成ロジックを抽出し、他コンポーネントからも利用可能にする（`useDependencyIndex` フックの作成検討）。

### 2. URLパラメータによる状態制御
#### [MODIFY] [App.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/App.tsx)
- `window.location.search` を監視し、`targetField` や `q` パラメータがある場合に自動で対象のデータソースを選択し、詳細ペインを開くロジックを追加。
- 検索結果クリック時に URL を更新する処理を追加。

### 3. サイドドロワー（Side Drawer）コンポーネント
#### [NEW] [SideDrawer.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/SideDrawer.tsx)
- 右側からスライドインするコンポーネント。
- 計算式の表示（シンタックスハイライト付き）。
- 検索キーワードの強調表示と自動スクロール。
- 「参照元（Upstream）」と「参照先（Downstream）」のリンク表示と遷移機能。

### 4. 計算式ハイライター
#### [NEW] [FormulaHighlighter.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/FormulaHighlighter.tsx)
- Tableau の計算式を解析し、関数（SUM, IF等）やフィールド名（[Field]）を色分けして表示するコンポーネント。
- 指定されたキーワードを強力にハイライトする機能。

### 5. UI/UX の統合とブラッシュアップ
#### [MODIFY] [SearchResultsList.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/SearchResultsList.tsx)
- クリック時の挙動を「URLパラメータ付与 + 遷移」に変更。
#### [MODIFY] [DetailView.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/DetailView.tsx)
- 詳細表示エリアに Side Drawer を統合。
- サイドドロワーが開いている間、メイン画面の該当バッジ（Pill）を強調表示するスタイル制御。

## 完了定義 (Definition of Done)
1. ヘッダーの検索窓から計算フィールド名や計算式の内容で検索できる。
2. 検索結果をクリックすると、対象 of データソース画面へ遷移し、右側から詳細ペインが自動で開く。
3. 詳細ペイン内で計算式がハイライトされ、検索語が強調されている。
4. 詳細ペインから「参照元」「参照先」のフィールドへクリックで移動できる。
5. 言語リソース（ja.json/en.json）に新しい文言が追加されている。

## 検証計画
### 自動テスト
- `useSearch` のテスト: 計算式内の依存関係が正しくヒットするか。
- `FormulaHighlighter` のテスト: 正しくトークン分割され、ハイライト用のタグが付与されるか。

### 手動検証
- 検索実行 -> 結果クリック -> 自動遷移 & ペイン展開 の一連のフローを確認。
- サイドペイン内のリンクをクリックし、ドリルダウンができることを確認。
- レスポンシブ対応（モバイル等でのドロワーの挙動）の確認。
