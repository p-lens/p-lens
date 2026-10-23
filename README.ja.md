# P-Lens（Pレンズ）

> **この日本語版が原本です。** [English](README.md) は翻訳で、内容が食い違うときは日本語版に従います。

パチンコ・パチスロの収支、店舗ごとの貯玉・貯メダル、交換率、期待値を、
**hledger の帳簿ひとつ**として扱うローカルファーストの PWA です。

- 帳簿の正本は手元の journal ファイルです。P-Lens が消えても
  `hledger -f main.journal` でそのまま読めます。
- 会計の計算は hledger（WebAssembly 版をブラウザ内で実行）が行います。
- 帳簿はサーバーに送られません。オフラインでも動きます。
- 機種ごとの算出条件から期待値とボーダーを出します。算出条件は手入力か、
  スペック（期待値基礎値・解析値）から端末上の Rust/WebAssembly で厳密に計算して作ります。
- 算出条件の計算根拠は、端末上の Trealla Prolog（WebAssembly）がルールから証明の木として
  組み立て、計算エンジンの答えと照合して示します。
- 機種・算出条件・設定配分は、みんなで共有するカタログ（`apps/api`）から端末に配信されます。

設計は [ARCHITECTURE.md](ARCHITECTURE.md) にあります。

## 会計モデル

帳簿は hledger の複式簿記で、勘定科目は意図して少なくしています。

```text
資産:現金
資産:貯玉:<店舗>:<レート>      店舗とレートごとの貯玉（例: 資産:貯玉:マレハン東京皇国店:4円）
資産:貯メダル:<店舗>:<レート>  店舗とレートごとの貯メダル
収益:遊技
費用:遊技
費用:貸玉差額
費用:貸メダル差額
費用:再プレイ手数料
純資産:開始残高                帳簿を始めた時点で持っていた貯玉・貯メダル
純資産:残高調整                貯玉・貯メダルの数を店舗の表示に合わせた差
純資産:特殊景品                交換払出で受け取った特殊景品の額
純資産:端玉景品                交換払出で残った端玉の評価額（円単位、景品を受け取らなくても）
純資産:換算調整勘定            交換払出で生じる 1 円未満の端数
統計:期待値                    期待値（仮想転記のみ）
```

このモデルの要点は次の三つです。

- **純資産を終端勘定として扱います。** 景品交換をもって記帳を終了し、受け取った
  景品は資産ではなく `純資産:特殊景品` と `純資産:端玉景品` に、玉・メダルを円に
  直したときの 1 円未満の端数は `純資産:換算調整勘定` に計上します。景品を
  受け取った後の保管、消費、譲渡その他の取引は記帳しません。
- **現金は増えません。** アプリが書く仕訳が `資産:現金` を増やすことはありません。
  負けは現金の減少として、勝ちは持ち帰った景品（純資産）として記録します。
  特殊景品を現金に換える仕訳はありません。
- **玉・メダルは店舗ごとの通貨です。** 貯玉・貯メダルは店舗とレートごとに別の
  数量単位（hledger の commodity）で持ち、円での評価はその日の交換率（`P`）に
  よります。

たとえば、交換率 3.5 円の貯玉 4,800 玉を、特殊景品 16,500 円分と端玉景品に
交換した日の仕訳は次のとおりです。現金は動きません。

```journal
2026-10-04 景品交換 マレハン東京皇国店  ; parlor-id: malehan-tokyokoukoku, savings: prize-exchange
    資産:貯玉:マレハン東京皇国店:4円        -4800 "玉(4円・マレハン東京皇国店)" @ 3.5 JPY
    純資産:特殊景品                     16500 JPY
    純資産:端玉景品                     300 JPY
```

玉・メダルの増減はそれを遊技した日の収益・費用にすでに数えてあるので、景品交換は
どの日の収支にも現れません。

景品を純資産に計上するのは P-Lens に固有の管理会計上の取扱いであり、一般的な
財務会計や税務上の取扱いに代わるものではありません。正式な定めは
[docs/](docs/README.md) にあります。日本語版が正本です。

- [Pレンズ遊技会計基準（PLAS）](docs/ja/accounting-policy.md) — 本則
- [付録A　公式会計解釈集](docs/ja/accounting-faq.md)
- [付録B　会計処理に関する重要な宣言](docs/ja/accounting-declaration.md)

## 手元で動かす

```sh
bun install
bun run dev      # http://localhost:8136
bun run test
```

