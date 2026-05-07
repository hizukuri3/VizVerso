# Tableau Workbook Analyzer タスクリスト

## Phase 1: プロジェクト基盤の構築
- [x] Vite を用いた React + TypeScript プロジェクトのセットアップ
- [x] TailwindCSS の導入と設定
- [x] UIライブラリ（lucide-react）、React Flow、JSZip のインストール

## Phase 1.5: 開発環境の整備とデザイン設計
- [x] TDD環境の構築（Vitest, React Testing Library）
- [x] CI環境の構築（GitHub Actions）
- [x] デザイン仕様書の作成

## Phase 2: 解析エンジンの実装 (TDDベース)
- [ ] `.twbx`解凍およびXMLパースのテストコード記述と実装
- [ ] 計算フィールド、依存関係抽出、運用者向けメタデータ抽出のテスト記述と実装

## Phase 3: UIおよびネットワーク図の構築 (TDDベース)
- [ ] UIコンポーネント（ファイルドロップエリア、設定パネル等）の表示テストと実装
- [ ] React Flowを用いたTableau Prep風のネットワーク図の実装

## Phase 4: 検証と仕上げ
- [ ] 実データ（.twbx）を用いた総合的な動作確認
- [ ] ブラウザのネットワーク通信監視（完全ローカル処理の確認）
