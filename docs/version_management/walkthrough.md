# 修正内容の確認 (Walkthrough)

アプリケーションにバージョン管理システムを導入しました。これにより、リリース時のバージョン更新と UI への反映が自動化されます。

## 変更内容

### 1. UI での動的なバージョン表示
`package.json` の `version` フィールドを UI（About モーダル）に自動的に反映するようにしました。

- **[vite.config.ts](file:///Users/hizukuri/Documents/workspace/Tableau/vite.config.ts)**: ビルド時に `import.meta.env.VITE_APP_VERSION` としてバージョンを公開するように設定しました。
- **[AboutModal.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/AboutModal.tsx)**: 翻訳ファイルに動的にバージョンを渡すように修正しました。
- **ロケールファイル ([ja.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/ja.json) / [en.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/en.json))**: ハードコードされていたバージョン番号をプレースホルダー `{{version}}` に置き換えました。

### 2. リリース自動化の導入
`standard-version` を導入し、リリース作業（バージョンアップ、チャンジログ生成、Git タグ作成）を自動化しました。

- **[package.json](file:///Users/hizukuri/Documents/workspace/Tableau/package.json)**:
    - `standard-version` を `devDependencies` に追加。
    - `npm run release` スクリプトを追加。

## 検証結果

### バージョン表示の確認
「About」モーダルを開き、表示されるバージョンが `package.json` の内容（現在は `0.0.0`）と一致していることを確認しました。

### リリーススクリプトの動作確認
`npm run release -- --dry-run` を実行し、以下の動作が正常に行われることをシミュレーションで確認しました。
- `package.json` のバージョンアップ
- `CHANGELOG.md` の自動生成/更新
- Git タグの作成

## リリース方法
今後リリースを行う際は、以下のコマンドを実行してください：

```bash
npm run release
```

> [!NOTE]
> コミットメッセージが [Conventional Commits](https://www.conventionalcommits.org/) に準拠している場合、変更内容に基づき適切なバージョン（Major/Minor/Patch）が自動的に選択されます。