これだけで帳簿アプリとして動きます。共有カタログ・店舗リストはなくても構いません
（機種の登録と配信がないだけです）。

共有カタログも手元で動かすなら:

```sh
bun --cwd=apps/api run migrate:local   # wrangler のローカル D1 にテーブルを作る
bun --cwd=apps/api run dev             # http://localhost:8787
```

`apps/web/.env.example` を `apps/web/.env.local` にコピーして
`VITE_CATALOG_URL=http://localhost:8787` を入れ、`bun run dev` をやり直します。

端末どうしの同期を試すなら、中継サーバも動かします。

```sh
bun --cwd=apps/relay run migrate:local # wrangler のローカル D1 にテーブルを作る
bun --cwd=apps/relay run dev           # http://localhost:8788
```

`.env.local` に `VITE_RELAY_URL=http://localhost:8788` を足します。中継サーバは
暗号化された変更を順番に預かるだけで、帳簿の中身は読めません。

Google ドライブへのバックアップを試すなら、Google Cloud で OAuth 2.0 クライアント
（種類は「ウェブ アプリケーション」、承認済みの JavaScript 生成元に
`http://localhost:8136`）を作り、同じプロジェクトで Google Drive API を有効にして、
`.env.local` に `VITE_GOOGLE_CLIENT_ID=<クライアント ID>` を足します。アプリが求めるのは
`drive.file` スコープだけで、アプリ自身が作ったファイルしか見えません。なくても、
帳簿はファイルに書き出してバックアップできます。

## 自分で立てる

公式の app.p-lens.jp とは別に、自分のカタログとアプリを立てられます。
URL やアカウントの値はリポジトリに入れず、git に無視されるファイルに書きます。

### 0. 名前とロゴを自分のものにする

名前やロゴ、ページのタイトル、検索に出るかどうかは、`apps/web/src/branding/` の中のフォルダで決まります。ビルドするときの `BRANDING` でどのフォルダを使うかを選びます。

| `BRANDING` | 使うフォルダ | 中身 |
|---|---|---|
| なし（初期設定） | `default/` | 名前は「マイレンズ」。汎用のロゴ、規約なし、検索エンジンには載せない（`noindex`） |
| `p-lens` | `p-lens/` | app.p-lens.jp の「Pレンズ」。**運営者専用です。フォークでは使わないでください** |

**フォークでは `default/` を自分のものにします。** 何もしなければ「マイレンズ」の名前で、検索に出ない状態で配信されます。名前とロゴは `p-lens/` のものを使う権利を許諾していません（[`apps/web/src/branding/p-lens/LICENSE`](apps/web/src/branding/p-lens/LICENSE)）。

| `default/` のファイル | 置き換えるもの |
|---|---|
| `deployment.ts` | `name`（名前）、`nameInJapanese`（日本語の名前。ホーム画面）、`pageTitle`（ページのタイトル。タブと検索結果）、`description`（検索結果の説明文）、`tagline`（リンクを共有したときのカードの一言）、`indexed`（検索エンジンに載せるなら `true`）、`themeColor`（ブラウザのバーの色）、`address`（配信先のアドレス）、`landingPage`（紹介ページ。なければ `undefined`）、`operatorPage`（運営者のページ） |
| `icon.png` | ロゴの絵。置き換えたら `bun --cwd=apps/web run icons` で `served/` のアイコンと共有カード（`og.png`、名前入り）を描き出します。ImageMagick と Noto Sans CJK JP が要ります。`deployment.ts` の名前を変えたときも描き出し直します |
| `terms.md`、`privacy.md` | 利用規約とプライバシーポリシー。初期設定にはありません。置けば表示され、なければ表示されません |

### 1. 共有カタログ（Cloudflare Workers + D1）

API はアプリと同じオリジンの `/api` の下に置きます（例: `https://app.example.com/api/*`）。
API 専用のアドレスを持たないので、探されるアドレスがありません。
`workers_dev` も切ってあるので、`*.workers.dev` のアドレスも生まれません。

```sh
cd apps/api
bunx wrangler login
bunx wrangler d1 create p-lens                                   # database_id が表示される
cp wrangler.production.example.jsonc wrangler.production.jsonc   # git には入らない
```

`wrangler.production.jsonc` の `<…>` を埋めます。

