import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker from "../src/worker.ts";

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
