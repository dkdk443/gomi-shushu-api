// Cloudflare Workers の入口。
// fetch: トークンを確かめてから controller に渡す
// scheduled: Cron Trigger（wrangler.toml）で毎日呼ばれ、翌日のごみを LINE に通知する
import { bundledSources } from "./data/bundled-sources.ts";
import { addDays, todayInTokyo } from "./domain/date.ts";
import { createCollectionService } from "./domain/service.ts";
import { authorize } from "./http/auth.ts";
import { createController, type HttpResponse } from "./http/controller.ts";
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

// 予定時刻（日本時間）の翌日について通知する。収集がない日は送らない
export async function notifyTomorrow(env: Env, now: Date, fetchFn: typeof fetch = fetch): Promise<void> {
  const { LINE_CHANNEL_ACCESS_TOKEN: token, LINE_USER_ID: to, NOTIFY_ADDRESS: address } = env;
  if (!token || !to || !address) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID / NOTIFY_ADDRESS が設定されていません");
  }
  const tomorrow = addDays(todayInTokyo(now), 1);
  const text = reminderMessage(service.lookup({ address }, tomorrow), tomorrow);
  if (text) await pushLineMessage(token, to, text, fetchFn);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const denied = await authorize(request.headers.get("authorization"), env.API_TOKEN);
    if (denied) return toResponse(denied);
    return toResponse(route(controller, request.method, new URL(request.url)));
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(notifyTomorrow(env, new Date(event.scheduledTime)));
  },
};
