---
status: verified
reviewed_source: repository-main
last_checked: 2026-08-29
---

# Current state

- 表示バージョン: `2.0.0`
- 配布方式: GitHub Pages向け静的PWA
- 分割方式: 定型MiB、任意MiB、指定数等分
- 整合性: 各パーツのSHA-256を記録する `.parts.json` を生成
- 結合前検査: 元ファイル名、連番、欠損、重複、混在、サイズ、SHA-256
- オフライン: `service-worker.js` がアプリシェルをキャッシュ
- 外部送信: アプリコード内にアップロード先や外部API呼び出しはありません

## 主要ファイル

- `app.js`: 分割・結合・検証・PWA登録
- `index.html`: UIと利用上の注意
- `service-worker.js`: オフラインキャッシュ
- `manifest.json`: PWAメタデータ
- `README.md`: 利用概要とGitHub Pages設定
