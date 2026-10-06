// Cloudflare Workers の入口。トークンを確かめてから controller に渡す
import { bundledSources } from "./data/bundled-sources.ts";
import { createCollectionService } from "./domain/service.ts";
import { authorize } from "./http/auth.ts";
import { createController, type HttpResponse } from "./http/controller.ts";
import { route } from "./http/router.ts";

export interface Env {
  // wrangler secret put API_TOKEN で設定する
  API_TOKEN?: string;
}

const controller = createController(createCollectionService(bundledSources()));

function toResponse({ status, body }: HttpResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const denied = await authorize(request.headers.get("authorization"), env.API_TOKEN);
    if (denied) return toResponse(denied);
    return toResponse(route(controller, request.method, new URL(request.url)));
  },
};
