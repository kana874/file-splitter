---
status: verified
reviewed_source: repository-main
last_checked: 2026-08-29
---

# Known issues and constraints

## 確認済みの制約

- SHA-256計算では対象Blobを一時的にArrayBufferへ読み込むため、大きなパーツは端末メモリを消費します。
- オフライン起動は、Service Worker対応ブラウザで一度オンライン読み込みが完了していることを前提とします。
- SHA-256にはSecure Contextが必要であり、通常はHTTPSで配布する必要があります。

## 未検証項目

- 対応ブラウザごとの実用上限ファイルサイズ
- iOS、Android、デスクトップ各ブラウザでの大容量連続処理
- 自動化されたブラウザE2Eテスト

未検証項目を対応済みとして扱わないでください。
