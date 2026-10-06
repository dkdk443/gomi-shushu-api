import type { PlainDate } from "./types.ts";

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// 外から来た文字列（クエリなど）を確かめる。存在しない日付（2026-02-30 など）も弾く
export function parsePlainDate(value: string): PlainDate | undefined {
  const m = PLAIN_DATE.exec(value);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const valid = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return valid ? (value as PlainDate) : undefined;
}

// 正しいはずの値（データファイル・テストに書いた日付）に使う。不正なら例外
export function toPlainDate(value: string): PlainDate {
  const date = parsePlainDate(value);
  if (!date) throw new Error(`YYYY-MM-DD 形式の日付ではありません: ${value}`);
  return date;
}

function parts(date: PlainDate): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

export function weekdayOf(date: PlainDate): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// その曜日が月の何回目か。1～7日が第1、8～14日が第2…
export function nthInMonth(date: PlainDate): number {
  return Math.ceil(parts(date)[2] / 7);
}

export function todayInTokyo(now: Date = new Date()): PlainDate {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now) as PlainDate;
}

export function addDays(date: PlainDate, days: number): PlainDate {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) as PlainDate;
}

// from から to まで（両端を含む）の日数
export function daysInRange(from: PlainDate, to: PlainDate): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000 + 1;
}
