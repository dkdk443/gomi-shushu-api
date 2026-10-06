// data/*.json をビルド時にコードへ組み込む（Workers 用。ファイルを読めないため）。
// data/ にファイルを足したら、ここにも足す（test/data で data/ と一致するか確かめている）
import suginami2026 from "../../data/suginami-2026.json" with { type: "json" };
import { createRuleSource } from "../domain/rules.ts";
import type { CollectionSource } from "../domain/types.ts";
import { parseSourceData, type RawSourceData } from "./parse.ts";

export const BUNDLED: Record<string, RawSourceData> = {
  "suginami-2026.json": suginami2026 as RawSourceData,
};

export function bundledSources(): CollectionSource[] {
  return Object.values(BUNDLED).map(parseSourceData).map(createRuleSource);
}
