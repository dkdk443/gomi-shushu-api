// Cloudflare Workers の入口。
// fetch: トークンを確かめてから controller に渡す。POST /notify はテスト送信
// scheduled: Cron Trigger（wrangler.toml）で毎日呼ばれ、翌日のごみを LINE に通知する
import { bundledSources } from "./data/bundled-sources.ts";
import { addDays, parsePlainDate, todayInTokyo } from "./domain/date.ts";
import { createCollectionService } from "./domain/service.ts";
import type { PlainDate } from "./domain/types.ts";
import { authorize } from "./http/auth.ts";
import { createController, error, type HttpResponse } from "./http/controller.ts";
import { route } from "./http/router.ts";
import { pushLineMessage } from "./notify/line.ts";
import { reminderMessage } from "./notify/message.ts";

// どれも wrangler secret put で設定する（住所も公開リポジトリに書かないため secret にする）
export interface Env {
  API_TOKEN?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  // 通知先の LINE ユーザーID（U で始まる）
  LINE_USER_ID?: string;
  // 例: 杉並区阿佐谷北1丁目
  NOTIFY_ADDRESS?: string;
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

// date の分の通知を送り、送った文面を返す。収集がない日は送らずに undefined。prefix はテスト送信の目印
async function notify(env: Env, date: PlainDate, fetchFn: typeof fetch, prefix = ""): Promise<string | undefined> {
  const { LINE_CHANNEL_ACCESS_TOKEN: token, LINE_USER_ID: to, NOTIFY_ADDRESS: address } = env;
  if (!token || !to || !address) {
    throw new NotifyNotConfiguredError("LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID / NOTIFY_ADDRESS が設定されていません");
  }
  const message = reminderMessage(service.lookup({ address }, date), date);
  if (!message) return undefined;
  const text = prefix + message;
  await pushLineMessage(token, to, text, fetchFn);
  return text;
}

// 予定時刻（日本時間）の翌日について通知する
export async function notifyTomorrow(env: Env, now: Date, fetchFn: typeof fetch = fetch): Promise<void> {
  await notify(env, addDays(todayInTokyo(now), 1), fetchFn);
}

// POST /notify?date=YYYY-MM-DD: Cron を待たずにテスト送信する。date を省略すると翌日。
// 文面は Cron と同じ（「明日」のまま）で、先頭に【テスト送信】を付ける
export async function handleNotify(env: Env, url: URL, now: Date, fetchFn: typeof fetch = fetch): Promise<HttpResponse> {
  const param = url.searchParams.get("date");
  const date = param === null ? addDays(todayInTokyo(now), 1) : parsePlainDate(param);
  if (!date) return error(400, "invalid_date", "date は YYYY-MM-DD 形式で指定してください");
  try {
    const text = await notify(env, date, fetchFn, "【テスト送信】");
    return { status: 200, body: { date, sent: text !== undefined, ...(text && { text }) } };
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
    ctx.waitUntil(notifyTomorrow(env, new Date(event.scheduledTime)));
  },
};
