# Tableau Workbook Analyzer 実装計画 (v3: TDD & CI/CD導入版)

本ドキュメントは、Tableauのワークブックファイル（.twb, .twbx）をブラウザ上で解析し、設計情報や依存関係を可視化するアプリケーションの実装計画です。

## 1. 目的と開発アプローチ
*   **目的**: Tableauダッシュボード開発者向けの設計書作成効率化、および運用者向けのメンテナンス性向上。
*   **開発アプローチ (NEW)**: 
    *   **テスト駆動開発 (TDD)** を主軸とし、ロジックやコンポーネントの実装前にテストコード（Vitest, React Testing Library等）を記述します。
    *   本格的な開発に入る前に、画面レイアウトやコンポーネント構成などの **デザイン設計（UI/UX仕様）** を行います。
    *   品質を担保するための **CI/CD（継続的インテグレーション）環境** を構築した上で開発を進行します。

---

> [!IMPORTANT]
> ## User Review Required / ユーザー確認事項
> 開発を止めて、まずは環境と設計を固めるアプローチに完全同意いたします。以下の点についてご確認ください。
> 
> 1. **CI環境について**: コードのPush時に Lint, 型チェック, テスト(Vitest) が自動実行される仕組みとして **GitHub Actions** のワークフロー（`.github/workflows/ci.yml`）を作成する想定ですが、よろしいでしょうか？
> 2. **デザイン設計について**: 開発に入る前に、ワイヤーフレーム（画面の構成要素や配置のテキストによる定義）や、カラースキーム・Typographyの設計書をまとめた「デザイン仕様書（`design_spec.md`）」を作成するフローで進めてよいでしょうか？

---

## 2. アーキテクチャと技術スタック

*   **フロントエンドフレームワーク**: React (Viteベース) + TypeScript
*   **スタイリング**: TailwindCSS (Tableau風のカスタムカラーテーマ適用)
*   **ネットワーク図の可視化**: React Flow (`@xyflow/react`)
*   **ファイル解析**: JSZip, DOMParser
*   **テスト環境 (NEW)**: **Vitest** (テストランナー) + **React Testing Library** (UIテスト)
*   **CI/CD (NEW)**: **GitHub Actions** (静的解析、自動テスト)

## 3. 実装フェーズ（改訂版）

### Phase 1: プロジェクト基盤の構築 (完了済)
*   Vite + React + TypeScript プロジェクトのセットアップ
*   TailwindCSS, React Flow, JSZip 等のパッケージインストール

### Phase 1.5: 開発環境の整備とデザイン設計 (←現在ここ)
*   [NEW] **TDD環境の構築**: Vitest と React Testing Library のセットアップ。
*   [NEW] **CI環境の構築**: GitHub Actions ワークフローの作成（Lint, TypeCheck, Testの自動化）。
*   [NEW] **デザイン設計書の作成**: 画面構成、UIコンポーネントの分割、配色ルールをまとめた仕様書の作成。

### Phase 2: 解析エンジンの実装 (TDDベース)
*   [Test First] `.twbx`解凍およびXMLパースのテストコード記述
*   [Implementation] JSZipとDOMParserを用いた解析ロジック実装
*   [Test First] 計算フィールド、依存関係抽出、運用者向けメタデータ抽出のテスト記述
*   [Implementation] 抽出ロジックの実装

### Phase 3: UIおよびネットワーク図の構築 (TDDベース)
*   [Test First] UIコンポーネント（ファイルドロップエリア、設定パネル等）の表示テスト記述
*   [Implementation] TailwindCSSによるUI実装
*   [Implementation] React Flowを用いたTableau Prep風のネットワーク図の実装

### Phase 4: 検証と仕上げ
*   実データ（.twbx）を用いた総合的な動作確認
*   ブラウザのネットワーク通信が発生していないこと（セキュリティ）の最終確認
