// Cloudflare Workers の入口。
// fetch: トークンを確かめてから controller に渡す。POST /notify はテスト送信
// scheduled: Cron Trigger（wrangler.toml）で毎日朝と夜に呼ばれ、朝は当日、夜は翌日のごみを LINE に通知する
import { bundledSources } from "./data/bundled-sources.ts";
import { parsePlainDate } from "./domain/date.ts";
import { createCollectionService } from "./domain/service.ts";
import type { PlainDate } from "./domain/types.ts";
import { authorize } from "./http/auth.ts";
import { createController, error, type HttpResponse } from "./http/controller.ts";
import { route } from "./http/router.ts";
import { reminderFlex } from "./notify/flex.ts";
import { pushLineMessage } from "./notify/line.ts";
import { reminderMessage } from "./notify/message.ts";
import { slotAt, targetDate, TIME_SLOTS, type TimeSlot } from "./notify/slot.ts";

// どれも wrangler secret put で設定する（住所も公開リポジトリに書かないため secret にする）
export interface Env {
  API_TOKEN?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  // 通知先の LINE ユーザーID（U で始まる）
  LINE_USER_ID?: string;
  // 例: 杉並区阿佐谷北1丁目
  NOTIFY_ADDRESS?: string;
  // 通知カードの画像（public/images/）を配っている、この Worker のURL。未設定なら画像なしで送る
  PUBLIC_BASE_URL?: string;
}

// Workers の ScheduledController のうち使う部分
interface ScheduledEvent {
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const service = createCollectionService(bundledSources());
const controller = createController(service);

function toResponse({ status, body }: HttpResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
  });
}

class NotifyNotConfiguredError extends Error {}

interface Sent {
  // 通知やトーク一覧に出る1行
  text: string;
  // カードを LINE に断られてテキストで送り直したとき、その理由
  flexError?: string;
}

// date の分の通知を slot の時間帯の見た目で送る。収集がない日は送らずに undefined。prefix はテスト送信の目印
async function notify(
  env: Env,
  date: PlainDate,
  slot: TimeSlot,
  fetchFn: typeof fetch,
  prefix = "",
): Promise<Sent | undefined> {
  const { LINE_CHANNEL_ACCESS_TOKEN: token, LINE_USER_ID: to, NOTIFY_ADDRESS: address } = env;
  if (!token || !to || !address) {
    throw new NotifyNotConfiguredError("LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID / NOTIFY_ADDRESS が設定されていません");
  }
  const result = service.lookup({ address }, date);
  const message = reminderMessage(result, date, slot);
  if (!message) return undefined;
  const text = prefix + message;

  // 収集がある日はカードで送る。エラーなどはテキストのまま
  if (result.ok && result.types !== null && result.types.length > 0) {
    try {
      await pushLineMessage(token, to, reminderFlex(date, result.types, result.source, text, {
        label: prefix || undefined,
        imageBaseUrl: env.PUBLIC_BASE_URL,
        slot,
      }), fetchFn);
      return { text };
    } catch (e) {
      // カードの形が LINE に断られても、通知自体は届くようテキストで送り直す
      await pushLineMessage(token, to, { type: "text", text }, fetchFn);
      return { text, flexError: e instanceof Error ? e.message : String(e) };
    }
  }
  await pushLineMessage(token, to, { type: "text", text }, fetchFn);
  return { text };
}

// 予定時刻（日本時間）が朝なら当日、夜なら翌日について通知する
export async function notifyScheduled(env: Env, now: Date, fetchFn: typeof fetch = fetch): Promise<void> {
  const slot = slotAt(now);
  const sent = await notify(env, targetDate(slot, now), slot, fetchFn);
  if (sent?.flexError) console.error(`カードを送れず、テキストで送り直しました: ${sent.flexError}`);
}

// POST /notify?date=YYYY-MM-DD&slot=morning|evening: Cron を待たずにテスト送信する。
// slot を省略すると送った時刻（日本時間の正午より前なら朝）で決め、date を省略すると朝は当日、夜は翌日。
// 文面は Cron と同じ（朝は「今日」、夜は「明日」のまま）で、先頭に【テスト送信】を付ける
export async function handleNotify(env: Env, url: URL, now: Date, fetchFn: typeof fetch = fetch): Promise<HttpResponse> {
  const slotParam = url.searchParams.get("slot");
  if (slotParam !== null && !TIME_SLOTS.includes(slotParam as TimeSlot)) {
    return error(400, "invalid_slot", "slot は morning か evening を指定してください");
  }
  const slot = (slotParam as TimeSlot | null) ?? slotAt(now);
  const param = url.searchParams.get("date");
  const date = param === null ? targetDate(slot, now) : parsePlainDate(param);
  if (!date) return error(400, "invalid_date", "date は YYYY-MM-DD 形式で指定してください");
  try {
    const sent = await notify(env, date, slot, fetchFn, "【テスト送信】");
    return { status: 200, body: { date, slot, sent: sent !== undefined, ...sent } };
  } catch (e) {
    if (e instanceof NotifyNotConfiguredError) return error(503, "notify_not_configured", e.message);
    return error(502, "line_error", e instanceof Error ? e.message : String(e));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const denied = await authorize(request.headers.get("authorization"), env.API_TOKEN);
    if (denied) return toResponse(denied);
    const url = new URL(request.url);
    if (url.pathname === "/notify") {
      if (request.method !== "POST") return toResponse(error(405, "method_not_allowed", "POST のみ対応しています"));
      return toResponse(await handleNotify(env, url, new Date()));
    }
    return toResponse(route(controller, request.method, url));
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(notifyScheduled(env, new Date(event.scheduledTime)));
  },
};
