import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { readdirSync } from "node:fs";
import { BUNDLED } from "../../src/data/bundled-sources.ts";
import { loadSources } from "../../src/data/load-sources.ts";

function dirWith(files: Record<string, unknown>): URL {
  const dir = mkdtempSync(join(tmpdir(), "gomi-"));
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(data));
  return pathToFileURL(dir + "/");
}

const valid = {
  id: "test",
  prefecture: "東京都",
  city: "テスト区",
  validFrom: "2026-04-01",
  validTo: "2027-03-31",
  aliases: {},
  postalCodes: {},
  exceptions: [{ date: "2027-01-01", action: "cancel" }],
  areas: [],
};

describe("loadSources", () => {
  it("data/ の JSON を読み込む", () => {
    assert.deepEqual(loadSources().map((s) => s.id), ["suginami-2026"]);
  });

  it("JSON 以外のファイルは無視する", () => {
    const dir = dirWith({ "a.json": valid, "memo.txt": "x" });
    assert.equal(loadSources(dir).length, 1);
  });

  for (const [name, broken] of [
    ["validFrom", { ...valid, validFrom: "2026/04/01" }],
    ["例外日", { ...valid, exceptions: [{ date: "2027-02-30", action: "cancel" }] }],
  ] as const) {
    it(`${name}の日付が壊れていたら例外にする`, () => {
      assert.throws(() => loadSources(dirWith({ "a.json": broken })), /YYYY-MM-DD/);
    });
  }
});

describe("bundledSources（Workers 用）", () => {
  it("data/ の JSON をすべて組み込んでいる", () => {
    const files = readdirSync(new URL("../../data/", import.meta.url)).filter((name) => name.endsWith(".json"));
    assert.deepEqual(Object.keys(BUNDLED).sort(), files.sort());
  });
});
