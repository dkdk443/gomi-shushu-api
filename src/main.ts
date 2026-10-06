// 組み立て: データを読み込み → domain → controller → サーバー
import { createServer } from "node:http";
import { loadSources } from "./data/load-sources.ts";
import { createCollectionService } from "./domain/service.ts";
import { createController } from "./http/controller.ts";
import { createRequestListener } from "./http/server.ts";

export function createApp() {
  const service = createCollectionService(loadSources());
  return createRequestListener(createController(service));
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer(createApp()).listen(port, () => {
    console.log(`http://localhost:${port}/collections?address=杉並区阿佐谷北1丁目&date=2026-10-06`);
    console.log(`http://localhost:${port}/calendar?address=杉並区阿佐谷北1丁目&from=2026-10-01&to=2026-10-31`);
  });
}
