# Tableau Workbook Analyzer コーディング規約 (Coding Guidelines)

本プロジェクトにおけるコードの品質、可読性、および一貫性を保つためのルールを定義します。

## 1. 基本ルール
*   **言語**: TypeScript (厳格な型チェックを有効にする)
*   **UIライブラリ**: React (Vite)
*   **開発手法**: テスト駆動開発 (TDD) をベースとし、テストコードのないロジック実装は原則避ける。

## 2. 命名規則
*   **コンポーネント (ファイル名/関数名)**: `PascalCase` (例: `FileUploader.tsx`, `NetworkGraph.tsx`)
*   **関数・変数・プロパティ**: `camelCase` (例: `parseWorkbook`, `isExtracted`)
*   **定数 (グローバル)**: `UPPER_SNAKE_CASE` (例: `MAX_FILE_SIZE`, `DEFAULT_THEME_COLOR`)
*   **型・インターフェース**: `PascalCase` で、名詞または形容詞とする (プレフィックスの `I` や `T` は付けない)。

## 3. コンポーネント設計
*   **Functional Component**: 全てのコンポーネントはアロー関数を用いた Functional Component として実装する。
*   **ロジックの分離**: コンポーネント内のロジックが複雑になる場合は、カスタムフック (`use〜`) に分離し、UIとビジネスロジックを疎結合にする。
*   **Props**: 分かりやすい型定義 (`Type` または `Interface`) を必ず付与する。

## 4. スタイリング
*   **TailwindCSS**: クラスベースのスタイリングにはすべて TailwindCSS (v4) を用いる。
*   インラインの `style` 属性は、動的な値の注入（例：マウスに追従する座標など）を除き、原則禁止とする。

## 5. テスト (TDD)
*   **ファイルの配置**: テスト対象ファイルと同じディレクトリに `*.test.ts` または `*.test.tsx` という名前で配置する（コロケーション）。
*   **記述手法**: Vitest と React Testing Library を使用する。
*   **粒度**: 
    *   パーサーなどの純粋な関数は、境界値や異常系のテストを網羅すること。
    *   UIコンポーネントは、ユーザーのインタラクション（クリック、表示状態の変化）を中心にテストすること。
