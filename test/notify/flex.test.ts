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
  const flex = reminderFlex(d("2026-10-03"), ["可燃ごみ", "粗大ごみ"], "suginami-2026", "明日 10/3（土）は…");

  it("日付・曜日・種別と、締め切りを載せる", () => {
    const all = texts(flex.contents);
    for (const t of ["10/3", "（土）", "🔥", "可燃ごみ", "⏰ 朝8時までに出してね"]) assert.ok(all.includes(t), t);
  });

  it("知らない種別は、共通の絵文字で載せる", () => {
    const all = texts(flex.contents);
    assert.ok(all.includes("🗑️"));
    assert.ok(all.includes("粗大ごみ"));
  });

  it("altText は渡した1行のまま", () => {
    assert.equal(flex.altText, "明日 10/3（土）は…");
  });

  it("締め切りを知らないソースでは、締め切りを載せない", () => {
    const all = texts(reminderFlex(d("2026-10-03"), ["可燃ごみ"], "other-2026", "x").contents);
    assert.ok(!all.some((t) => t.startsWith("⏰")));
  });

  it("テスト送信の目印を載せられる", () => {
    const all = texts(reminderFlex(d("2026-10-03"), ["可燃ごみ"], "suginami-2026", "x", { label: "【テスト送信】" }).contents);
    assert.ok(all.includes("【テスト送信】"));
  });

  it("画像のURLを渡すと、上部の画像と種別のアイコンを載せる", () => {
    const json = JSON.stringify(
      reminderFlex(d("2026-10-03"), ["可燃ごみ"], "suginami-2026", "x", { imageBaseUrl: "https://example.dev/" }).contents,
    );
    assert.match(json, /"hero":\{"type":"image","url":"https:\/\/example\.dev\/images\/hero\.png\?v=\d+"/);
    assert.match(json, /"url":"https:\/\/example\.dev\/images\/kanen\.png\?v=\d+"/);
    assert.ok(!json.includes("🔥"));
  });

  it("夜は「明日のごみ」、朝は「今日のごみ」にして、上部の画像も替える", () => {
    const options = { imageBaseUrl: "https://example.dev" };
    const evening = JSON.stringify(reminderFlex(d("2026-10-03"), ["可燃ごみ"], "suginami-2026", "x", options).contents);
    assert.ok(texts(JSON.parse(evening)).includes("明日のごみ"));
    assert.match(evening, /images\/hero\.png/);

    const morningFlex = reminderFlex(d("2026-10-03"), ["可燃ごみ"], "suginami-2026", "x", { ...options, slot: "morning" });
    const morning = JSON.stringify(morningFlex.contents);
    assert.ok(texts(morningFlex.contents).includes("今日のごみ"));
    assert.match(morning, /images\/hero-morning\.png/);
    assert.notEqual(
      (morningFlex.contents as { header: { backgroundColor: string } }).header.backgroundColor,
      (JSON.parse(evening) as { header: { backgroundColor: string } }).header.backgroundColor,
    );
  });

  it("画像のURLがなければ、上部の画像を付けず絵文字を使う", () => {
    assert.ok(!JSON.stringify(flex.contents).includes('"hero"'));
  });
});
