import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPlainDate as d } from "../../src/domain/date.ts";
import { reminderFlex } from "../../src/notify/flex.ts";

// Flex Message の中から、text コンポーネントの文字を順に集める
function texts(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node === null || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  const own = obj.type === "text" && typeof obj.text === "string" ? [obj.text] : [];
  return [...own, ...Object.values(obj).flatMap(texts)];
}

describe("reminderFlex", () => {
  it("1種類の日は、見出し・種別・日付と、締め切りの一言を載せる", () => {
    const all = texts(reminderFlex(d("2026-10-08"), ["可燃ごみ"], "suginami-2026", "x").contents);
    for (const t of ["あしたのごみ", "🔥", "可燃ごみ", "10月8日（木）", "朝8:00までに集積所へ。今夜のうちに玄関にまとめておくと安心です。"]) {
      assert.ok(all.includes(t), t);
    }
  });

  it("2種類の日は、見出しに種類の数を付け、締め切りに「どちらも」を付ける", () => {
    const all = texts(reminderFlex(d("2026-10-09"), ["不燃ごみ", "古紙・ペットボトル"], "suginami-2026", "x").contents);
    for (const t of ["あしたのごみ・2種類", "10月9日（金）", "不燃ごみ", "古紙・ペットボトル", "どちらも朝8:00までに集積所へ。"]) {
      assert.ok(all.includes(t), t);
    }
  });

  it("朝は「きょうのごみ」にして、一言も朝向けにする", () => {
    const all = texts(reminderFlex(d("2026-10-08"), ["びん・かん・プラ"], "suginami-2026", "x", { slot: "morning" }).contents);
    assert.ok(all.includes("きょうのごみ"));
    assert.ok(all.includes("8:00までに集積所へ。出かける前にお忘れなく。"));
  });

  it("知らない種別は、共通の絵文字で載せる", () => {
    const all = texts(reminderFlex(d("2026-10-03"), ["可燃ごみ", "粗大ごみ"], "suginami-2026", "x").contents);
    assert.ok(all.includes("🗑️"));
    assert.ok(all.includes("粗大ごみ"));
  });

  it("altText は渡した1行のまま", () => {
    assert.equal(reminderFlex(d("2026-10-03"), ["可燃ごみ"], "suginami-2026", "明日は…").altText, "明日は…");
  });

  it("締め切りを知らないソースでは、締め切りを載せない", () => {
    const all = texts(reminderFlex(d("2026-10-03"), ["可燃ごみ"], "other-2026", "x").contents);
    assert.ok(!all.some((t) => t.includes("までに集積所へ")));
    assert.ok(all.includes("今夜のうちに玄関にまとめておくと安心です。"));
  });

  it("テスト送信の目印を載せられる", () => {
    const all = texts(reminderFlex(d("2026-10-03"), ["可燃ごみ"], "suginami-2026", "x", { label: "【テスト送信】" }).contents);
    assert.ok(all.includes("【テスト送信】"));
  });

  it("画像のURLを渡すと、上部の画像と種別のアイコンを載せ、時間帯で上部の画像を替える", () => {
    const options = { imageBaseUrl: "https://example.dev/" };
    const evening = JSON.stringify(reminderFlex(d("2026-10-03"), ["可燃ごみ"], "suginami-2026", "x", options).contents);
    assert.match(evening, /"hero":\{"type":"image","url":"https:\/\/example\.dev\/images\/hero\.png\?v=\d+"/);
    assert.match(evening, /"url":"https:\/\/example\.dev\/images\/kanen\.png\?v=\d+"/);
    assert.ok(!evening.includes("🔥"));

    const morning = JSON.stringify(
      reminderFlex(d("2026-10-03"), ["可燃ごみ"], "suginami-2026", "x", { ...options, slot: "morning" }).contents,
    );
    assert.match(morning, /images\/hero-morning\.png/);
  });

  it("画像のURLがなければ、上部の画像を付けず絵文字を使う", () => {
    const flex = reminderFlex(d("2026-10-03"), ["可燃ごみ"], "suginami-2026", "x");
    assert.ok(!JSON.stringify(flex.contents).includes('"hero"'));
  });
});
