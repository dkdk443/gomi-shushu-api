// パスとメソッドから controller を選ぶ。node:http にも Workers にも依存しない
import { error, type Controller, type HttpResponse } from "./controller.ts";

export function route(controller: Controller, method: string, url: URL): HttpResponse {
  const action = {
    "/collections": controller.getCollections,
    "/calendar": controller.getCalendar,
  }[url.pathname];
  if (!action) return error(404, "not_found", "GET /collections または GET /calendar を使ってください");
  if (method !== "GET") return error(405, "method_not_allowed", "GET のみ対応しています");
  return action(url.searchParams);
}
