// 「毎週〇曜」「第n〇曜」と例外日で表した自治体データを、CollectionSource にする
import { nthInMonth, weekdayOf } from "./date.ts";
import {
  GARBAGE_TYPES,
  type CollectionSource,
  type ExceptionDate,
  type GarbageType,
  type PlainDate,
  type WeekdayRule,
} from "./types.ts";

export interface Area {
  town: string;
  chome: number[];
  rules: Record<GarbageType, WeekdayRule[]>;
  calendarUrl: string;
}

// data/*.json の形
export interface RuleSourceData {
  id: string;
  prefecture: string;
  city: string;
  validFrom: PlainDate;
  validTo: PlainDate;
  aliases: Record<string, string>;
  postalCodes: Record<string, string>;
  exceptions: ExceptionDate[];
  areas: Area[];
}

export class AddressNotFoundError extends Error {}

function matches(rule: WeekdayRule, date: PlainDate): boolean {
  if (weekdayOf(date) !== rule.weekday) return false;
  return !rule.nth || rule.nth.includes(nthInMonth(date));
}

export function createRuleSource(data: RuleSourceData): CollectionSource {
  const towns = [...new Set(data.areas.map((a) => a.town))];

  // CSVでは収集日が同じ丁目が別の行に分かれていることがある（高円寺南1・5丁目など）ので、
  // ルールが同じ行をまとめる
  function chomeGroups(town: string): number[][] {
    const groups = new Map<string, number[]>();
    for (const area of data.areas.filter((a) => a.town === town)) {
      const key = JSON.stringify(area.rules);
      groups.set(key, [...(groups.get(key) ?? []), ...area.chome]);
    }
    return [...groups.values()]
      .map((chome) => chome.sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0]);
  }

  return {
    id: data.id,
    prefecture: data.prefecture,
    city: data.city,
    validFrom: data.validFrom,
    validTo: data.validTo,
    towns: () => towns,
    aliases: () => data.aliases,
    postalCodes: () => data.postalCodes,
    chomeGroups,
    lookup(address, date) {
      const area = data.areas.find((a) => a.town === address.town && a.chome.includes(address.chome!));
      if (!area) throw new AddressNotFoundError(`${address.town}${address.chome}丁目は見つかりません`);
      const types = new Set(GARBAGE_TYPES.filter((type) => area.rules[type].some((r) => matches(r, date))));
      for (const ex of data.exceptions.filter((e) => e.date === date)) {
        for (const type of ex.types ?? GARBAGE_TYPES) {
          if (ex.action === "cancel") types.delete(type);
          else types.add(type);
        }
      }
      return GARBAGE_TYPES.filter((type) => types.has(type));
    },
  };
}
