# Tableau Workbook Analyzer 実装計画 (v4: セキュリティ・品質保証 強化版)

本ドキュメントは、Tableauのワークブックファイル（.twb, .twbx）をブラウザ上で解析し、設計情報や依存関係を可視化するアプリケーションの実装計画です。
初期の機能要件に加え、**「エンタープライズ水準の安全性・保守性・パフォーマンス」** を担保するための開発基盤要件を追加定義しています。

## 1. 目的と開発アプローチ

- **目的**: Tableauダッシュボード開発者向けの設計書作成効率化、および運用者向けのメンテナンス性向上。
- **開発アプローチ**: テスト駆動開発 (TDD)、事前のデザイン設計、CI/CDによる品質の自動チェックを義務付ける。

---

> [!IMPORTANT]
>
> ## User Review Required / ユーザー確認事項
>
> 環境構築の「甘さ」を排除するため、以下の**「4つの品質保証観点」**を開発基盤として追加導入します。この方針で環境をアップデートしてよろしいでしょうか？
>
> 1. **セキュリティ (Security)**
>    - `Dependabot` を導入し、パッケージの脆弱性を自動検知・アップデート。
>    - `eslint-plugin-security` 等を導入し、セキュアコーディングを強制。
>    - TDDの要件に **XXE（XML外部実体参照）攻撃** や **Zipボム**、**XSS** に対する防御・サニタイズのテストを義務化。
> 2. **パフォーマンス (Performance)**
>    - 数百MBの `.twbx` を解凍する際、ブラウザのUIがフリーズするのを防ぐため、重いパース処理は **Web Worker** に逃がすアーキテクチャを採用する。
>    - Viteのビルド設定でチャンク分割（Code Splitting）を行い、初期ロードを高速化する。
> 3. **アクセシビリティ (Accessibility / a11y)**
>    - `eslint-plugin-jsx-a11y` を導入し、視覚障害者やキーボードユーザーにも配慮したマークアップ（ARIA属性、フォーカス管理等）を強制する。
> 4. **テスト品質の可視化 (Test Coverage)**
>    - Vitestにカバレッジ計測ツールを導入し、**テストカバレッジ80%以上**をマージ（CIパス）の条件とする。

---

## 2. アーキテクチャと技術スタック

- **フロントエンド**: React (Vite) + TypeScript
- **非同期処理 (NEW)**: **Web Worker** (メインスレッドをブロックせずにJSZipやDOMParserを実行)
- **スタイリング**: TailwindCSS (Tableau風テーマ)
- **可視化**: React Flow (`@xyflow/react`)
- **テスト環境**: Vitest + React Testing Library + `@vitest/coverage-v8` (カバレッジ)
- **静的解析**: ESLint (Security, a11yプラグイン追加), Prettier, Husky, lint-staged
- **CI/CD**: GitHub Actions, Dependabot

## 3. 実装フェーズ

### Phase 1.5: エンタープライズ開発環境の確立 (← 現在ここ)

- [NEW] Dependabotの設定ファイル作成
- [NEW] ESLintのセキュリティ・a11yルールの強化
- [NEW] Vitestカバレッジ計測の導入とCI連携
- [NEW] TDDルール・コーディング規約のアップデート（XXE対策、Web Worker利用等）

### Phase 2: 解析エンジンの実装 (TDD + Web Worker)

- [Test First] `.twbx`解凍およびXMLパースのテスト（正常系 ＋ Zipボム/XXE等異常系）
- [Implementation] **Web Worker** 上でJSZipとDOMParserを用いた解析ロジック実装

### Phase 3: UIおよびネットワーク図の構築 (TDD + a11y)

- [Test First] アクセシビリティを考慮したUIコンポーネントのテスト記述
- [Implementation] TailwindCSSによるUI実装とReact Flowによるネットワーク図構築

### Phase 4: 検証と仕上げ

- 実データを用いた動作確認（パフォーマンスプロファイリング含む）
- ブラウザのネットワーク通信監視（完全ローカル処理の確認）
