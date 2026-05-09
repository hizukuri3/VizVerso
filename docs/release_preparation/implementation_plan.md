# リリース前最終点検と修正計画

ようやくリリースが近づいてきました。点検の結果、ビルドエラーの発生やSEO設定の不足、ライセンスファイルの欠如などが確認されました。これらを修正し、万全の状態でリリースできるようにします。

## ユーザーレビューが必要な項目

- [ ] バージョン番号を `1.0.0` に更新しますが、特定の番号指定があれば教えてください。
- [ ] 50件以上の Lint エラー（主に `any` の使用）が出ていますが、今回はビルドを優先し、深刻な型エラーのみ修正します。Lintエラーの完全な解消が必要な場合は別途お申し付けください。
- [ ] **TOPページのタイトル改行位置を調整し、単語の途中で切れないようにします。**

## 修正・追加内容

### 1. ビルドエラーの解消 (TypeScript)

現在、`npm run build` が以下の箇所で失敗しています。

- `excelExporter.ts` において、存在しない翻訳キー (`excel.col_used_field`) を参照している。
- `detail.any` や `detail.all` などの動的なキー参照が型安全でない。

### 2. SEO / OGP 対応 & UI調整

`index.html` に、SNSでのシェア時や検索エンジン向けのメタタグを追加します。
また、**現在の OG イメージ画像 (`og-image.png`) が旧名称（Verso-viz）のままになっているため、新名称（VizVerso）で再生成します。**
さらに、**TOPページのタイトルの改行位置を美しく調整します。**

### 3. プロジェクト情報の整備

- `package.json` のバージョンを `1.0.0` に更新。
- `LICENSE` ファイル (MIT) を新規作成。
- 翻訳ファイル (`ja.json`, `en.json`) に不足しているキーを追加。

---

## 変更ファイル一覧

### [Component: Localization]

#### [MODIFY] [ja.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/ja.json)

- `excel.col_used_field`: "使用フィールド" を追加
- `detail.any`: "すべて" を追加
- `detail.all`: "すべて" を追加

#### [MODIFY] [en.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/en.json)

- 日本語版と同期（"Used Field", "Any", "All"）

---

### [Component: Logic]

#### [MODIFY] [excelExporter.ts](file:///Users/hizukuri/Documents/workspace/Tableau/src/utils/excelExporter.ts)

- `t` 関数の引数を `as TKey` でキャストし、動的キー生成による型エラーを回避。

---

### [Component: Metadata & Legal]

#### [MODIFY] [index.html](file:///Users/hizukuri/Documents/workspace/Tableau/index.html)

- `<meta name="description" ...>` の追加
- OGPタグ (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`) の追加
- Twitter Card タグの追加

#### [MODIFY] [og-image.png](file:///Users/hizukuri/Documents/workspace/Tableau/public/og-image.png) [NEW IMAGE]

- 旧名称「Verso-viz」から新名称「VizVerso」にデザインを更新。

#### [MODIFY] [package.json](file:///Users/hizukuri/Documents/workspace/Tableau/package.json)

- `version`: "0.0.0" -> "1.0.0"

#### [NEW] [LICENSE](file:///Users/hizukuri/Documents/workspace/Tableau/LICENSE)

- MIT License 本文の作成。

---

## 検証計画

### 自動テスト・ビルド確認

- `npm run build` を実行し、正常に終了することを確認。
- `npm run lint` でエラーが許容範囲内であることを確認（anyエラー以外がないか）。

### 手動確認

- 実際に Excel 出力を実行し、追加した項目（使用フィールドなど）が正しく出力されるか確認。
- ブラウザのソース表示で `index.html` のメタタグが反映されているか確認。
