// ごみ出しの通知文を作る（朝は当日、夜は翌日の分）。送る必要がない日（収集なし）は undefined
// 通知やトーク一覧に出る1行で、カードの altText にも使う
import { weekdayOf } from "../domain/date.ts";
import type { LookupResult } from "../domain/service.ts";
import type { PlainDate } from "../domain/types.ts";
import { deadlineOf } from "./deadline.ts";
import type { TimeSlot } from "./slot.ts";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 10/2（金）
function label(date: PlainDate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${WEEKDAYS[weekdayOf(date)]}）`;
}

// かっこの中に入れる日付。10/2 金
function shortLabel(date: PlainDate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d} ${WEEKDAYS[weekdayOf(date)]}`;
}

export function reminderMessage(result: LookupResult, date: PlainDate, slot: TimeSlot = "evening"): string | undefined {
  // 設定した住所が間違っている・データの期間が切れたなどは、気づけるよう通知する
  if (!result.ok) return `ごみ通知: ${label(date)}の収集日を調べられませんでした（${result.code}: ${result.message}）`;
  if (result.types === null) {
    return `ごみ通知: 丁目によって収集日が違います。NOTIFY_ADDRESS に丁目まで指定してください`;
  }
  const { types } = result;
  if (types.length === 0) return undefined;

  const what = types.length === 1 ? `${types[0]}の日です` : `${types.length}種類：${types.join("、")}`;
  if (slot === "morning") {
    // 当日の朝は、日付より締め切りのほうが役に立つ
    const deadline = deadlineOf(result.source);
    return `おはようございます。今日は${what}（${deadline ? `${deadline}まで` : shortLabel(date)}）`;
  }
  return `明日は${what}（${shortLabel(date)}）`;
}
