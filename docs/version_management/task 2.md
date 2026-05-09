# タスクリスト: バージョン管理システムの導入

- [x] UI での動的なバージョン表示
  - [x] `vite.config.ts` で `package.json` のバージョンを定義
  - [x] `ja.json` / `en.json` のバージョン表記をプレースホルダー化
  - [x] `AboutModal.tsx` でバージョンを動的に表示
- [x] リリース自動化の設定
  - [x] `standard-version` のインストール
  - [x] `package.json` に `release` スクリプトを追加
- [x] 検証
  - [x] UI でバージョンが正しく表示されることを確認
  - [x] `npm run release -- --dry-run` で動作確認
