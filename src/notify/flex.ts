// ごみの日を、色と絵文字で見分けられる LINE の Flex Message（カード）にする
// https://developers.line.biz/ja/docs/messaging-api/using-flex-messages/
import { weekdayOf } from "../domain/date.ts";
import type { PlainDate } from "../domain/types.ts";
import type { TimeSlot } from "./slot.ts";

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

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 送る時間帯ごとの見た目。上の帯は上部の画像の空と同じ色にして、帯と画像をつなげる
interface SlotStyle {
  heading: string;
  hero: string;
  headerColor: string;
  // 「今日のごみ」などの小さい文字
  subColor: string;
  // 日付
  mainColor: string;
  // テスト送信の目印
  labelColor: string;
  weekendColors: Record<number, string>;
  // 毎回同じだと見なくなるので、日付で入れ替える
  cheers: readonly string[];
}

const SLOT_STYLES: Record<TimeSlot, SlotStyle> = {
  morning: {
    heading: "今日のごみ",
    hero: "hero-morning.png",
    headerColor: "#CDEBFA",
    subColor: "#3B5B7A",
    mainColor: "#1E2A5E",
    labelColor: "#E8590C",
    weekendColors: { 0: "#E03131", 6: "#1971C2" },
    cheers: ["いってらっしゃい！", "おはようございます ☀️", "忘れずにね 👋", "ナイスごみ出しを ✨"],
  },
  evening: {
    heading: "明日のごみ",
    hero: "hero.png",
    headerColor: "#1E2A5E",
    subColor: "#C5CAE9",
    mainColor: "#FFFFFF",
    labelColor: "#FFE066",
    weekendColors: { 0: "#FFC9C9", 6: "#A5D8FF" },
    cheers: ["今日もおつかれさま 🌙", "明日の朝、忘れずにね 👋", "おやすみなさい 💤"],
  },
};

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
  // 送る時間帯。朝は「今日のごみ」、夜は「明日のごみ」で、上の帯と画像も変える
  slot?: TimeSlot;
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
  { label, imageBaseUrl, slot = "evening" }: FlexOptions = {},
): FlexMessage {
  const [, m, d] = date.split("-").map(Number);
  const weekday = weekdayOf(date);
  const deadline = DEADLINES[source];
  const style = SLOT_STYLES[slot];
  const cheer = style.cheers[(m * 31 + d) % style.cheers.length];

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: style.headerColor,
        paddingAll: "lg",
        contents: [
          ...(label ? [{ type: "text", text: label, size: "xs", color: style.labelColor, weight: "bold" }] : []),
          { type: "text", text: style.heading, size: "sm", color: style.subColor },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: `${m}/${d}`, size: "3xl", weight: "bold", color: style.mainColor, flex: 0 },
              {
                type: "text",
                text: `（${WEEKDAYS[weekday]}）`,
                size: "lg",
                weight: "bold",
                color: style.weekendColors[weekday] ?? style.mainColor,
                flex: 0,
              },
            ],
          },
        ],
      },
      ...(imageBaseUrl && {
        hero: {
          type: "image",
          url: imageUrl(imageBaseUrl, style.hero),
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
