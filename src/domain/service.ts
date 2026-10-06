// ユースケース: 住所（または郵便番号）と日付から、その日のごみ種別を返す
import { normalizeText, parseAddress } from "./address.ts";
import { addDays } from "./date.ts";
import { AddressNotFoundError } from "./rules.ts";
import type { CollectionSource, GarbageType, NormalizedAddress, PlainDate } from "./types.ts";

export interface LookupQuery {
  address?: string;
  postalCode?: string;
}

export type LookupErrorCode =
  | "invalid_postal_code"
  | "postal_code_mismatch"
  | "unsupported_postal_code"
  | "unsupported_city"
  | "unknown_town"
  | "unknown_chome"
  | "date_out_of_range";

export interface LookupError {
  ok: false;
  code: LookupErrorCode;
  message: string;
  // 正しい町名・丁目の候補。成功時の candidates（丁目ごとの答え）とは別物
  suggestions?: string[];
}

export interface Candidate {
  chome: number[];
  types: GarbageType[];
}

export type LookupResult =
  | {
      ok: true;
      source: string;
      address: NormalizedAddress;
      // 候補によって答えが分かれる日は null
      types: GarbageType[] | null;
      // 丁目が決まらないとき、収集日が同じ丁目ごとの答え
      candidates?: Candidate[];
    }
  | LookupError;

export interface CalendarDay {
  date: PlainDate;
  types: GarbageType[] | null;
}

export interface CandidateCalendar {
  chome: number[];
  days: { date: PlainDate; types: GarbageType[] }[];
}

export type RangeResult =
  | {
      ok: true;
      // 期間が年度をまたぐと複数になる
      sources: string[];
      address: NormalizedAddress;
      days: CalendarDay[];
      candidates?: CandidateCalendar[];
    }
  | LookupError;

export interface CollectionService {
  lookup(query: LookupQuery, date: PlainDate): LookupResult;
  // from から to まで（両端を含む）
  lookupRange(query: LookupQuery, from: PlainDate, to: PlainDate): RangeResult;
}

type Resolved = { source: CollectionSource; address: NormalizedAddress }[];

export function createCollectionService(sources: readonly CollectionSource[]): CollectionService {
  function lookup(query: LookupQuery, date: PlainDate): LookupResult {
    const resolved = resolve(query, sources);
    if (!Array.isArray(resolved)) return resolved;

    const inRange = resolved.filter(({ source }) => source.validFrom <= date && date <= source.validTo);
    if (inRange.length === 0) {
      const ranges = resolved.map(({ source }) => `${source.id}: ${source.validFrom}〜${source.validTo}`);
      return { ok: false, code: "date_out_of_range", message: `対応期間外の日付です（${ranges.join(", ")}）` };
    }

    const { source, address } = inRange[0];
    const groups = source.chomeGroups(address.town);
    if (address.chome !== undefined) {
      try {
        return { ok: true, source: source.id, address, types: source.lookup(address, date) };
      } catch (e) {
        if (!(e instanceof AddressNotFoundError)) throw e;
        return {
          ok: false,
          code: "unknown_chome",
          message: e.message,
          suggestions: groups.flat().sort((a, b) => a - b).map((c) => `${address.town}${c}丁目`),
        };
      }
    }

    // 丁目が無い（町名だけ・郵便番号だけ）ときは、丁目のまとまりごとに答える
    const candidates = groups.map((chome) => ({ chome, types: source.lookup({ ...address, chome: chome[0] }, date) }));
    const agreed = candidates.every((c) => String(c.types) === String(candidates[0].types));
    return {
      ok: true,
      source: source.id,
      address,
      types: agreed ? candidates[0].types : null,
      ...(candidates.length > 1 && { candidates }),
    };
  }

  // 1日ずつ lookup するので、年度をまたぐ期間でも日ごとにソースを選び直せる
  function lookupRange(query: LookupQuery, from: PlainDate, to: PlainDate): RangeResult {
    const ids = new Set<string>();
    const days: CalendarDay[] = [];
    const calendars = new Map<string, CandidateCalendar>();
    let address: NormalizedAddress | undefined;

    for (let date = from; date <= to; date = addDays(date, 1)) {
      const result = lookup(query, date);
      if (!result.ok) return result;
      ids.add(result.source);
      address ??= result.address;
      days.push({ date, types: result.types });
      for (const { chome, types } of result.candidates ?? []) {
        const key = String(chome);
        if (!calendars.has(key)) calendars.set(key, { chome, days: [] });
        calendars.get(key)!.days.push({ date, types });
      }
    }

    if (!address) throw new Error("from が to より後です");
    return {
      ok: true,
      sources: [...ids],
      address,
      days,
      ...(calendars.size > 0 && { candidates: [...calendars.values()] }),
    };
  }

  return { lookup, lookupRange };
}

function resolve(query: LookupQuery, sources: readonly CollectionSource[]): Resolved | LookupError {
  const byPostal = query.postalCode !== undefined ? resolvePostalCode(query.postalCode, sources) : undefined;
  if (byPostal && !Array.isArray(byPostal)) return byPostal;
  if (query.address === undefined) return byPostal ?? [];

  const byAddress = resolveAddress(query.address, sources);
  if (!byPostal || !Array.isArray(byAddress)) return byAddress;
  const consistent = byAddress.filter((a) =>
    byPostal.some((p) => p.source === a.source && p.address.town === a.address.town),
  );
  if (consistent.length === 0) {
    return { ok: false, code: "postal_code_mismatch", message: "郵便番号と住所の町名が一致しません" };
  }
  return consistent;
}

function resolvePostalCode(input: string, sources: readonly CollectionSource[]): Resolved | LookupError {
  const code = normalizeText(input).replace(/^〒/, "").replace("-", "");
  if (!/^\d{7}$/.test(code)) {
    return { ok: false, code: "invalid_postal_code", message: "郵便番号は7桁で指定してください" };
  }
  const hits = sources.flatMap((source) => {
    const town = source.postalCodes()[code];
    return town ? [{ source, address: { prefecture: source.prefecture, city: source.city, town } }] : [];
  });
  if (hits.length === 0) {
    return { ok: false, code: "unsupported_postal_code", message: "この郵便番号の地域にはまだ対応していません" };
  }
  return hits;
}

function resolveAddress(input: string, sources: readonly CollectionSource[]): Resolved | LookupError {
  const parsed = sources.map((source) => ({
    source,
    result: parseAddress(input, {
      prefecture: source.prefecture,
      city: source.city,
      towns: source.towns(),
      aliases: source.aliases(),
    }),
  }));
  const hits = parsed.flatMap(({ source, result }) => (result.ok ? [{ source, address: result.address }] : []));
  if (hits.length > 0) return hits;

  const otherCity = parsed.every((p) => !p.result.ok && p.result.reason === "other_city");
  return otherCity
    ? { ok: false, code: "unsupported_city", message: "この自治体にはまだ対応していません" }
    : {
        ok: false,
        code: "unknown_town",
        message: "町名が見つかりません",
        suggestions: [...new Set(sources.flatMap((s) => s.towns()))],
      };
}
