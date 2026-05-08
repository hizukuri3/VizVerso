# 実装計画: プロジェクト「Verso-viz」へのリブランディング

## 概要
プロジェクト名称を「Verso-viz」に統一し、公開に向けたデザインの最適化、README の作成、および最終的なビルド確認を行います。

## 変更内容

### 1. 名称の統一
- [ ] **package.json**: `name` を `verso-viz` に更新。
- [ ] **index.html**: `<title>` を `Verso-viz` に更新。
- [ ] **UI コンポーネント**: ヘッダー等に表示されているプロジェクト名を `Verso-viz` に更新。
  - `src/App.tsx` または `src/components/Header.tsx` (存在する場合) を確認。
- [ ] **その他**: `document.title` を動的に変更している箇所があれば更新。

### 2. README.md の作成
- [ ] プロジェクトルートに `README.md` を作成。
- [ ] 日本語と英語の併記でコンセプトを記述。
  - 日本語: 「Tableauの裏側を覗き、その構造とロジックを解明するための twbx 解析ツール」
  - 英語: 「A twbx analysis tool for peeking into the backend of Tableau and unraveling its structure and logic.」

### 3. ビルド確認
- [ ] `npm run build` を実行し、Cloudflare Pages 等へのデプロイに向けたビルドエラーがないか最終確認。

## 検証計画
- ブラウザで表示を確認し、タイトルやロゴが「Verso-viz」になっていることを確認。
- ビルドが正常に完了することを確認。