| 項目 | 値 |
|---|---|
| `routes` | アプリのホストの `/api/*` と、そのゾーン（Cloudflare で管理しているドメイン） |
| `database_id` | `wrangler d1 create` が表示した id |
| `vars.ALLOWED_ORIGINS` | アプリを置くページのオリジン（例: `https://app.example.com`）。複数ならカンマ区切り |
| `vars.API_BASE_PATH` | `routes` の接頭辞。`/api` のまま |
| `ratelimits` | 1アドレスあたり毎分の書き込み数と新規登録数の上限。`namespace_id` はアカウント内で重複しない数字 |

秘密の値は設定ファイルに書かず、wrangler の secret にします。

```sh
bunx wrangler secret put ADMIN_TOKEN --config wrangler.production.jsonc        # 管理用の長い乱数
bunx wrangler secret put TURNSTILE_SECRET --config wrangler.production.jsonc   # Turnstile のシークレットキー
```

Turnstile のウィジェットは Cloudflare のダッシュボードで作り、ホスト名にアプリのホストを登録します。
サイトキーはアプリ側（`VITE_TURNSTILE_SITE_KEY`）に、シークレットキーは上の secret に入れます。

```sh
bun run migrate:remote   # 本番の D1 にテーブルを作る
bun run deploy
```

`ALLOWED_ORIGINS` に書いたページからしか、読み出しも書き込みも受け付けません。
ほかの場所に置かれたアプリのコピーや、ページを名乗らないリクエストは 403 で断ります。
空にすると誰でも使えるので、公開する場合は必ず設定してください。

### 2. 同期の中継サーバ（Cloudflare Workers + D1）

中継サーバは、ひとりの人の端末どうしで帳簿を運びます。運ぶのは暗号化された変更で、中継サーバには読めません。中継サーバは自分のホスト（たとえば `https://relay.example.com`）を持ちます。このアドレスは、そこを通して同期するすべての帳簿に書き込まれます。帳簿を同期し始めたら、変えられないアドレスです。同期コードは帳簿の秘密だけで、中継サーバのアドレスは入っていません。そのため、1 つの帳簿を揃える端末は、同じ中継サーバを指すビルドのアプリを使う必要があります。

```sh
cd apps/relay
bunx wrangler d1 create p-lens-relay                             # database_id が表示される
cp wrangler.production.example.jsonc wrangler.production.jsonc   # コミットされません
```

`wrangler.production.jsonc` の `<…>` を埋めます。

| 項目 | 値 |
|---|---|
| `routes` | 中継サーバ自身のホスト。アカウントが持つゾーンのカスタムドメインとして |
| `database_id` | `wrangler d1 create` が表示した id |
| `vars.ALLOWED_ORIGINS` | アプリを配信するページのオリジン。複数ならカンマ区切り |
| `ratelimits` | 1 アドレスあたりの、読み出し・送信・大きな送信の毎分の上限。`namespace_id` はアカウント内で重ならない数 |

```sh
bun run migrate:remote   # 本番の D1 にテーブルを作る
bun run deploy
```

同期の列を開けるのは、端末どうしが共有の秘密から作るトークンだけで、変更を開けるのはその鍵だけです。どちらも中継サーバは目にしません。1 つのアドレスが頼めることには毎分の上限があります。読み出し、送信、そして本文が 32 kB を超える送信（帳簿の最初の変更だけがそうなります）はさらに厳しく。変更は 1 件 2 MB まで、リクエストは 4 MB まで受け付けます。この上限は 1 つのアドレスを遅くするだけで、たくさんのアドレスを持つ相手は止められません。1 本の列がため込める量にも上限はありません。Cloudflare はリクエストが届いた場所の近くで数え、あとから数を合わせるので、上限はおおよそ守られるものです。多くの接続に分けて送られると、数字より少し多く通ります。

### 3. アプリ（静的サイト）

`apps/web/.env.example` を `apps/web/.env.production.local` にコピーして値を入れ、ビルドします。

| 変数 | 値 |
|---|---|
| `VITE_CATALOG_URL` | `/api`（1 の API を同じオリジンに置いた場合） |
| `VITE_PARLORS_URL` | 店舗リスト（JSONL）の公開場所、末尾は `/`。なければ空 |
| `VITE_SURVEY_URL` | 店舗の申請先。なければ空 |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile のサイトキー |
| `VITE_RELAY_URL` | 2 の中継サーバのアドレス。末尾に `/` は付けません。なければ空（その場合、同期を始めることも、同期コードで参加することもできません） |
| `VITE_GOOGLE_CLIENT_ID` | Google ドライブへのバックアップに使う OAuth クライアント ID。なければ空（ファイルへの書き出しだけできます） |

