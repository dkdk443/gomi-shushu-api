# gomi-shushu-api

住所と日付を渡すと、その日に何のごみを出せるかを返すAPIです。今は **東京都杉並区・令和8年度（2026-04-01〜2027-03-31）** だけに対応しています。

API仕様は [`openapi.yaml`](openapi.yaml)（OpenAPI 3.1）にまとめています。`npx @redocly/cli build-docs openapi.yaml` でHTMLに書き出すと、ブラウザで読めます。

```
GET /collections?address=東京都杉並区阿佐谷北1丁目&date=2026-10-07

{
  "date": "2026-10-07",
  "address": { "prefecture": "東京都", "city": "杉並区", "town": "阿佐谷北", "chome": 1 },
  "source": "suginami-2026",
  "types": ["可燃ごみ"]
}
```

- `date` を省略すると今日（日本時間）になります
- `types` は `可燃ごみ` / `不燃ごみ` / `びん・かん・プラ` / `古紙・ペットボトル` のうち、その日に収集があるもの。収集がなければ `[]`
- 住所は「東京都」「杉並区」を省略してもかまいません。全角数字、漢数字の丁目（`一丁目`）、`1-2-3` 形式、`阿佐ヶ谷`・`堀の内` などの表記ゆれも受け付けます
### 期間を指定してまとめて引く

```
GET /calendar?address=東京都杉並区天沼3丁目&from=2026-10-05&to=2026-10-11

{
  "from": "2026-10-05",
  "to": "2026-10-11",
  "address": { "prefecture": "東京都", "city": "杉並区", "town": "天沼", "chome": 3 },
  "sources": ["suginami-2026"],
  "days": [
    { "date": "2026-10-05", "types": [] },
    { "date": "2026-10-06", "types": ["可燃ごみ"] },
    { "date": "2026-10-07", "types": ["不燃ごみ", "古紙・ペットボトル"] },
    …
  ]
}
```

- `from` / `to` は両端を含みます。`from` を省略すると今日、`to` を省略すると `from` から7日分です
- 期間は366日まで。期間の一部でも対応年度の外にかかると `date_out_of_range` になります
- 住所・郵便番号の指定は `/collections` と同じです。丁目が決まらないときは、`days[].types` は候補で答えが分かれる日だけ `null` になり、`candidates` に丁目のまとまりごとのカレンダー（`{ chome, days }`）が入ります
- 期間が年度をまたぐと、`sources` に使った年度データが並びます

### 郵便番号で引く

`address` の代わりに `zipcode`（`166-0001` / `1660001` / `〒166-0001`）も使えます。両方渡すと、郵便番号の町名と住所が合っているかを確かめたうえで住所を使います。

杉並区の郵便番号は町名と1対1なので、郵便番号では丁目までは決まりません。丁目まで決まらない場合（郵便番号だけ、または町名だけ）は、収集日が同じ丁目のまとまりごとの答えを `candidates` に入れて返します。

- すべての候補でその日の答えが同じなら、`types` にもその答えが入ります
- 候補によって答えが分かれる日は `types: null` です
- 町内の全丁目で収集日が同じ町（36町のうち20町）は、`candidates` を付けずにそのまま答えます。残りの16町のうち7町（和泉など）は、曜日は同じで不燃ごみの週（第1・3か第2・4か）だけが違います

```
GET /collections?zipcode=168-0063&date=2026-10-02

{
  "date": "2026-10-02",
  "address": { "prefecture": "東京都", "city": "杉並区", "town": "和泉" },
  "source": "suginami-2026",
  "types": null,
  "candidates": [
    { "chome": [1], "types": ["古紙・ペットボトル"] },
    { "chome": [2, 3, 4], "types": ["不燃ごみ", "古紙・ペットボトル"] }
  ]
}
```

| エラー `code` | ステータス | 意味 |
| --- | --- | --- |
| `missing_address` / `invalid_date` / `invalid_postal_code` | 400 | パラメータの不足・形式違い |
| `invalid_range` | 400 | `/calendar` の `from` が `to` より後、または366日を超える |
| `postal_code_mismatch` | 400 | 郵便番号と住所の町名が食い違う |
| `unsupported_postal_code` | 404 | 杉並区以外の郵便番号 |
| `unknown_town` / `unknown_chome` | 404 | 町名・丁目が見つからない（`error.suggestions` に正しい町名・丁目の候補） |
| `unsupported_city` | 404 | 杉並区以外 |
| `date_out_of_range` | 404 | 対応年度の外 |

## 動かす

Node.js 22.18 以上（`.ts` をそのまま実行します。実行時の依存はありません）。

```sh
npm install        # 型チェック用の typescript だけ
npm start          # http://localhost:3000 （PORT で変更可）
npm test
npm run typecheck
```

## デプロイ（Cloudflare Workers・自分専用）

Cloudflare Workers の無料プラン（1日10万リクエスト）で動かします。超えても請求ではなくエラーになります。

`Authorization: Bearer <トークン>` が合わないリクエストは401で断ります。`API_TOKEN` が未設定のときは、設定漏れで公開状態にならないよう全部拒否（503）します。

