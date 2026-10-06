// リクエストのパラメータを domain の入力に変換し、結果をHTTPのステータスとボディに変換する。
// node:http には依存しない。
import { addDays, daysInRange, parsePlainDate, todayInTokyo } from "../domain/date.ts";
import type { CollectionService, LookupError, LookupErrorCode, LookupQuery } from "../domain/service.ts";
import type { PlainDate } from "../domain/types.ts";

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface Controller {
  getCollections(params: URLSearchParams): HttpResponse;
  getCalendar(params: URLSearchParams): HttpResponse;
}

// /calendar の期間の上限と、省略したときの長さ
const MAX_CALENDAR_DAYS = 366;
const DEFAULT_CALENDAR_DAYS = 7;

const STATUS: Record<LookupErrorCode, number> = {
  invalid_postal_code: 400,
  postal_code_mismatch: 400,
  unsupported_postal_code: 404,
  unsupported_city: 404,
  unknown_town: 404,
  unknown_chome: 404,
  date_out_of_range: 404,
};

export function error(status: number, code: string, message: string, suggestions?: string[]): HttpResponse {
  return { status, body: { error: { code, message, ...(suggestions && { suggestions }) } } };
}

function fromLookupError(e: LookupError): HttpResponse {
  return error(STATUS[e.code], e.code, e.message, e.suggestions);
}

function parseQuery(params: URLSearchParams): LookupQuery | HttpResponse {
  const address = params.get("address") || undefined;
  const postalCode = params.get("zipcode") || undefined;
  if (!address && !postalCode) return error(400, "missing_address", "address か zipcode を指定してください");
  return { address, postalCode };
}

function parseDate(params: URLSearchParams, name: string, fallback: PlainDate): PlainDate | HttpResponse {
  const value = params.get(name);
  if (value === null) return fallback;
  return parsePlainDate(value) ?? error(400, "invalid_date", `${name} は YYYY-MM-DD 形式で指定してください`);
}

// today は日本時間の「今日」。テストでは固定の日付を渡す
export function createController(service: CollectionService, today: () => PlainDate = todayInTokyo): Controller {
  return {
    // GET /collections?address=…&zipcode=…&date=YYYY-MM-DD
    getCollections(params) {
      const query = parseQuery(params);
      if ("status" in query) return query;
      const date = parseDate(params, "date", today());
      if (typeof date !== "string") return date;

      const result = service.lookup(query, date);
      if (!result.ok) return fromLookupError(result);
      return {
        status: 200,
        body: {
          date,
          address: result.address,
          source: result.source,
          types: result.types,
          ...(result.candidates && { candidates: result.candidates }),
        },
      };
    },

    // GET /calendar?address=…&zipcode=…&from=YYYY-MM-DD&to=YYYY-MM-DD
    getCalendar(params) {
      const query = parseQuery(params);
      if ("status" in query) return query;
      const from = parseDate(params, "from", today());
      if (typeof from !== "string") return from;
      const to = parseDate(params, "to", addDays(from, DEFAULT_CALENDAR_DAYS - 1));
      if (typeof to !== "string") return to;
      if (from > to) return error(400, "invalid_range", "from は to 以前の日付にしてください");
      if (daysInRange(from, to) > MAX_CALENDAR_DAYS) {
        return error(400, "invalid_range", `期間は${MAX_CALENDAR_DAYS}日以内にしてください`);
      }

      const result = service.lookupRange(query, from, to);
      if (!result.ok) return fromLookupError(result);
      return {
        status: 200,
        body: {
          from,
          to,
          address: result.address,
          sources: result.sources,
          days: result.days,
          ...(result.candidates && { candidates: result.candidates }),
        },
      };
    },
  };
}
