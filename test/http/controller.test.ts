import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPlainDate as d } from "../../src/domain/date.ts";
import type { CollectionService, LookupErrorCode, LookupQuery } from "../../src/domain/service.ts";
import { createController } from "../../src/http/controller.ts";

const ADDRESS = { prefecture: "東京都", city: "杉並区", town: "阿佐谷北", chome: 1 };

// domain の偽物。受け取った引数を記録し、決まった結果を返す
function fakeService(overrides: Partial<CollectionService> = {}) {
  const calls: { method: string; query: LookupQuery; dates: string[] }[] = [];
  const service: CollectionService = {
    lookup(query, date) {
      calls.push({ method: "lookup", query, dates: [date] });
      return { ok: true, source: "fake", address: ADDRESS, types: ["可燃ごみ"] };
    },
    lookupRange(query, from, to) {
      calls.push({ method: "lookupRange", query, dates: [from, to] });
      return { ok: true, sources: ["fake"], address: ADDRESS, days: [{ date: from, types: [] }] };
    },
    ...overrides,
  };
  return { service, calls };
}

const params = (query: Record<string, string>) => new URLSearchParams(query);
const today = () => d("2026-10-07");

describe("GET /collections", () => {
  it("クエリを domain に渡し、結果をレスポンスの形にする", () => {
    const { service, calls } = fakeService();
    const res = createController(service, today).getCollections(params({ zipcode: "1660001", date: "2026-10-09" }));
    assert.deepEqual(calls, [{ method: "lookup", query: { address: undefined, postalCode: "1660001" }, dates: ["2026-10-09"] }]);
    assert.deepEqual(res, {
      status: 200,
      body: { date: "2026-10-09", address: ADDRESS, source: "fake", types: ["可燃ごみ"] },
    });
  });

  it("date を省略すると今日", () => {
    const { service, calls } = fakeService();
    createController(service, today).getCollections(params({ address: "阿佐谷北1丁目" }));
    assert.deepEqual(calls[0].dates, ["2026-10-07"]);
  });

  it("候補があれば candidates を付ける", () => {
    const candidates = [{ chome: [1], types: [] }, { chome: [2], types: ["不燃ごみ" as const] }];
    const { service } = fakeService({
      lookup: () => ({ ok: true, source: "fake", address: ADDRESS, types: null, candidates }),
    });
    const res = createController(service, today).getCollections(params({ address: "x" }));
    assert.deepEqual((res.body as { candidates: unknown }).candidates, candidates);
  });

  for (const [query, code] of [
    [{ date: "2026-10-07" }, "missing_address"],
    [{ address: "x", date: "2026-02-30" }, "invalid_date"],
  ] as const) {
    it(`${code} は 400 で domain を呼ばない`, () => {
      const { service, calls } = fakeService();
      const res = createController(service, today).getCollections(params(query));
      assert.equal(res.status, 400);
      assert.equal((res.body as { error: { code: string } }).error.code, code);
      assert.equal(calls.length, 0);
    });
  }
});

describe("domain のエラー → ステータス", () => {
  const cases: [LookupErrorCode, number][] = [
    ["invalid_postal_code", 400],
    ["postal_code_mismatch", 400],
    ["unsupported_postal_code", 404],
    ["unsupported_city", 404],
    ["unknown_town", 404],
    ["unknown_chome", 404],
    ["date_out_of_range", 404],
  ];
  for (const [code, status] of cases) {
    it(`${code} → ${status}`, () => {
      const failure = { ok: false as const, code, message: "m", suggestions: ["c"] };
      const { service } = fakeService({ lookup: () => failure, lookupRange: () => failure });
      const controller = createController(service, today);
      for (const res of [controller.getCollections(params({ address: "x" })), controller.getCalendar(params({ address: "x" }))]) {
        assert.deepEqual(res, { status, body: { error: { code, message: "m", suggestions: ["c"] } } });
      }
    });
  }
});

describe("GET /calendar", () => {
  it("from / to を domain に渡す", () => {
    const { service, calls } = fakeService();
    const res = createController(service, today).getCalendar(params({ address: "x", from: "2026-10-01", to: "2026-10-31" }));
    assert.deepEqual(calls[0].dates, ["2026-10-01", "2026-10-31"]);
    assert.deepEqual(res, {
      status: 200,
      body: { from: "2026-10-01", to: "2026-10-31", address: ADDRESS, sources: ["fake"], days: [{ date: "2026-10-01", types: [] }] },
    });
  });

  it("省略すると今日から7日分", () => {
    const { service, calls } = fakeService();
    createController(service, today).getCalendar(params({ address: "x" }));
    assert.deepEqual(calls[0].dates, ["2026-10-07", "2026-10-13"]);
  });

  it("to だけ省略すると from から7日分", () => {
    const { service, calls } = fakeService();
    createController(service, today).getCalendar(params({ address: "x", from: "2026-12-28" }));
    assert.deepEqual(calls[0].dates, ["2026-12-28", "2027-01-03"]);
  });

  it("366日までは受け付ける", () => {
    const { service } = fakeService();
    const res = createController(service, today).getCalendar(params({ address: "x", from: "2026-04-01", to: "2027-04-01" }));
    assert.equal(res.status, 200);
  });

  for (const [name, query, code] of [
    ["from が to より後", { address: "x", from: "2026-10-10", to: "2026-10-01" }, "invalid_range"],
    ["367日以上", { address: "x", from: "2026-04-01", to: "2027-04-02" }, "invalid_range"],
    ["to の形式違い", { address: "x", to: "2026/10/10" }, "invalid_date"],
    ["住所なし", { from: "2026-10-01" }, "missing_address"],
  ] as const) {
    it(`${name} は 400 ${code} で domain を呼ばない`, () => {
      const { service, calls } = fakeService();
      const res = createController(service, today).getCalendar(params(query));
      assert.equal(res.status, 400);
      assert.equal((res.body as { error: { code: string } }).error.code, code);
      assert.equal(calls.length, 0);
    });
  }
});
