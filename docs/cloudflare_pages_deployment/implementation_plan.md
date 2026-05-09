# Cloudflare Pages デプロイ最適化と CI/CD 構築計画

VizVerso を Cloudflare Pages へデプロイし、パフォーマンスとセキュリティを最大化するための設定および自動化パイプラインを構築します。

## User Review Required

> [!IMPORTANT]
>
> - **Cloudflare API Token**: GitHub Actions からデプロイするために、Cloudflare の `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を GitHub の Repository Secrets に設定する必要があります。
> - **Content Security Policy (CSP)**: アプリケーションの動作に必要な最小限の権限を設定しますが、インラインスクリプトや外部リソースの利用状況に応じて調整が必要になる場合があります。

## 実施内容

### 1. セキュリティとパフォーマンスの最適化 (`_headers`)

Cloudflare Pages で利用される `_headers` ファイルを作成し、セキュリティヘッダーとキャッシュ戦略を定義します。

### 2. デプロイ自動化ワークフロー (`deploy.yml`)

GitHub に Push された際、自動的にビルドと Cloudflare Pages へのデプロイを実行するワークフローを作成します。

### 3. デプロイ手順書の作成

Cloudflare ダッシュボード上での初期設定手順をまとめます。

---

## 変更予定のファイル

### [Cloudflare / Deployment]

#### [NEW] [\_headers](file:///Users/hizukuri/Documents/workspace/Tableau/public/_headers)

- HSTS, CSP, X-Frame-Options などのセキュリティヘッダーを設定。
- `public` フォルダに配置することで、ビルド時に `dist/_headers` として出力されます。

#### [NEW] [wrangler.toml](file:///Users/hizukuri/Documents/workspace/Tableau/wrangler.toml)

- Cloudflare Pages のビルド設定（コマンド、出力ディレクトリ）をコードとして管理。

#### [NEW] [deploy.yml](file:///Users/hizukuri/Documents/workspace/Tableau/.github/workflows/deploy.yml)

- `cloudflare/pages-action` を使用したデプロイパイプライン。

---

## 検証計画

### 自動テスト

- `npm run lint` および `npm run build` が正常に終了することを確認。

### 手動確認

- GitHub Actions の実行結果を確認。
- デプロイされた URL にアクセスし、ブラウザのデベロッパーツール（Network タブ）で `_headers` が正しく適用されているか確認。
- アプリケーションが CSP 違反を起こさず正常に動作することを確認。
