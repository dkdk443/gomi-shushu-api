import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPlainDate as d } from "../../src/domain/date.ts";
import { createRuleSource, type RuleSourceData } from "../../src/domain/rules.ts";
import { createCollectionService } from "../../src/domain/service.ts";
import type { PlainDate } from "../../src/domain/types.ts";

// 架空の「テスト区」。1丁目と2丁目で不燃ごみの週が違う
function fixture(id: string, validFrom: PlainDate, validTo: PlainDate, burnableWeekday: number): RuleSourceData {
  const rules = (nth: number[]) => ({
    可燃ごみ: [{ weekday: burnableWeekday }],
    不燃ごみ: [{ weekday: 5, nth }],
    "びん・かん・プラ": [],
    "古紙・ペットボトル": [],
  });
  return {
    id,
    prefecture: "東京都",
    city: "テスト区",
    validFrom,
    validTo,
    aliases: {},
    postalCodes: { "1000000": "本町" },
    exceptions: [{ date: d("2027-01-01"), action: "cancel" }],
    areas: [
      { town: "本町", chome: [1], rules: rules([1, 3]), calendarUrl: "" },
      { town: "本町", chome: [2], rules: rules([2, 4]), calendarUrl: "" },
    ],
  };
}

const service = createCollectionService([
  createRuleSource(fixture("test-2026", d("2026-04-01"), d("2027-03-31"), 1)), // 可燃ごみは月曜
  createRuleSource(fixture("test-2027", d("2027-04-01"), d("2028-03-31"), 2)), // 翌年度から火曜
]);

describe("lookup", () => {
  it("丁目まで決まれば答える", () => {
    const result = service.lookup({ address: "本町1丁目" }, d("2026-10-02"));
    assert.ok(result.ok);
    assert.deepEqual(result.types, ["不燃ごみ"]);
  });

  it("例外日は収集しない", () => {
    const result = service.lookup({ address: "本町1丁目" }, d("2027-01-01"));
    assert.ok(result.ok);
    assert.deepEqual(result.types, []);
  });

  it("丁目が決まらず答えが分かれる日は types が null", () => {
    const result = service.lookup({ postalCode: "100-0000" }, d("2026-10-02"));
    assert.ok(result.ok);
    assert.equal(result.types, null);
    assert.deepEqual(result.candidates, [
      { chome: [1], types: ["不燃ごみ"] },
      { chome: [2], types: [] },
    ]);
  });

  it("日付によって年度のデータを選ぶ", () => {
    const before = service.lookup({ address: "本町1丁目" }, d("2027-03-29"));
    const after = service.lookup({ address: "本町1丁目" }, d("2027-04-06"));
    assert.ok(before.ok && after.ok);
    assert.equal(before.source, "test-2026");
    assert.deepEqual(before.types, ["可燃ごみ"]); // 月曜
    assert.equal(after.source, "test-2027");
    assert.deepEqual(after.types, ["可燃ごみ"]); // 火曜
  });
});

describe("lookupRange", () => {
  it("年度をまたぐ期間を1日ずつつなぐ", () => {
    const result = service.lookupRange({ address: "本町1丁目" }, d("2027-03-29"), d("2027-04-06"));
    assert.ok(result.ok);
    assert.deepEqual(result.sources, ["test-2026", "test-2027"]);
    assert.equal(result.days.length, 9);
    assert.deepEqual(
      result.days.filter((day) => day.types?.includes("可燃ごみ")).map((day) => day.date),
      ["2027-03-29", "2027-04-06"],
    );
  });

  it("丁目が決まらないときは丁目ごとのカレンダーも返す", () => {
    const result = service.lookupRange({ postalCode: "1000000" }, d("2026-10-02"), d("2026-10-09"));
    assert.ok(result.ok);
    assert.deepEqual(
      result.days.filter((day) => day.date === "2026-10-02" || day.date === "2026-10-05"),
      [
        { date: "2026-10-02", types: null }, // 第1金曜: 1丁目だけ不燃ごみ
        { date: "2026-10-05", types: ["可燃ごみ"] }, // 月曜: どちらも可燃ごみ
      ],
    );
    assert.deepEqual(result.candidates?.map((c) => c.chome), [[1], [2]]);
    assert.deepEqual(result.candidates?.[1].days.find((day) => day.date === "2026-10-09"), {
      date: "2026-10-09",
      types: ["不燃ごみ"], // 第2金曜
    });
  });

  it("期間の途中で対応外になればエラー", () => {
    const result = service.lookupRange({ address: "本町1丁目" }, d("2028-03-30"), d("2028-04-02"));
    assert.ok(!result.ok);
    assert.equal(result.code, "date_out_of_range");
  });
});

describe("PlainDate", () => {
  // npm run typecheck で確かめる（実行はしない）。
  // "2026-10-1" は文字列比較で "2026-10-07" より後になり、期間の判定が壊れる
  it("検証していない文字列は domain に渡せない", () => {
    const unchecked = () =>
      // @ts-expect-error string は PlainDate ではない
      service.lookupRange({ address: "本町1丁目" }, "2026-10-1", "2026-10-07");
    assert.equal(typeof unchecked, "function");
  });
});