```sh
bun run build    # apps/web/dist を静的ホスティング（Cloudflare Pages など）に置く
```

アプリを置くホストは、1 の `routes` と `ALLOWED_ORIGINS`、2 の `ALLOWED_ORIGINS` に書いたものと同じにします。

### 荒らしへの備え

- **書き込みの制限**: `ALLOWED_ORIGINS` のページからのみ受け付けます。
- **Turnstile**: 機種・算出条件・設定配分・タグの新規登録には、アプリのホストで発行された Turnstile のトークンが要ります。
  スクリプトやよそのサイトからの大量登録を止めます。
- **レート制限**: 1アドレスあたりの書き込みと新規登録を、毎分の上限で抑えます。
- **改ざんできない**: 登録されたものは誰も書き換えられず、消せません。直すときは新しく作り直します。
- **管理者の非表示**: 荒らされたものは管理者が非表示にします。消さないので、いつでも戻せます。
  非表示の機種は誰にも配信されず、名前が空くので本物を登録し直せます。

管理用 API は `ADMIN_TOKEN` を持つ人だけが、どこからでも使えます（トークンがないと 404）。

```sh
API=https://app.example.com/api
AUTH="Authorization: Bearer $ADMIN_TOKEN"

curl -H "$AUTH" "$API/admin/recent?limit=50"                       # 最近の登録（端末 id つき）
curl -X PUT -H "$AUTH" -d '{"reason":"でたらめ"}' "$API/admin/machine/<id>/hidden"   # 1件を非表示（formula / distribution も同じ）
curl -X DELETE -H "$AUTH" "$API/admin/machine/<id>/hidden"         # 表示に戻す
curl -X PUT -H "$AUTH" -d '{"reason":"荒らし"}' "$API/admin/devices/<端末id>/hidden"  # その端末の登録を全部非表示

# 機種の書き方を直す: 名前と、型式名・検索ワード・大当り確率（省いたものは消えます）
curl -X PUT -H "$AUTH" -d '{"name":"e星都幻鬼","modelName":"e星都幻鬼W","keywords":["ゲンキ"],"hitChance":"1/399.9"}' "$API/admin/machines/<id>/description"
```

### できること・できないこと

- ブラウザは、どのページから送ったかを `Origin`（同じオリジンなら `Sec-Fetch-Site`）で必ず伝えます。
  ページの側からは偽れないので、よそのサイトに置いたアプリからは読み出しも書き込みもできません。
- ブラウザ以外（curl やサーバー上のスクリプト）はヘッダーを偽れるので、オリジンの制限だけでは止まりません。
  新規登録は Turnstile が、評価の連打はレート制限が受け持ちます。
- 端末 id は作り直せるので、1人が多くの端末を装って評価を水増しすることは、レート制限で遅くできても防ぎきれません。
- カタログは利用者の端末にまるごと配信されます。中身を秘密にする仕組みではありません。

## プレイログの形式

実戦しながら記録した稼働は、記帳したときに計測の記録が帳簿へ書かれます。
パチンコは `pachinko-play/<稼働ID>.jsonl`、パチスロは `pachislot-play/<稼働ID>.jsonl` で、
1 行が 1 つの JSON です（JSON Lines）。journal からは読み込まれないので、hledger は素通りします。

**スキーマバージョン: 1**

スキーマバージョンは、見出し行と計測の行を合わせたプレイログ全体の形式の版です。
見出し行の `v` に書かれ、前の版の読み方では読み違える変更をしたときに上がります。
以下はバージョン 1 の説明です。

### 1 行目: 見出し行

1 行目だけは計測ではなく、その稼働が何だったかを書いた見出し行です。
`"header": true` を持つのはこの行だけなので、列として読むときは 1 行目を飛ばしてください。

```json
{"header":true,"about":"P-Lens play log. …","v":1,"playId":"…","gameKind":"pachinko","date":"2026-10-10","startedAt":"2026-10-10T03:12:00.000Z","parlor":{"name":"…","id":"…"},"terms":{"rental":{"yen":1000,"tokens":250},"exchange":{"yen":1000,"tokens":280},"replay":{"paidOut":125,"deducted":133}},"machine":"…","cabinetNumber":"123","formulaId":"…"}
```

