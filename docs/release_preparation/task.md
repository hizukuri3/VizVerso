# リリース前最終修正タスク

- [ ] **1. ビルドエラーの解消**
  - [ ] `ja.json` に不足キーを追加 (`excel.col_used_field`, `detail.any`, `detail.all`)
  - [ ] `en.json` に不足キーを追加
  - [ ] `excelExporter.ts` の型エラー修正
  - [ ] `npm run build` の成功確認

- [ ] **2. SEO / OGP 対応 & UI調整**
  - [ ] `index.html` にメタタグ追加
  - [ ] `og-image.png` を新デザインに差し替え
  - [ ] TOPページのタイトル改行位置調整 (`App.tsx`, `ja.json`)

- [ ] **3. プロジェクト情報の整備**
  - [ ] `package.json` のバージョンを `1.0.0` に更新
  - [ ] `LICENSE` ファイル作成

- [ ] **4. 最終確認**
  - [ ] `npm run lint` 実行
  - [ ] プロダクションビルドの動作確認
