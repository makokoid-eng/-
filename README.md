# 食習慣改善LINE Bot｜ランディングページ

このフォルダには、すぐに公開できる**静的LP**（index.html）と、`利用規約`/`プライバシーポリシー`ページ、画像プレースホルダが入っています。

---

## 公開までの最短手順（GitHub Pages）

1. **GitHubアカウント**を用意
2. 新規リポジトリ作成（例: `foodbot-landing`）
3. このフォルダ一式をアップロード（ドラッグ&ドロップでOK）
4. リポジトリの **Settings → Pages** へ
   - Source: *Deploy from a branch*
   - Branch: `main` / `/ (root)` → **Save**
5. 数十秒後、`https://<ユーザー名>.github.io/foodbot-landing/` が公開URLに
6. **カスタムドメイン**を使う場合は、Pagesの「Custom domain」にドメインを入力し、DNSでCNAMEを設定
7. **Enforce HTTPS** をON

### Cloudflare Pagesでの公開

1. Cloudflareにログイン → Pages → **Create a project**
2. **Upload assets** からこのフォルダをアップロード
3. Framework: *None*、Buildは不要（静的サイト）
4. 発行されたURLを確認。カスタムドメインも設定可能（CloudflareのDNSに追加）

---

## 画像差し替え

- `assets/images/hero.png`：ヒーロー画像（推奨 1200×800）
- `assets/images/demo.png`：デモ画像（推奨 1000×600）

`index.html` の該当パスをそのまま使えばOK。差し替え後はコミット・再デプロイ。

---

## 友だち追加リンク差し替え

ヒーローの「LINEで友だち追加」ボタンの `href="#"` を、LINE公式アカウントの友だち追加URLへ変更。

---

## フォーム（問い合わせ・ニュースレター）

最速は **Googleフォーム** を埋め込みに切り替える方法です。

1. Googleフォームを作成（お名前/メール/所属/区分/メッセージ）
2. 送信 → `</>`（埋め込み）タブ → iframeコードをコピー
3. `index.html` の `<section id="contact">` 内のフォームを **iframe** に置き換え
4. コミット→デプロイで反映

> 将来的にZapierやMakeを使えば、スプレッドシートやNotion、メール配信へ自動連携可能。

---

## アナリティクス（GA4）

1. Google Analyticsで**GA4プロパティ**を作成→測定ID（`G-XXXX...`）取得
2. `index.html` の `</head>` 直前に以下を貼り付け（`G-XXXX` を置き換え）

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXX');
</script>
```

---

## 検索・SNS対策（任意）

- `og:title` / `og:description` / `og:image` を適切に設定（済）
- `robots.txt`/`sitemap.xml` は任意。必要に応じて追加

---

## 糖尿病ケアに広げるときの運用メモ

- 食事ログに **SMBG入力（食前/1h/2h）** を任意で受け付け
- 食物繊維・主食量・運動・服薬の **ON/OFFタグ** を回収
- 週報で「食後高値パターン」「夜間高値パターン」を抽出（将来機能）
- CSV/シート構造（例）
  - `date,time,meal_type,veg_g,protein_g,kcal,pre_bg,bg_1h,bg_2h,carb_flag,fiber_flag,exercise_flag,med_flag,summary,note`

> 重要：本サービスは**医療行為ではありません**。臨床利用は施設の方針に従い、医療判断は主治医が行ってください。

---

## ライセンス
必要に応じて追記してください（例：All rights reserved）。