| 項目 | 内容 |
|---|---|
| `header` | 常に `true`。見出し行であることの印 |
| `about` | この行が見出し行であることの説明（英語） |
| `v` | プレイログのスキーマバージョン。いまは `1` |
| `playId` | 稼働の ID。仕訳の `play-id` タグと同じ |
| `gameKind` | `pachinko` か `pachislot`（名前が決まる前に書かれたログでは `slot`） |
| `date` | 稼働の営業日（`YYYY-MM-DD`） |
| `startedAt` | 打ち始めた時刻（ISO 8601） |
| `parlor` | 店舗。`name` と、店舗リストの `id` か申請中の `submission`。店舗なしの稼働にはありません |
| `terms` | レート。`rental`（貸し）と `exchange`（交換）はそれぞれ `yen` 円あたり `tokens` 玉・枚、`replay` は再プレイの払出 `paidOut` と貯玉から引く数 `deducted`。レートなしの稼働にはありません |
| `machine` | 機種名 |
| `cabinetNumber` | 台番号。ないときは項目ごとありません |
| `formulaId` | 期待値の計算に使った算出条件の ID。使っていなければありません |
| `prior` | パチスロのみ。設定配分で、`{"type":"even"}`（均等）か `{"type":"distribution","id":"…"}` |

帳簿が持つレートは貯玉口座の名前（`4円` など）とその日の交換率だけなので、
貸し・交換・再プレイがそろって残るのはこの見出し行だけです。

### 2 行目以降: 計測

どの行も、打ち始めてからの**累計**です。差分ではないので、あとから思い出した行を
足しても他の行に触らずに済みます。順番は行の位置ではなく `spins` で決まります。
`spins` 以外は、わかるものだけが書かれます。

| 項目 | 内容 |
|---|---|
| `spins` | 打ち始めてからの回転数（パチスロはゲーム数）。必須 |
| `outlay` | 打ち始めてからの投資（円） |
| `at` | その行を書いた時刻（ISO 8601） |
| `counter` | データカウンターの表示。`spins`（前回の大当りからの回転数）、`jackpots`（当日の大当り回数）、`total`（当日の総ゲーム数）、`bonuses`（ボーナスごとの回数）、`sinceCz`・`misses`・`held`（AT 機） |
| `event` | その時点で起きたこと。`{"kind":"jackpot"}`（`approximate` はあとから気づいた大当り、`bonus` は当たったボーナスの `name`・`payout`・`spent`）、`{"kind":"cz-missed"}`、`{"kind":"at-ended"}`（`completed`・`sets`・`medals`）、`{"kind":"ended"}`（稼働の終わり。最後の行） |
| `tally` | パチスロのみ。数えた小役・ボーナスの累計（算出条件の中の ID ごと） |
| `afterReset` | パチスロのみ。設定変更後の台なら最初の行に `true` |
| `phase` | パチンコのみ。前の行からの回転が `regular`（通常）・`special`（確変）・`rapid`（時短）のどれだったか。ないときは通常 |
| `replay` | 打ち始めてから貯玉・貯メダルから引き出した数 |
| `support` | パチンコのみ。電サポ中の持ち玉の増減の累計（減っていれば負） |
| `held` | その時点の持ち玉・持ちメダル（数えたとき） |

実戦中の稼働は端末の中にあるだけで、記帳するまで帳簿には何も書かれません。
記帳し直すと、見出し行も計測もまとめて書き直されます。

## 計算エンジン

作り直すには Rust（wasm32 ターゲットと wasm-bindgen-cli）が必要です。
ビルド済みのものが `packages/pachinko-engine` と `packages/pachislot-engine` に入っているので、
アプリのビルドだけなら不要です。

## ライセンス

GPL-3.0-or-later です。`packages/solid-gathering-shell` は MIT です。

`apps/web/src/branding/p-lens/` にあるもの（名称「P-Lens」「Pレンズ」、ロゴとアイコン、利用規約とプライバシーポリシーの文章、配信先のアドレス）は、ソフトウェア本体ではなく app.p-lens.jp の運営者のもので、GPL の対象ではありません。フォークして配信するときはこのフォルダを使わず、`default/` を自分のものにしてください（「自分で立てる」の 0）。詳しくは [`apps/web/src/branding/p-lens/LICENSE`](apps/web/src/branding/p-lens/LICENSE) にあります。
