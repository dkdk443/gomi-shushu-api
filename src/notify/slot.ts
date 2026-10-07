// 通知を送る時間帯。朝は当日、夜は翌日のごみを知らせ、カードの見た目も変える
import { addDays, todayInTokyo } from "../domain/date.ts";
import type { PlainDate } from "../domain/types.ts";

export type TimeSlot = "morning" | "evening";

export const TIME_SLOTS: readonly TimeSlot[] = ["morning", "evening"];

// 日本時間の正午より前なら朝
export function slotAt(now: Date): TimeSlot {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return hour < 12 ? "morning" : "evening";
}

// その時間帯に知らせる日。朝は当日、夜は翌日
export function targetDate(slot: TimeSlot, now: Date): PlainDate {
  const today = todayInTokyo(now);
  return slot === "morning" ? today : addDays(today, 1);
}
