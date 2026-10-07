// LINE Messaging API のプッシュメッセージで、1人にメッセージを1通送る
// https://developers.line.biz/ja/reference/messaging-api/#send-push-message
import type { FlexMessage } from "./flex.ts";

const PUSH_URL = "https://api.line.me/v2/bot/message/push";

export type LineMessage = { type: "text"; text: string } | FlexMessage;

export async function pushLineMessage(
  channelAccessToken: string,
  to: string,
  message: LineMessage,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchFn(PUSH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${channelAccessToken}` },
    body: JSON.stringify({ to, messages: [message] }),
  });
  if (!res.ok) throw new Error(`LINE への送信に失敗しました: ${res.status} ${await res.text()}`);
}
