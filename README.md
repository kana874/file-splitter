# File Splitter Ver.2.0.0

ブラウザ内だけでファイルを分割・結合する静的Webアプリです。GitHub Pagesで動作し、Service Workerにより一度読み込んだ後はオフラインでも起動できます。

## Ver.2 の主な改良

- 結合前に元ファイル名、連番、欠損、重複、混在を検証
- 各パーツのSHA-256を記録した `.parts.json` マニフェストを生成
- 結合時にマニフェストがあれば各パーツのサイズとSHA-256を照合
- 5 / 10 / 14 / 15 / 25 / 50 / 100 MiB、任意サイズ、指定数等分に対応
- 指定数等分は各パーツ差が最大1 byteになる境界計算
- 分割・検証の進捗表示
- 生成したObject URLをクリア時・ページ終了時に解放
- ファイル名表示に `textContent` / DOM生成を使用し、ユーザー由来文字列をHTMLとして解釈しない
- PWA / オフライン起動対応

## ファイル構成

- `index.html` - UI
- `app.css` - スタイル
- `app.js` - 分割・結合・検証処理
- `manifest.json` - PWA設定
- `service-worker.js` - オフラインキャッシュ
- `icon.svg` - アプリアイコン

## GitHub Pages

Repository Settings → Pages → Build and deployment で以下を指定します。

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

公開URLは通常 `https://<user>.github.io/<repository>/` です。

## 注意

SHA-256計算は各パーツを一時的にメモリへ読み込みます。大きなパーツサイズでは端末の空きメモリに依存します。

## AI向けプロジェクトknowledge

ChatGPT、Codex、Gemini Web、Antigravity 2は、作業前に [`.ai/INDEX.md`](.ai/INDEX.md) を入口として現行仕様、状態、既知の制約を確認してください。
