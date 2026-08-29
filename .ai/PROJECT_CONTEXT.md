---
status: verified
reviewed_source: repository-main
last_checked: 2026-08-29
---

# Project context

File Splitterは、ファイルの分割・結合・整合性確認をブラウザ内だけで実行する静的PWAです。GitHub Pagesで配布し、一度読み込んだ後はService Workerによるオフライン起動に対応します。

## 目的

- ファイル内容を外部サーバーへ送らずに分割・結合する。
- 分割パーツの欠損、重複、混在、破損を検出する。
- デスクトップとスマートフォンのWebブラウザから利用できるようにする。

## 境界

- アプリケーションサーバー、ユーザーアカウント、クラウド保存機能は持ちません。
- ファイルと生成物はブラウザ内で処理されます。
- 大容量処理能力は端末メモリとブラウザ実装に依存します。

根拠は [README](../README.md)、[アプリ本体](../app.js)、[Service Worker](../service-worker.js) です。