```sh
npx wrangler login                 # 初回だけ。ブラウザで Cloudflare にログイン
openssl rand -base64 32            # トークンを作る（パスワードマネージャーに保存）
npx wrangler secret put API_TOKEN  # 作ったトークンを貼る
npm run deploy                     # テストが通ったらデプロイ
```

```sh
curl -H "Authorization: Bearer $TOKEN" \
  "https://gomi-shushu-api.<アカウント>.workers.dev/collections?zipcode=167-0032"
```

手元で Workers の環境のまま試すときは、`.dev.vars` に `API_TOKEN=…` を書いて `npm run dev:worker` を実行します（`.dev.vars` は git に入れない）。`npm start` の Node 版はローカル開発用で、認証はしません。

Workers ではファイルを読めないので、データは `src/data/bundled-sources.ts` でビルド時に組み込みます。`data/` にJSONを足したら、ここにも足してください（足し忘れはテストで落ちます）。

## しくみ

回収日を1日ずつ持たず、「毎週〇曜」「第n〇曜」のルールと例外日で表現しています。

- `data/raw/suginami-2026-garbage.csv` … 区の収集曜日検索が使っているCSV（町丁目 × ごみ種別 × 曜日）
- `data/raw/suginami-postal-codes.csv` … 日本郵便の郵便番号データ（utf_ken_all.csv）から杉並区の行を抜き出したもの
- `scripts/build-suginami-2026.ts` … CSVをルール形式に変換し、年末年始の休みを足して `data/suginami-2026.json` を作る

コードは次のように分かれています。依存は `main → http → domain` と `main → data → domain` の向きだけで、`domain` はHTTPもファイルI/Oも知りません。

```
src/
  domain/          業務ロジック
    types.ts         ごみ種別・住所・CollectionSource の型
    address.ts       住所の正規化
    date.ts          暦日（PlainDate）の計算。PlainDate はブランド型で、parsePlainDate / toPlainDate を通した値しか作れない
    rules.ts         「毎週〇曜」「第n〇曜」＋例外日の判定（createRuleSource）
    service.ts       ユースケース: lookup / lookupRange。エラーは code だけ返す
  data/
    parse.ts         JSON を domain の型に変換し、日付を検証する
    load-sources.ts  data/*.json をファイルから読む（Node 用。ファイルI/Oはここだけ）
    bundled-sources.ts  data/*.json をビルド時に組み込む（Workers 用）
  http/
    router.ts        パスとメソッドから controller を選ぶ
    auth.ts          Bearer トークンの確認（Workers 用）
    controller.ts    クエリ → domain の入力、結果 → ステータスとJSON。省略時の日付や期間の上限もここ
    server.ts        ルーティングと node:http
  main.ts          Node で組み立てて起動する（ローカル開発用）
  worker.ts        Cloudflare Workers の入口。認証してから router に渡す
```

テストも同じ分け方です。

- `test/domain/` … 架空の区のデータを直接渡す単体テスト（年度またぎなど）
- `test/http/controller.test.ts` … domain の偽物を渡して、ステータスとボディだけを確かめる
- `test/data/` … データファイルの読み込み。日付が壊れていれば起動時に例外になる
- `test/integration/` … 杉並区の実データ。期待値は区の収集カレンダー(PDF)から転記
- `test/http/server.test.ts` … `main.ts` と同じ組み立てでHTTP越しに通す

杉並区のルールで確認したこと（令和8年度版カレンダーPDFより）:

- 「第1・3月曜」は、その月の1回目（1〜7日）と3回目（15〜21日）の月曜
- 祝日も通常どおり収集
- 令和8年度は 12/31〜1/3 が収集なし（休止期間は区が変えることがある。12月の広報すぎなみ・区ホームページで告知されるので、変わったら `EXCEPTIONS` を直して再ビルドする）
- 使っている集積所が住所と別の町丁目にあると、収集日が違うことがある（区のカレンダーの注意書き）。APIは住所の町丁目で答えるので、その場合は集積所の町丁目を指定してもらう
- 曜日は丁目単位で決まっていて、番地で分かれる地区はない

### 次の年度に更新するとき

1. 区のCSV（<https://www.city.suginami.tokyo.jp/documents/12125/garbage.csv>）を取り直して `data/raw/` に置く。郵便番号データも[日本郵便](https://www.post.japanpost.jp/service/search/zipcode/download/utf-zip.html)から取り直す（町名の追加・変更があればビルドが止まる）
2. 新しい年度の収集カレンダーPDFで年末年始の休みを確認し、ビルドスクリプトの `EXCEPTIONS` と有効期間を直す
3. `npm run build:suginami` → テストの期待値をカレンダーから転記し直す

### 自治体を足すとき

ルール型の自治体なら、`data/suginami-2026.json` と同じ形のJSONを `data/` に置くだけで読み込まれます。次の年度も同じで、`data/suginami-2027.json` を置けば日付に応じて使い分けます（`/calendar` は年度をまたいでつなぎます）。ルール型で表せない自治体は、`CollectionSource` を実装して `src/main.ts` で渡します。

## 出典

収集曜日データは杉並区「[ごみと資源 収集曜日検索](https://www.city.suginami.tokyo.jp/kurashi/gomi/)」および「[令和8年度版 収集カレンダー](https://www.city.suginami.tokyo.jp/s104/715.html)」をもとに加工したものです。正確な情報は区の公式カレンダーで確認してください。
