import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPlainDate as d } from "../../src/domain/date.ts";
import { loadSources } from "../../src/data/load-sources.ts";
import { createCollectionService } from "../../src/domain/service.ts";

// 杉並区の実データ（data/suginami-2026.json）を読み込んだ結合テスト
const { lookup, lookupRange } = createCollectionService(loadSources());

function typesOf(address: string, date: string) {
  const result = lookup({ address }, d(date));
  assert.ok(result.ok, JSON.stringify(result));
  return result.types;
}

// 期待値は令和8年度版 収集カレンダー(PDF)から転記
describe("阿佐谷北1～6丁目（カレンダー12）", () => {
  const address = "東京都杉並区阿佐谷北1丁目";
  const cases: [string, string[]][] = [
    ["2026-10-05", ["不燃ごみ", "古紙・ペットボトル"]], // 第1月曜
    ["2026-10-06", []],
    ["2026-10-07", ["可燃ごみ"]],
    ["2026-10-09", ["びん・かん・プラ"]],
    ["2026-10-10", ["可燃ごみ"]],
    ["2026-10-12", ["古紙・ペットボトル"]], // 第2月曜・スポーツの日も収集
    ["2026-10-19", ["不燃ごみ", "古紙・ペットボトル"]], // 第3月曜
    ["2026-11-30", ["古紙・ペットボトル"]], // 第5月曜
    ["2026-04-29", ["可燃ごみ"]], // 昭和の日も収集
    ["2027-01-01", []], // 年末年始
    ["2027-01-02", []],
    ["2027-01-04", ["不燃ごみ", "古紙・ペットボトル"]],
  ];
  for (const [date, expected] of cases) {
    it(date, () => assert.deepEqual(typesOf(address, date), expected));
  }
});

describe("永福1～4丁目（カレンダー19）", () => {
  const address = "杉並区永福3丁目";
  const cases: [string, string[]][] = [
    ["2026-10-14", ["不燃ごみ", "古紙・ペットボトル"]], // 第2水曜
    ["2026-10-07", ["古紙・ペットボトル"]],
    ["2026-12-30", ["古紙・ペットボトル"]],
    ["2026-12-31", []], // 木曜だが年末年始
    ["2027-01-07", ["可燃ごみ"]],
    ["2027-01-13", ["不燃ごみ", "古紙・ペットボトル"]],
  ];
  for (const [date, expected] of cases) {
    it(date, () => assert.deepEqual(typesOf(address, date), expected));
  }
});

describe("住所の表記ゆれ", () => {
  const expected = ["不燃ごみ", "古紙・ペットボトル"];
  for (const address of [
    "東京都杉並区阿佐谷北1丁目",
    "杉並区阿佐谷北一丁目",
    "阿佐谷北１丁目２－３",
    "阿佐ヶ谷北1-2-3",
    "東京都 杉並区 阿佐谷北 6丁目",
  ]) {
    it(address, () => assert.deepEqual(typesOf(address, d("2026-10-05")), expected));
  }

  it("同じ丁目番号でも町が違えば曜日が違う（高井戸東 / 高井戸西）", () => {
    assert.deepEqual(typesOf("高井戸東1丁目", d("2026-10-03")), ["不燃ごみ", "古紙・ペットボトル"]);
    assert.deepEqual(typesOf("高井戸西1丁目", d("2026-10-03")), ["びん・かん・プラ"]);
  });

  it("井草と上井草・下井草を取り違えない", () => {
    assert.deepEqual(typesOf("上井草1丁目", d("2026-10-05")), ["びん・かん・プラ"]);
    assert.deepEqual(typesOf("井草1丁目", d("2026-10-05")), []);
  });

  it("の / ノ", () => {
    assert.deepEqual(typesOf("堀の内2丁目", d("2026-10-06")), ["不燃ごみ", "古紙・ペットボトル"]);
  });
});

describe("丁目が決まらないとき", () => {
  it("全丁目で収集日が同じ町は、そのまま答える", () => {
    const result = lookup({ address: "杉並区荻窪" }, d("2026-10-07"));
    assert.ok(result.ok);
    assert.deepEqual(result.types, ["可燃ごみ"]);
    assert.equal(result.candidates, undefined);
  });

  it("丁目で収集日が分かれても、その日の答えが同じなら答える", () => {
    // 和泉1丁目も2～4丁目も火曜はびん・かん・プラ
    const result = lookup({ address: "杉並区和泉" }, d("2026-10-06"));
    assert.ok(result.ok);
    assert.deepEqual(result.types, ["びん・かん・プラ"]);
    assert.deepEqual(result.candidates?.map((c) => c.chome), [[1], [2, 3, 4]]);
  });

  it("答えが分かれる日は types を null にして候補を返す", () => {
    // 2026-10-02 は第1金曜。不燃ごみは和泉2～4丁目だけ
    const result = lookup({ address: "杉並区和泉" }, d("2026-10-02"));
    assert.ok(result.ok);
    assert.equal(result.types, null);
    assert.deepEqual(result.candidates, [
      { chome: [1], types: ["古紙・ペットボトル"] },
      { chome: [2, 3, 4], types: ["不燃ごみ", "古紙・ペットボトル"] },
    ]);
  });

  it("CSVで別の行でも、収集日が同じ丁目はまとめる（高円寺南1・5丁目）", () => {
    const result = lookup({ address: "高円寺南" }, d("2026-10-02"));
    assert.ok(result.ok);
    assert.deepEqual(result.candidates?.map((c) => c.chome), [[1, 5], [2, 3, 4]]);
  });
});

