# タスクリスト: サイドバー改善・表記修正・ファイル名表示

- [x] About モーダルの表記修正
  - [x] `ja.json`, `en.json` のキー名と文言を変更 (`about.deployed_by`)
  - [x] `AboutModal.tsx` のキー参照を更新
- [x] サイドバーへのファイル名表示追加
  - [x] `Sidebar.tsx` に `fileName` プロップスを追加し、ヘッダーに表示
  - [x] `App.tsx` から `uploadedFileName` を渡す
- [x] サイドバーの初期展開機能
  - [x] `Sidebar.tsx` に `useEffect` を追加し、ダッシュボード選択時に自動展開
- [x] 検証
  - [x] 解析直後のダッシュボード展開の確認
  - [x] ファイル名表示の確認
  - [x] 表記修正の確認
