# リリース前最終検証に伴う修正計画

## 監査結果概要

実装された新機能に対し、静的解析およびシミュレーションを実施した結果、以下の2件の改善が必要と判断されました。

1.  **セキュリティ（正規表現インジェクション）**:
    - `FormulaHighlighter` において、ユーザー入力（検索クエリ）がエスケープされずに `new RegExp()` に渡されているため、特殊文字（`[` など）の入力によりアプリケーションがクラッシュする脆弱性があります。
2.  **パフォーマンス（検索の入力遅延）**:
    - 検索実行にデバウンス処理がないため、大規模なドキュメントにおいて入力ごとの再計算負荷（Jank）が発生するリスクがあります。

## 修正内容

### [FormulaHighlighter.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/FormulaHighlighter.tsx)

- `searchQuery` を `new RegExp` に渡す前に、正規表現の特殊文字をエスケープする処理を追加します。

### [App.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/App.tsx)

- 検索クエリの入力に対してデバウンス処理を導入し、検索ロジック（`useSearch`）への負荷を軽減します。
- 具体的には、`debouncedSearchQuery` ステートを追加し、300msの遅延後に更新するようにします。

## 検証プラン

### 自動テスト

- `FormulaHighlighter` に特殊文字を入力し、クラッシュしないことを確認。
- 検索入力が即座に `useSearch` をトリガーせず、一定時間後に実行されることを確認。

### 手動確認

- 検索ボックスに `[` や `(` を入力し、計算式表示エリアでエラーが発生しないか確認。
- 検索結果の表示がスムーズであることを確認。
