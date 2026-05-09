# 改善・修正の統合計画

ユーザー体験向上のため、サイドバーの挙動改善、文言のプロフェッショナル化、およびコンテキスト情報の追加を行います。

## ユーザーレビューが必要な項目

- **ファイル名の表示場所**: サイドバー（ナビゲーター）のヘッダー部分に表示する予定です。

## 提案される変更

### 1. サイドバーの初期展開設定

#### [MODIFY] [Sidebar.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/Sidebar.tsx)

- `selectedId` が変更された際、それがダッシュボードであれば自動的にリストを展開するように `useEffect` を追加します。
- これにより、解析直後に最初のダッシュボードのシートリストが自動的に表示されるようになります。

### 2. 解析ファイル名の表示追加

#### [MODIFY] [Sidebar.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/Sidebar.tsx)

- `fileName` プロップスを追加し、ナビゲーターのヘッダー部分にファイル名を表示します。
- ファイル形式（.twbx など）をアイコンと共に表示し、現在どのファイルを解析しているか一目でわかるようにします。

#### [MODIFY] [App.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/App.tsx)

- `Sidebar` コンポーネントに `uploadedFileName` を渡すように修正します。

### 3. About モーダルの表記修正

#### [MODIFY] [ja.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/ja.json) / [en.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/en.json)

- `about.created_by` を `about.deployed_by` に変更し、文言を `"DEPLOYED BY @hizukuri3"` に統一します。

#### [MODIFY] [AboutModal.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/AboutModal.tsx)

- 翻訳キーを `about.deployed_by` に更新します。

## 検証計画

### 手動確認

- ファイルをアップロードした後、最初のダッシュボードが自動展開されていることを確認します。
- サイドバーの最上部に、解析したファイル名が正しく表示されていることを確認します。
- About モーダルの表記が「DEPLOYED BY @hizukuri3」になっていることを確認します。
