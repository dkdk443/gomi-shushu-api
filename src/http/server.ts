// node:http との接続だけを受け持つ（ローカル開発用。認証はしない）
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import type { Controller } from "./controller.ts";
import { route } from "./router.ts";

export function createRequestListener(controller: Controller): RequestListener {
  return (req: IncomingMessage, res: ServerResponse) => {
    const { status, body } = route(controller, req.method ?? "GET", new URL(req.url ?? "/", "http://localhost"));
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };
}
