// Authorization: Bearer <token> を確かめる。
// 期待するトークンが未設定なら、設定漏れで公開状態にならないよう常に拒否する
import { error, type HttpResponse } from "./controller.ts";

export async function authorize(header: string | null, expected: string | undefined): Promise<HttpResponse | undefined> {
  if (!expected) return error(503, "auth_not_configured", "API_TOKEN が設定されていません");
  const token = header?.match(/^Bearer\s+(.+)$/)?.[1];
  if (!token || !(await sameSecret(token, expected))) {
    return error(401, "unauthorized", "Authorization: Bearer <トークン> を付けてください");
  }
  return undefined;
}

// 文字列を直接比べると一致した長さで応答時間が変わるので、ハッシュ同士を比べる
async function sameSecret(a: string, b: string): Promise<boolean> {
  const digest = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  return x.every((byte, i) => byte === y[i]);
}
