// 杉並区の「ごみと資源 収集曜日検索」用CSVを、ルール形式のJSONに変換する。
//   node scripts/build-suginami-2026.ts
// 入力:
//   data/raw/suginami-2026-garbage.csv
//     https://www.city.suginami.tokyo.jp/documents/12125/garbage.csv
//   data/raw/suginami-postal-codes.csv（日本郵便 utf_ken_all.csv から杉並区の行を抜き出したもの）
//     https://www.post.japanpost.jp/service/search/zipcode/download/utf-zip.html
import { readFileSync, writeFileSync } from "node:fs";
import { toPlainDate } from "../src/domain/date.ts";
import { GARBAGE_TYPES, type ExceptionDate, type WeekdayRule } from "../src/domain/types.ts";

const RAW = new URL("../data/raw/suginami-2026-garbage.csv", import.meta.url);
const POSTAL = new URL("../data/raw/suginami-postal-codes.csv", import.meta.url);
const OUT = new URL("../data/suginami-2026.json", import.meta.url);
const SITE = "https://www.city.suginami.tokyo.jp";
const WEEKDAYS = "日月火水木金土";

// 令和8年度版の収集カレンダー(PDF)で確認した、収集しない日
const EXCEPTIONS: ExceptionDate[] = [
  { date: toPlainDate("2026-12-31"), action: "cancel", note: "年末年始" },
  { date: toPlainDate("2027-01-01"), action: "cancel", note: "年末年始" },
  { date: toPlainDate("2027-01-02"), action: "cancel", note: "年末年始" },
  { date: toPlainDate("2027-01-03"), action: "cancel", note: "年末年始" },
];

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replaceAll('""', '"')));
}

// "阿佐谷北1～6丁目" / "宮前1・4・5丁目" / "梅里1丁目"
function parseTown(label: string): { town: string; chome: number[] } {
  const m = /^(.+?)([\d・~～]+)丁目$/.exec(label.normalize("NFKC"));
  if (!m) throw new Error(`町名を解釈できません: ${label}`);
  const range = /^(\d+)[~～](\d+)$/.exec(m[2]);
  const chome = range
    ? Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, i) => Number(range[1]) + i)
    : m[2].split("・").map(Number);
  return { town: m[1], chome };
}

// "水曜日・土曜日" / "第1,3月曜日" / "金曜日"
function parseRules(label: string): WeekdayRule[] {
  const nth = /^第([\d,]+)(.)曜日$/.exec(label);
  if (nth) return [{ weekday: weekdayIndex(nth[2]), nth: nth[1].split(",").map(Number) }];
  return label.split("・").map((part) => {
    const m = /^(.)曜日$/.exec(part);
    if (!m) throw new Error(`収集曜日を解釈できません: ${label}`);
    return { weekday: weekdayIndex(m[1]) };
  });
}

function weekdayIndex(char: string): number {
  const i = WEEKDAYS.indexOf(char);
  if (i < 0) throw new Error(`曜日を解釈できません: ${char}`);
  return i;
}

const [header, ...rows] = parseCsv(readFileSync(RAW, "utf8"));
const typeColumns = GARBAGE_TYPES.map((type) => {
  const i = header.indexOf(type);
  if (i < 0) throw new Error(`列が見つかりません: ${type}`);
  return [type, i] as const;
});

const areas = rows.map((row) => ({
  ...parseTown(row[header.indexOf("町名")]),
  rules: Object.fromEntries(typeColumns.map(([type, i]) => [type, parseRules(row[i])])),
  calendarUrl: SITE + row[header.indexOf("pdf_url")],
}));

// 杉並区の郵便番号は町名と1対1。「以下に掲載がない場合」の行は除く
const postalCodes = Object.fromEntries(
  readFileSync(POSTAL, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((field) => field.replaceAll('"', "")))
    .filter((fields) => fields[8] !== "以下に掲載がない場合")
    .map((fields) => [fields[2], fields[8]]),
);
const towns = new Set(areas.map((a) => a.town));
const postalTowns = new Set(Object.values(postalCodes));
for (const town of towns) if (!postalTowns.has(town)) throw new Error(`郵便番号がない町名: ${town}`);
for (const town of postalTowns) if (!towns.has(town)) throw new Error(`収集曜日がない町名: ${town}`);

const data = {
  id: "suginami-2026",
  prefecture: "東京都",
  city: "杉並区",
  validFrom: "2026-04-01",
  validTo: "2027-03-31",
  attribution: {
    name: "杉並区「ごみと資源 収集曜日検索」および令和8年度版 収集カレンダー",
    url: `${SITE}/kurashi/gomi/`,
  },
  aliases: {
    阿佐ヶ谷北: "阿佐谷北",
    阿佐ヶ谷南: "阿佐谷南",
    阿佐ケ谷北: "阿佐谷北",
    阿佐ケ谷南: "阿佐谷南",
    堀の内: "堀ノ内",
    松の木: "松ノ木",
  },
  postalCodes,
  exceptions: EXCEPTIONS,
  areas,
};

writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
console.log(`${areas.length} 地区を ${OUT.pathname} に書き出しました`);
