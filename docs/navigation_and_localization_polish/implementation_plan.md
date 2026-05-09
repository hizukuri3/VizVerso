# ナビゲーション改善と言語切り替え機能の導入計画

ユーザーの利便性向上のため、パンくずリストの機能拡張と言語切り替え機能の実装、および About モーダルの文言修正を行います。

## ユーザーレビューが必要な項目

- **現状有姿の修正案**: 「無保証 (As Is)」または「現状のままの提供」を提案します。どちらがより自然に感じられますか？
- **言語切り替えの配置**: ヘッダーの右側（新規アップロードボタンの横）に配置する予定です。

## 提案される変更

### 1. パンくずリストのナビゲーション改善

#### [MODIFY] [Breadcrumbs.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/Breadcrumbs.tsx)

- `dashboardName` もクリック可能なボタンに変更します。
- クリック時にそのダッシュボードへ遷移するための `onNavigateDashboard` プロップスを追加します。

#### [MODIFY] [App.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/App.tsx)

- `Breadcrumbs` に `handleSelect('dashboard', name)` を渡すように修正します。

### 2. 言語切り替え機能の追加

#### [MODIFY] [i18n.ts](file:///Users/hizukuri/Documents/workspace/Tableau/src/utils/i18n.ts)

- `setLanguage` 実行時にコンポーネントを再レンダリングさせるための仕組み（簡易的なステート管理や EventEmitter）を検討するか、`App.tsx` で言語状態を管理するようにします。

#### [MODIFY] [App.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/App.tsx)

- ヘッダーに言語切り替えボタン（JA / EN）を追加します。
- 言語切り替え時に `setLanguage` を呼び出し、アプリ全体を再レンダリングします。

### 3. About モーダルの文言修正

#### [MODIFY] [ja.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/ja.json)

- `about.created_by`: `"@hizukuri3 による開発"` → `"Created by @hizukuri3"`
- `about.as_is_title`: `"現状有姿"` → `"無保証 (As Is)"` (または指定の自然な表現)

#### [MODIFY] [en.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/en.json)

- `about.as_is_title`: `"As Is"` (日本語版に合わせる場合はそのまま)

## 検証計画

### 手動確認

- パンくずリストの「ホーム」および「ダッシュボード名」をクリックして、正しく画面が切り替わるか確認します。
- ヘッダーの言語ボタンをクリックし、表示言語が即座に切り替わるか確認します。
- About モーダルの文言が指定通り修正されているか確認します。
