# Fishing Tide BI Final

スマホ1ページ固定の釣り用タイドグラフBIです。

## GitHub Pagesへアップするファイル

- index.html
- style.css
- script.js
- manifest.webmanifest
- icon.png
- icon-192.png
- icon-512.png
- apple-touch-icon.png

## 特徴

- 1ページ固定、スクロールなし前提
- 下部に最大9ポイント表示
- 時間の下に毎時の天気・風向・風速・波高を表示
- 今日、明日、3日後、7日後、14日後を切替
- 新しいST釣り潮アイコンをヘッダーとホーム画面アイコンに使用
- 天気、風、波、水温はOpen-Meteo系APIから取得
- 潮汐は現時点では簡易推算。本番利用では潮汐API接続推奨

## GitHub Pagesでの使い方

リポジトリ直下に上記ファイルを置き、Pagesを有効化してください。
公開URLをiPhone Safariで開き、共有メニューから「ホーム画面に追加」します。
