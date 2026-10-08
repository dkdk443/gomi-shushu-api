import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPlainDate as d } from "../../src/domain/date.ts";
import { reminderMessage } from "../../src/notify/message.ts";

const ADDRESS = { prefecture: "東京都", city: "杉並区", town: "和泉", chome: 1 };
const DATE = d("2026-10-02");

describe("reminderMessage", () => {
  it("収集がある日は、種別と日付・曜日を載せる。2種類以上なら数も", () => {
    const text = reminderMessage(
      { ok: true, source: "fake", address: ADDRESS, types: ["不燃ごみ", "古紙・ペットボトル"] },
      DATE,
    );
    assert.equal(text, "明日は2種類：不燃ごみ、古紙・ペットボトル（10/2 金）");
  });

  it("1種類なら「〜の日です」", () => {
    const text = reminderMessage({ ok: true, source: "fake", address: ADDRESS, types: ["不燃ごみ"] }, DATE);
    assert.equal(text, "明日は不燃ごみの日です（10/2 金）");
  });

  it("朝の通知は「おはようございます。今日は…」で、締め切りを知っていれば日付の代わりに載せる", () => {
    assert.equal(
      reminderMessage({ ok: true, source: "suginami-2026", address: ADDRESS, types: ["不燃ごみ"] }, DATE, "morning"),
      "おはようございます。今日は不燃ごみの日です（8:00まで）",
    );
    assert.equal(
      reminderMessage({ ok: true, source: "fake", address: ADDRESS, types: ["不燃ごみ"] }, DATE, "morning"),
      "おはようございます。今日は不燃ごみの日です（10/2 金）",
    );
  });

  it("収集がない日は送らない", () => {
    assert.equal(reminderMessage({ ok: true, source: "fake", address: ADDRESS, types: [] }, DATE), undefined);
  });

  it("丁目で答えが分かれるときは、住所の指定を直すよう知らせる", () => {
    const text = reminderMessage({ ok: true, source: "fake", address: { ...ADDRESS, chome: undefined }, types: null }, DATE);
    assert.match(text!, /丁目まで指定/);
  });

  it("調べられなかったときも、気づけるよう送る", () => {
    const text = reminderMessage({ ok: false, code: "date_out_of_range", message: "対応期間外の日付です" }, DATE);
    assert.match(text!, /date_out_of_range/);
  });
});
