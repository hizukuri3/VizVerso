# バージョン管理システムの導入計画

アプリケーションのバージョン管理を効率化し、リリース時にバージョン情報を簡単に更新・確認できるようにします。

## ユーザーレビューが必要な項目

- `standard-version` の導入により、`npm run release` を実行すると自動的に `package.json` のバージョンが上がり、`CHANGELOG.md` が生成されます。この運用で問題ないか確認してください。

## 提案される変更

### UI での動的なバージョン表示

#### [MODIFY] [vite.config.ts](file:///Users/hizukuri/Documents/workspace/Tableau/vite.config.ts)

- `package.json` からバージョン情報を読み込み、グローバル定数 `import.meta.env.VITE_APP_VERSION` として定義します。

#### [MODIFY] [ja.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/ja.json) / [en.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/en.json)

- ハードコードされているバージョン番号をプレースホルダー（例: `{{version}}`）に置き換えます。

#### [MODIFY] [AboutModal.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/AboutModal.tsx)

- 翻訳時に現在のバージョン番号を渡すように修正します。

---

### リリース自動化

#### [MODIFY] [package.json](file:///Users/hizukuri/Documents/workspace/Tableau/package.json)

- `standard-version` を `devDependencies` に追加します。
- `npm run release` スクリプトを追加します。

## 検証計画

### 自動テスト

- `npm run test` が正常に終了することを確認します。

### 手動確認

- 「About」モーダルを開き、表示されるバージョンが `package.json` のものと一致しているか確認します。
- `npm run release -- --dry-run` を実行し、バージョンが正しく更新されるシミュレーションを確認します。
