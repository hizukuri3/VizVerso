# Cloudflare デプロイ準備（main ブランチへのマージ）

現在の開発内容を本番環境（Cloudflare Pages など）で公開可能な状態にするため、`feature/twbx-parser` ブランチを `main` ブランチに統合し、GitHub にプッシュします。

## 実施内容

### 1. main ブランチへのマージ

- ローカルの `main` ブランチに切り替え、`feature/twbx-parser` をマージします。
- マージ後、`main` ブランチを GitHub にプッシュします。

### 2. Cloudflare Pages の設定案内

Cloudflare Pages でデプロイ設定を行う際の推奨値は以下の通りです：

- **フレームワーク プリセット**: `Vite`
- **ビルドコマンド**: `npm run build`
- **ビルド出力ディレクトリ**: `dist`

## 変更ファイル（マージ対象）

- プロジェクト全般の修正（UI, ロジック, ドキュメント等）

## 検証計画

### 手動確認

- `git branch` で `main` ブランチが最新であることを確認。
- ローカルで `npm run build` が正常に終了することを確認。
