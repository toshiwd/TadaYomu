# TadaYomu (ただよむ) 仕様書・README

TadaYomuは「小説家になろう」「ノクターンノベル」「カクヨム」といった小説投稿サイトの作品を、快適にオフライン・縦書きで読むことに特化したリーダーアプリです。

## 主な機能仕様 (Features)

### 1. マルチサイト対応 (Scraping Adapters)
登録されたサイトのURLから、作品メタデータ・目次・各話本文を自動抽出して内部データベースに保存します。
- **対応サイト**:
  - 小説家になろう (`syosetu.com`)
  - ノクターンノベル (`noc.syosetu.com`) - ※18禁Cookie対応
  - カクヨム (`kakuyomu.jp`) - ※NEXT.js Apollo/GraphQL キャッシュからのデータ抽出対応

### 2. オフラインリーダー (Offline Reader)
ダウンロードした作品はローカルのSQLiteデータベースにキャッシュされ、完全オフラインで読むことができます。
- **表示モード**: 縦書き・横書きの切り替え
- **テーマ設定**: ライト・ダーク・セピアなど（背景色と文字色のカスタム）
- **文字・行間設定**: フォントサイズ、行間、マージンの調整
- **ルビ対応**: 各サイト特有のルビタグ (`<ruby>`) などを抽出時共通のフォーマット (`|漢字《かんじ》`) に変換し、リーダー側で再度標準HTMLのルビタグとして正しく表示させます。
- **ページナビゲーション**: 画面端のタップ、独自のスワイプ処理により、Webの縦スクロールではなく本のようなページ送りを実現しています。

### 3. 一括ダウンロード・差分更新 (Bulk Download & Updates)
- 一括ダウンロード・未読ダウンロード機能により、続きの話をまとめてローカルにキャッシュできます。
- 同時実行数の制御（Windowing処理）により、負荷をかけずに50話単位でのキューイングをバックグラウンド実行します。

### 4. 書庫管理・保管庫機能 (Library & Archive Management)
- **書庫画面**: ダウンロード済みの作品を「最近読んだ順」「登録順」でソート表示。各作品の既読パーセンテージや最新話を一目で把握できます。
- **保管庫 (Archive)**: 読み終わった作品や、一時的に書庫から非表示にしたい作品を「保管庫」へ退避することができます。データは削除されず、後から通常の本棚へ復元可能です。

### 5. データ同期（Sync）※開発中・一部実装済み
Firebase Authentication (Google) ログインによる、複数端末間での「読書進捗（現在読んでいる話数・スクロール位置）」の自動同期機能基盤を持ちます。

## 技術スタック (Tech Stack)
- **Framework**: React Native (Expo)
- **Language**: TypeScript
- **Database**: `expo-sqlite/next`
- **State Management**: Zustand
- **Backend / Auth**: Firebase (Google Auth)
- **Styling**: Tailwind CSS (NativeWind) を一部併用, 基本は StyleSheet

## 開発環境 (Development Setup)
```bash
# 依存関係のインストール
npm install

# 開発用サーバーの起動
npx expo start

# Android エミュレーターでの起動
npm run android
```

## リリースビルド手順
1. `app.json`, `package.json`, `release.bat` のバージョン番号をインクリメント。
2. Windows環境から `./release.bat` を実行（内部で `gradlew assembleRelease` と `gh release` コマンドを叩いてGitHubのReleasesに自動公開されます）。
