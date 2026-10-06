// data/*.json（自治体・年度ごとに1ファイル）をファイルから読み込む（Node 用）
import { readdirSync, readFileSync } from "node:fs";
import { createRuleSource } from "../domain/rules.ts";
import type { CollectionSource } from "../domain/types.ts";
import { parseSourceData } from "./parse.ts";

const DATA_DIR = new URL("../../data/", import.meta.url);

// 日付が壊れていれば起動時に例外にする
export function loadSources(dir: URL = DATA_DIR): CollectionSource[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => parseSourceData(JSON.parse(readFileSync(new URL(name, dir), "utf8"))))
    .map(createRuleSource);
}
