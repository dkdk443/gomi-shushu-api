import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker, { handleNotify, notifyScheduled } from "../src/worker.ts";

const TOKEN = "test-token";
const URL = "https://example.workers.dev/collections?address=阿佐谷北1丁目&date=2026-10-07";

function call(headers: Record<string, string> = {}, env: { API_TOKEN?: string } = { API_TOKEN: TOKEN }) {
  return worker.fetch(new Request(URL, { headers }), env);
}

describe("worker", () => {
  it("正しいトークンなら答える", async () => {
    const res = await call({ authorization: `Bearer ${TOKEN}` });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.deepEqual((await res.json()).types, ["可燃ごみ"]);
  });

  for (const [name, headers] of [
    ["ヘッダーなし", {}],
    ["トークン違い", { authorization: "Bearer wrong" }],
    ["Bearer なし", { authorization: TOKEN }],
    ["前方一致", { authorization: `Bearer ${TOKEN.slice(0, -1)}` }],
  ] as const) {
    it(`${name}は 401`, async () => {
      const res = await call(headers);
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error.code, "unauthorized");
    });
  }

  it("API_TOKEN が未設定なら、トークンを付けても全部拒否する", async () => {
    for (const env of [{}, { API_TOKEN: "" }]) {
      const res = await call({ authorization: "Bearer " }, env);
      assert.equal(res.status, 503);
    }
  });

  it("認証の後はルーティングに通す", async () => {
    const res = await worker.fetch(
      new Request("https://example.workers.dev/unknown", { headers: { authorization: `Bearer ${TOKEN}` } }),
      { API_TOKEN: TOKEN },
    );
    assert.equal(res.status, 404);
  });
});

describe("Cron の LINE 通知", () => {
  const ENV = { LINE_CHANNEL_ACCESS_TOKEN: "line-token", LINE_USER_ID: "U123", NOTIFY_ADDRESS: "杉並区阿佐谷北1丁目" };

  // fetch の偽物。送ったリクエストを記録する
  function fakeFetch(status = 200) {
    const sent: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response("{}", { status });
    }) as typeof fetch;
    return { fetchFn, sent };
  }

  it("20時（日本時間）に、翌日の種別をカードで送る", async () => {
    const { fetchFn, sent } = fakeFetch();
    await notifyScheduled(ENV, new Date("2026-10-06T11:00:00Z"), fetchFn);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, "https://api.line.me/v2/bot/message/push");
    assert.equal((sent[0].init.headers as Record<string, string>).authorization, "Bearer line-token");
    const body = JSON.parse(sent[0].init.body as string);
    assert.equal(body.to, "U123");
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].type, "flex");
    assert.equal(body.messages[0].altText, "明日は可燃ごみの日です（10/7 水）");
    assert.match(JSON.stringify(body.messages[0].contents), /あしたのごみ/);
  });

  it("7時（日本時間）に、当日の種別を朝のカードで送る", async () => {
    const { fetchFn, sent } = fakeFetch();
    await notifyScheduled(ENV, new Date("2026-10-06T22:00:00Z"), fetchFn);
    assert.equal(sent.length, 1);
    const message = JSON.parse(sent[0].init.body as string).messages[0];
    assert.equal(message.altText, "おはようございます。今日は可燃ごみの日です（8:00まで）");
    assert.match(JSON.stringify(message.contents), /きょうのごみ/);
  });

  it("住所が見つからないなどのときは、テキストで送る", async () => {
    const { fetchFn, sent } = fakeFetch();
    await notifyScheduled({ ...ENV, NOTIFY_ADDRESS: "杉並区存在しない町1丁目" }, new Date("2026-10-06T11:00:00Z"), fetchFn);
    const message = JSON.parse(sent[0].init.body as string).messages[0];
    assert.equal(message.type, "text");
    assert.match(message.text, /unknown_town/);
  });

  it("翌日に収集がなければ送らない", async () => {
    const { fetchFn, sent } = fakeFetch();
    await notifyScheduled(ENV, new Date("2026-10-05T11:00:00Z"), fetchFn);
    assert.equal(sent.length, 0);
  });

  it("設定が足りなければ例外にする", async () => {
    const { fetchFn } = fakeFetch();
    await assert.rejects(notifyScheduled({ ...ENV, LINE_USER_ID: undefined }, new Date(), fetchFn), /LINE_USER_ID/);
  });

  it("LINE がエラーを返したら例外にする", async () => {
    const { fetchFn } = fakeFetch(401);
    await assert.rejects(notifyScheduled(ENV, new Date("2026-10-06T11:00:00Z"), fetchFn), /401/);
  });
});

