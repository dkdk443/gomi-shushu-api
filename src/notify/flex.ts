// ごみの日を、色とアイコンで見分けられる LINE の Flex Message（カード）にする
// https://developers.line.biz/ja/docs/messaging-api/using-flex-messages/
import { weekdayOf } from "../domain/date.ts";
import type { PlainDate } from "../domain/types.ts";
import { deadlineOf } from "./deadline.ts";
import type { TimeSlot } from "./slot.ts";

interface TypeStyle {
  emoji: string;
  // public/images/ のアイコン
  icon: string;
  // アイコンの下地や、種別の行の背景
  background: string;
}

// 種別ごとの見た目。知らない種別（ほかの自治体を足したとき）は DEFAULT_STYLE
const STYLES: Record<string, TypeStyle> = {
  "可燃ごみ": { emoji: "🔥", icon: "kanen.png", background: "#FFF4E6" },
  "不燃ごみ": { emoji: "🔩", icon: "funen.png", background: "#EDF2FF" },
  "びん・かん・プラ": { emoji: "🥫", icon: "bin-kan-pura.png", background: "#E6FCF5" },
  "古紙・ペットボトル": { emoji: "📰", icon: "koshi-petbottle.png", background: "#FFF9DB" },
};
const DEFAULT_STYLE: TypeStyle = { emoji: "🗑️", icon: "default.png", background: "#F1F3F5" };

// LINE は画像をURLごとにキャッシュするので、画像を差し替えたら上げる
const IMAGE_VERSION = 1;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const TEXT_COLOR = "#1E2A4A";
const SUB_COLOR = "#5C6B80";
// テスト送信の目印
const LABEL_COLOR = "#E8590C";

// 送る時間帯ごとの見出しと上部の画像
const SLOT_STYLES: Record<TimeSlot, { heading: string; hero: string }> = {
  morning: { heading: "きょうのごみ", hero: "hero-morning.png" },
  evening: { heading: "あしたのごみ", hero: "hero.png" },
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
  // 送る時間帯。朝は「きょうのごみ」、夜は「あしたのごみ」で、上部の画像も変える
  slot?: TimeSlot;
}

function imageUrl(base: string, name: string): string {
  return `${base.replace(/\/$/, "")}/images/${name}?v=${IMAGE_VERSION}`;
}

function icon(style: TypeStyle, imageBaseUrl: string | undefined, size: string) {
  return imageBaseUrl
    ? { type: "image", url: imageUrl(imageBaseUrl, style.icon), size, aspectRatio: "1:1" }
    : { type: "text", text: style.emoji, size: "xxl", align: "center" };
}

// 締め切りと一言。例: 朝8:00までに集積所へ。今夜のうちに玄関にまとめておくと安心です。
// 種別が複数なら「どちらも」「どれも」を付け、一言は省く。何も書くことがなければ undefined
function note(slot: TimeSlot, deadline: string | undefined, count: number): string | undefined {
  const until = deadline
    ? `${count === 1 ? "" : count === 2 ? "どちらも" : "どれも"}${slot === "evening" ? "朝" : ""}${deadline}までに集積所へ。`
    : "";
  const tip = count > 1 ? "" : slot === "evening" ? "今夜のうちに玄関にまとめておくと安心です。" : "出かける前にお忘れなく。";
  return until + tip || undefined;
}

// 1種類の日: 大きなアイコンと種別名、その下に日付
function singleType(heading: string, type: string, dateText: string, imageBaseUrl: string | undefined) {
  const style = STYLES[type] ?? DEFAULT_STYLE;
  return [
    { type: "text", text: heading, size: "sm", weight: "bold", color: SUB_COLOR },
    {
      type: "box",
      layout: "horizontal",
      spacing: "lg",
      alignItems: "center",
      contents: [
        {
          type: "box",
          layout: "vertical",
          width: "72px",
          height: "72px",
          flex: 0,
          backgroundColor: style.background,
          cornerRadius: "xl",
          justifyContent: "center",
          alignItems: "center",
          contents: [icon(style, imageBaseUrl, "56px")],
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: type, size: "xxl", weight: "bold", color: TEXT_COLOR, wrap: true },
            { type: "text", text: dateText, size: "md", color: SUB_COLOR },
          ],
        },
      ],
    },
  ];
}

// 2種類以上の日: 見出しの右に日付、種別ごとに色の付いた行
function multipleTypes(heading: string, types: readonly string[], dateText: string, imageBaseUrl: string | undefined) {
  return [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `${heading}・${types.length}種類`, size: "sm", weight: "bold", color: SUB_COLOR },
        { type: "text", text: dateText, size: "sm", color: SUB_COLOR, align: "end" },
      ],
    },
    ...types.map((type) => {
      const style = STYLES[type] ?? DEFAULT_STYLE;
      return {
        type: "box",
        layout: "horizontal",
        backgroundColor: style.background,
        cornerRadius: "xl",
        paddingAll: "lg",
        spacing: "lg",
        alignItems: "center",
        contents: [
          { type: "box", layout: "vertical", width: "56px", flex: 0, contents: [icon(style, imageBaseUrl, "56px")] },
          { type: "text", text: type, size: "lg", weight: "bold", color: TEXT_COLOR, wrap: true },
        ],
      };
    }),
  ];
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
  const dateText = `${m}月${d}日（${WEEKDAYS[weekdayOf(date)]}）`;
  const { heading, hero } = SLOT_STYLES[slot];
  const noteText = note(slot, deadlineOf(source), types.length);

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "mega",
      ...(imageBaseUrl && {
        hero: {
          type: "image",
          url: imageUrl(imageBaseUrl, hero),
          size: "full",
          aspectRatio: "2:1",
          aspectMode: "cover",
        },
      }),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        paddingAll: "xl",
        contents: [
          ...(label ? [{ type: "text", text: label, size: "xs", weight: "bold", color: LABEL_COLOR }] : []),
          ...(types.length === 1
            ? singleType(heading, types[0], dateText, imageBaseUrl)
            : multipleTypes(heading, types, dateText, imageBaseUrl)),
          ...(noteText ? [{ type: "text", text: noteText, size: "md", color: TEXT_COLOR, wrap: true }] : []),
        ],
      },
    },
  };
}