describe("郵便番号", () => {
  it("町名と1対1なので、丁目の分かれない町はそのまま答える", () => {
    const result = lookup({ postalCode: "166-0001" }, d("2026-10-05"));
    assert.ok(result.ok);
    assert.deepEqual(result.address, { prefecture: "東京都", city: "杉並区", town: "阿佐谷北" });
    assert.deepEqual(result.types, ["不燃ごみ", "古紙・ペットボトル"]);
  });

  it("丁目の分かれる町は候補を返す", () => {
    const result = lookup({ postalCode: "〒１６８００６３" }, d("2026-10-02"));
    assert.ok(result.ok);
    assert.equal(result.address.town, "和泉");
    assert.equal(result.types, null);
    assert.equal(result.candidates?.length, 2);
  });

  it("住所と一緒に渡すと住所で丁目まで決める", () => {
    const result = lookup({ postalCode: "1680063", address: "和泉3丁目" }, d("2026-10-02"));
    assert.ok(result.ok);
    assert.deepEqual(result.types, ["不燃ごみ", "古紙・ペットボトル"]);
  });

  it("住所と町名が食い違う", () => {
    const result = lookup({ postalCode: "1680063", address: "阿佐谷北1丁目" }, d("2026-10-02"));
    assert.ok(!result.ok);
    assert.equal(result.code, "postal_code_mismatch");
  });

  it("杉並区以外", () => {
    const result = lookup({ postalCode: "100-0001" }, d("2026-10-02"));
    assert.ok(!result.ok);
    assert.equal(result.code, "unsupported_postal_code");
  });

  it("桁が足りない", () => {
    const result = lookup({ postalCode: "166-001" }, d("2026-10-02"));
    assert.ok(!result.ok);
    assert.equal(result.code, "invalid_postal_code");
  });
});

describe("答えられないとき", () => {
  it("存在しない丁目", () => {
    const result = lookup({ address: "阿佐谷北7丁目" }, d("2026-10-06"));
    assert.ok(!result.ok);
    assert.equal(result.code, "unknown_chome");
    assert.deepEqual(result.suggestions, [1, 2, 3, 4, 5, 6].map((c) => `阿佐谷北${c}丁目`));
  });

  it("杉並区にない町名", () => {
    const result = lookup({ address: "杉並区霞が関1丁目" }, d("2026-10-06"));
    assert.ok(!result.ok);
    assert.equal(result.code, "unknown_town");
  });

  it("他の自治体", () => {
    const result = lookup({ address: "東京都中野区中央1丁目" }, d("2026-10-06"));
    assert.ok(!result.ok);
    assert.equal(result.code, "unsupported_city");
  });

  it("年度外の日付", () => {
    const result = lookup({ address: "阿佐谷北1丁目" }, d("2027-04-01"));
    assert.ok(!result.ok);
    assert.equal(result.code, "date_out_of_range");
  });
});

describe("期間指定", () => {
  it("阿佐谷北の年末年始（カレンダー12と一致）", () => {
    const result = lookupRange({ address: "阿佐谷北1丁目" }, d("2026-12-28"), d("2027-01-04"));
    assert.ok(result.ok);
    assert.deepEqual(result.sources, ["suginami-2026"]);
    assert.deepEqual(result.days, [
      { date: "2026-12-28", types: ["古紙・ペットボトル"] },
      { date: "2026-12-29", types: [] },
      { date: "2026-12-30", types: ["可燃ごみ"] },
      { date: "2026-12-31", types: [] },
      { date: "2027-01-01", types: [] },
      { date: "2027-01-02", types: [] },
      { date: "2027-01-03", types: [] },
      { date: "2027-01-04", types: ["不燃ごみ", "古紙・ペットボトル"] },
    ]);
  });

  it("年度の終わりを越えると date_out_of_range", () => {
    const result = lookupRange({ address: "阿佐谷北1丁目" }, d("2027-03-30"), d("2027-04-02"));
    assert.ok(!result.ok);
    assert.equal(result.code, "date_out_of_range");
  });
});
