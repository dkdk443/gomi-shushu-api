// 翌日のごみを、色と絵文字で見分けられる LINE の Flex Message（カード）にする
// https://developers.line.biz/ja/docs/messaging-api/using-flex-messages/
import { weekdayOf } from "../domain/date.ts";
import type { PlainDate } from "../domain/types.ts";

interface TypeStyle {
  emoji: string;
  // public/images/ のアイコン
  icon: string;
  color: string;
  background: string;
}

// 種別ごとの見た目。知らない種別（ほかの自治体を足したとき）は DEFAULT_STYLE
const STYLES: Record<string, TypeStyle> = {
  "可燃ごみ": { emoji: "🔥", icon: "kanen.png", color: "#E8590C", background: "#FFF4E6" },
  "不燃ごみ": { emoji: "🔩", icon: "funen.png", color: "#4263EB", background: "#EDF2FF" },
  "びん・かん・プラ": { emoji: "🥫", icon: "bin-kan-pura.png", color: "#0CA678", background: "#E6FCF5" },
  "古紙・ペットボトル": { emoji: "📰", icon: "koshi-petbottle.png", color: "#E67700", background: "#FFF9DB" },
};
const DEFAULT_STYLE: TypeStyle = { emoji: "🗑️", icon: "default.png", color: "#495057", background: "#F1F3F5" };

// LINE は画像をURLごとにキャッシュするので、画像を差し替えたら上げる
const IMAGE_VERSION = 1;

// 出す時刻の締め切り。ソースごとに区の案内に合わせる
const DEADLINES: Record<string, string> = {
  "suginami-2026": "朝8時までに出してね",
};

// 毎回同じだと見なくなるので、日付で入れ替える
const CHEERS = ["いってらっしゃい！", "今日もおつかれさま 🌙", "忘れずにね 👋", "ナイスごみ出しを ✨", "おやすみなさい 💤"];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKEND_COLORS: Record<number, string> = { 0: "#FFC9C9", 6: "#A5D8FF" };
// hero.png の夜空と同じ色にして、帯と画像をつなげる
const HEADER_COLOR = "#1E2A5E";

export interface FlexMessage {
  type: "flex";
  altText: string;
  contents: unknown;
}

export interface FlexOptions {
  // テスト送信の目印
  label?: string;
  // 画像を配っている場所（例: https://….workers.dev）。未設定なら画像なしで、絵文字を使う
  imageBaseUrl?: string;
}

function imageUrl(base: string, name: string): string {
  return `${base.replace(/\/$/, "")}/images/${name}?v=${IMAGE_VERSION}`;
}

function typeRow(type: string, imageBaseUrl: string | undefined) {
  const style = STYLES[type] ?? DEFAULT_STYLE;
  const icon = imageBaseUrl
    ? { type: "image", url: imageUrl(imageBaseUrl, style.icon), size: "44px", aspectRatio: "1:1", flex: 0 }
    : { type: "text", text: style.emoji, size: "xxl", flex: 0 };
  return {
    type: "box",
    layout: "horizontal",
    backgroundColor: style.background,
    cornerRadius: "lg",
    paddingAll: "lg",
    spacing: "lg",
    alignItems: "center",
    contents: [
      icon,
      { type: "text", text: type, size: "lg", weight: "bold", color: style.color, wrap: true },
    ],
  };
}

// altText は通知やトーク一覧に出る1行
export function reminderFlex(
  date: PlainDate,
  types: readonly string[],
  source: string,
  altText: string,
  { label, imageBaseUrl }: FlexOptions = {},
): FlexMessage {
  const [, m, d] = date.split("-").map(Number);
  const weekday = weekdayOf(date);
  const deadline = DEADLINES[source];
  const cheer = CHEERS[(m * 31 + d) % CHEERS.length];

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: HEADER_COLOR,
        paddingAll: "lg",
        contents: [
          ...(label ? [{ type: "text", text: label, size: "xs", color: "#FFE066", weight: "bold" }] : []),
          { type: "text", text: "明日のごみ", size: "sm", color: "#C5CAE9" },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: `${m}/${d}`, size: "3xl", weight: "bold", color: "#FFFFFF", flex: 0 },
              {
                type: "text",
                text: `（${WEEKDAYS[weekday]}）`,
                size: "lg",
                weight: "bold",
                color: WEEKEND_COLORS[weekday] ?? "#FFFFFF",
                flex: 0,
              },
            ],
          },
        ],
      },
      ...(imageBaseUrl && {
        hero: {
          type: "image",
          url: imageUrl(imageBaseUrl, "hero.png"),
          size: "full",
          aspectRatio: "2:1",
          aspectMode: "cover",
        },
      }),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "lg",
        contents: types.map((type) => typeRow(type, imageBaseUrl)),
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingTop: "none",
        paddingAll: "lg",
        contents: [
          ...(deadline ? [{ type: "text", text: `⏰ ${deadline}`, size: "sm", color: "#495057", weight: "bold" }] : []),
          { type: "text", text: cheer, size: "xs", color: "#868E96", margin: "sm" },
        ],
      },
    },
  };
}
