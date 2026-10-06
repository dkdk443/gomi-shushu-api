// "YYYY-MM-DD"。Date はタイムゾーンを持つので、暦日は文字列で扱う。
// 形式を確かめた値だけが入るよう、date.ts の parsePlainDate / toPlainDate でしか作らない。
// 同じ形式なので、文字列のまま大小比較すれば日付の前後になる。
export type PlainDate = string & { readonly __brand: "PlainDate" };

export type GarbageType = "可燃ごみ" | "不燃ごみ" | "びん・かん・プラ" | "古紙・ペットボトル";

export const GARBAGE_TYPES: readonly GarbageType[] = [
  "可燃ごみ",
  "不燃ごみ",
  "びん・かん・プラ",
  "古紙・ペットボトル",
];

export interface NormalizedAddress {
  prefecture: string;
  city: string;
  town: string;
  // 町名だけ渡された場合は undefined
  chome?: number;
}

// weekday: 0=日 … 6=土。nth を省略すると毎週、指定するとその月の第n回目だけ。
export interface WeekdayRule {
  weekday: number;
  nth?: number[];
}

// 年末年始など、ルールから外れる日。types を省略すると全種別が対象。
export interface ExceptionDate {
  date: PlainDate;
  action: "cancel" | "add";
  types?: GarbageType[];
  note?: string;
}

export interface CollectionSource {
  // 例: "suginami-2026"
  id: string;
  prefecture: string;
  city: string;
  validFrom: PlainDate;
  validTo: PlainDate;
  // 住所の解決に使う、このソースが知っている町名（別表記を含む）
  towns(): readonly string[];
  aliases(): Readonly<Record<string, string>>;
  // 郵便番号(7桁) → 町名
  postalCodes(): Readonly<Record<string, string>>;
  // 収集日が同じ丁目のまとまり（曜日が同じで週だけ違うものも分ける）。例: 和泉 → [[1], [2, 3, 4]]
  chomeGroups(town: string): number[][];
  // 正規化済みの住所（丁目まで）と日付から、その日のごみ種別を返す
  lookup(address: NormalizedAddress, date: PlainDate): GarbageType[];
}