describe("POST /notify（テスト送信）", () => {
  const ENV = {
    API_TOKEN: TOKEN,
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    LINE_USER_ID: "U123",
    NOTIFY_ADDRESS: "杉並区阿佐谷北1丁目",
  };
  const NOW = new Date("2026-10-06T03:00:00Z");

  function fakeFetch(status = 200) {
    const texts: string[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      texts.push(JSON.parse(init.body as string).messages[0].altText);
      return new Response("{}", { status });
    }) as typeof fetch;
    return { fetchFn, texts };
  }

  // このファイルでは URL が定数名に使われているので、globalThis から取る
  const url = (query = "") => new globalThis.URL(`https://example.workers.dev/notify${query}`);

  it("date を省略すると翌日分を、目印を付けて送る", async () => {
    const { fetchFn, texts } = fakeFetch();
    const res = await handleNotify(ENV, url(), NOW, fetchFn);
    const text = "【テスト送信】明日は可燃ごみの日です（10/7 水）";
    assert.deepEqual(res, { status: 200, body: { date: "2026-10-07", slot: "evening", sent: true, text } });
    assert.deepEqual(texts, [text]);
  });

  it("収集がない日は送らず、sent: false を返す", async () => {
    const { fetchFn, texts } = fakeFetch();
    const res = await handleNotify(ENV, url("?date=2026-10-06"), NOW, fetchFn);
    assert.deepEqual(res, { status: 200, body: { date: "2026-10-06", slot: "evening", sent: false } });
    assert.equal(texts.length, 0);
  });

  it("午前に送ると、当日分を朝のカードで送る", async () => {
    const { fetchFn, texts } = fakeFetch();
    const res = await handleNotify(ENV, url(), new Date("2026-10-06T22:00:00Z"), fetchFn);
    const text = "【テスト送信】おはようございます。今日は可燃ごみの日です（8:00まで）";
    assert.deepEqual(res, { status: 200, body: { date: "2026-10-07", slot: "morning", sent: true, text } });
    assert.deepEqual(texts, [text]);
  });

  it("slot を指定すると、送った時刻に関係なくその時間帯で送る", async () => {
    const { fetchFn, texts } = fakeFetch();
    const res = await handleNotify(ENV, url("?slot=morning&date=2026-10-07"), NOW, fetchFn);
    assert.equal((res.body as { slot: string }).slot, "morning");
    assert.deepEqual(texts, ["【テスト送信】おはようございます。今日は可燃ごみの日です（8:00まで）"]);
  });

  it("slot が morning / evening 以外なら 400", async () => {
    const res = await handleNotify(ENV, url("?slot=noon"), NOW, fakeFetch().fetchFn);
    assert.equal(res.status, 400);
  });

  it("date の形式が違えば 400", async () => {
    const res = await handleNotify(ENV, url("?date=2026-13-01"), NOW, fakeFetch().fetchFn);
    assert.equal(res.status, 400);
  });

  it("設定が足りなければ 503、LINE がエラーなら 502", async () => {
    assert.equal((await handleNotify({ API_TOKEN: TOKEN }, url(), NOW, fakeFetch().fetchFn)).status, 503);
    assert.equal((await handleNotify(ENV, url(), NOW, fakeFetch(401).fetchFn)).status, 502);
  });

  it("トークンがなければ 401、GET なら 405", async () => {
    const unauth = await worker.fetch(new Request(url(), { method: "POST" }), ENV);
    assert.equal(unauth.status, 401);
    const get = await worker.fetch(new Request(url(), { headers: { authorization: `Bearer ${TOKEN}` } }), ENV);
    assert.equal(get.status, 405);
  });
});

describe("カードを送れなかったとき", () => {
  const ENV = {
    API_TOKEN: TOKEN,
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    LINE_USER_ID: "U123",
    NOTIFY_ADDRESS: "杉並区阿佐谷北1丁目",
  };

  it("テキストで送り直し、理由を返す", async () => {
    const types: string[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      const message = JSON.parse(init.body as string).messages[0];
      types.push(message.type);
      return message.type === "flex" ? new Response("invalid flex", { status: 400 }) : new Response("{}");
    }) as typeof fetch;
    const res = await handleNotify(ENV, new globalThis.URL("https://example.workers.dev/notify?date=2026-10-07"), new Date(), fetchFn);
    assert.deepEqual(types, ["flex", "text"]);
    assert.equal(res.status, 200);
    assert.match((res.body as { flexError: string }).flexError, /400 invalid flex/);
  });
});
