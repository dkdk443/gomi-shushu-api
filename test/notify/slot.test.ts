import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slotAt, targetDate } from "../../src/notify/slot.ts";

describe("slotAt", () => {
  it("日本時間の正午より前は朝、正午からは夜", () => {
    assert.equal(slotAt(new Date("2026-10-06T22:00:00Z")), "morning"); // 10/7 7:00
    assert.equal(slotAt(new Date("2026-10-07T02:59:59Z")), "morning"); // 10/7 11:59
    assert.equal(slotAt(new Date("2026-10-07T03:00:00Z")), "evening"); // 10/7 12:00
    assert.equal(slotAt(new Date("2026-10-07T11:00:00Z")), "evening"); // 10/7 20:00
  });
});

describe("targetDate", () => {
  it("朝は当日、夜は翌日（日本時間）", () => {
    assert.equal(targetDate("morning", new Date("2026-10-06T22:00:00Z")), "2026-10-07");
    assert.equal(targetDate("evening", new Date("2026-10-07T11:00:00Z")), "2026-10-08");
  });
});
