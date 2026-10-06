import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/main.ts";

// main.ts と同じ組み立てで実データを使い、HTTP越しに通す
describe("server", () => {
  let server: Server;
  let base: string;

  before(async () => {
    server = createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const get = (path: string, query: Record<string, string> = {}) =>
    fetch(`${base}${path}?${new URLSearchParams(query)}`);

  it("GET /collections", async () => {
    const res = await get("/collections", { address: "阿佐谷北1丁目", date: "2026-10-07" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.deepEqual((await res.json()).types, ["可燃ごみ"]);
  });

  it("GET /calendar", async () => {
    const res = await get("/calendar", { zipcode: "168-0063", from: "2026-10-01", to: "2026-10-31" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.days.length, 31);
    assert.deepEqual(body.candidates.map((c: { chome: number[] }) => c.chome), [[1], [2, 3, 4]]);
  });

  it("知らないパスは 404", async () => {
    const res = await get("/unknown");
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, "not_found");
  });

  it("GET 以外は 405", async () => {
    const res = await fetch(`${base}/calendar`, { method: "POST" });
    assert.equal(res.status, 405);
    assert.equal((await res.json()).error.code, "method_not_allowed");
  });
});
