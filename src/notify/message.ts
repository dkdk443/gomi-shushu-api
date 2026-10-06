// 前日に送るごみ出しの通知文を作る。送る必要がない日（収集なし）は undefined
import { weekdayOf } from "../domain/date.ts";
import type { LookupResult } from "../domain/service.ts";
import type { PlainDate } from "../domain/types.ts";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function label(date: PlainDate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${WEEKDAYS[weekdayOf(date)]}）`;
}

export function reminderMessage(result: LookupResult, date: PlainDate): string | undefined {
  // 設定した住所が間違っている・データの期間が切れたなどは、気づけるよう通知する
  if (!result.ok) return `ごみ通知: ${label(date)}の収集日を調べられませんでした（${result.code}: ${result.message}）`;
  if (result.types === null) {
    return `ごみ通知: 丁目によって収集日が違います。NOTIFY_ADDRESS に丁目まで指定してください`;
  }
  if (result.types.length === 0) return undefined;
  return `明日 ${label(date)}は${result.types.join("・")}の日です`;
}
