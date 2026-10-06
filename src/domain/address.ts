import type { NormalizedAddress } from "./types.ts";

const KANJI_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

// 全角→半角、ハイフンの揺れ、漢数字の丁目をそろえる
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[‐‑‒–—―−ー－]/g, "-")
    .replace(/(十)?([一二三四五六七八九])?(?=丁目)/g, (match, ten?: string, digit?: string) => {
      if (!match) return match;
      return String((ten ? 10 : 0) + (digit ? KANJI_DIGITS[digit] : 0));
    });
}

export interface AddressSpace {
  prefecture: string;
  city: string;
  towns: readonly string[];
  // 別表記 → 正式な町名
  aliases: Readonly<Record<string, string>>;
}

export type ParseResult =
  | { ok: true; address: NormalizedAddress }
  | { ok: false; reason: "unknown_town" | "other_city" };

// 都道府県・区市町村は省略可。町名は最長一致で拾い、続く数字を丁目とみなす。
export function parseAddress(input: string, space: AddressSpace): ParseResult {
  let rest = normalizeText(input);
  if (rest.startsWith(space.prefecture)) rest = rest.slice(space.prefecture.length);
  if (rest.startsWith(space.city)) {
    rest = rest.slice(space.city.length);
  } else if (/^.+?[市区町村]/.test(rest) && !matchTown(rest, space)) {
    return { ok: false, reason: "other_city" };
  }

  const matched = matchTown(rest, space);
  if (!matched) return { ok: false, reason: "unknown_town" };

  const chomeMatch = /^(\d+)(?:丁目|-|$)/.exec(rest.slice(matched.length));
  return {
    ok: true,
    address: {
      prefecture: space.prefecture,
      city: space.city,
      town: matched.town,
      chome: chomeMatch ? Number(chomeMatch[1]) : undefined,
    },
  };
}

function matchTown(rest: string, space: AddressSpace): { town: string; length: number } | undefined {
  const candidates = [
    ...space.towns.map((name) => ({ name, town: name })),
    ...Object.entries(space.aliases).map(([name, town]) => ({ name, town })),
  ]
    .filter(({ name }) => rest.startsWith(name))
    .sort((a, b) => b.name.length - a.name.length);
  const best = candidates[0];
  return best && { town: best.town, length: best.name.length };
}
