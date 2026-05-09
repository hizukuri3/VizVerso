# Stripe審査通過のための法的表記実装計画

Stripeからの通知に基づき、VizVersoに「特定商取引法に基づく表記」を正しく実装し、審査を通過するための対応を行います。

## ユーザー確認事項

> [!IMPORTANT]
> 特定商取引法に基づく表記には、販売者の氏名、住所、電話番号などの個人情報を含める必要があります。
> 翻訳ファイルにプレースホルダー（`[入力してください]`）を作成しますので、実装後にユーザー様ご自身で正しい情報に書き換えていただく必要があります。

> [!NOTE]
> Stripeの登録名が「VERSO CHEE」となっているため、法的表記内の販売者名にもこの名称（または関連性を示す文言）を含めるようにします。

## 提案する変更内容

### 1. 翻訳データの追加 (I18n)

#### [MODIFY] [ja.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/ja.json)

- `legal` セクションを新規追加。
- 特定商取引法で義務付けられている以下の項目を定義します：
  - 販売業者（VERSO CHEE / [お名前]）
  - 運営責任者
  - 所在地
  - 電話番号
  - メールアドレス
  - 販売価格
  - 商品代金以外の必要料金
  - 支払方法
  - 支払時期
  - 商品の引渡時期
  - 返品・交換・キャンセル等

#### [MODIFY] [en.json](file:///Users/hizukuri/Documents/workspace/Tableau/src/locales/en.json)

- 日本語版に対応する英語の翻訳を追加。

### 2. URLパラメータによる直接アクセス対応

#### [MODIFY] [App.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/App.tsx)

- URLに `?view=legal` が含まれている場合、初期状態で `LegalModal` を開くように修正します。
- これにより、Stripeの審査担当者に直接的なURLを提示できるようになります。

### 3. コンポーネントの調整

#### [MODIFY] [LegalModal.tsx](file:///Users/hizukuri/Documents/workspace/Tableau/src/components/LegalModal.tsx)

- 翻訳キーが正しく反映されるよう、不足している項目（住所、電話番号など）を表示するUIパーツを追加・調整します。

## 検証計画

### 自動テスト

- 現状、UIテストの環境（Playwrightなど）があるため、URLパラメータでモーダルが開くことを確認するテストケースの追加を検討します。

### 手動確認

- `?view=legal` にアクセスし、法的表記モーダルが正しく表示されるか確認。
- 言語切り替え（JA/EN）が法的表記内でも機能することを確認。
- フッターのリンクをクリックしてモーダルが開くことを確認。
