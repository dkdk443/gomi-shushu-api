// JSON のままのデータを domain の型に変換する。日付が壊れていれば例外
import { toPlainDate } from "../domain/date.ts";
import type { RuleSourceData } from "../domain/rules.ts";
import type { ExceptionDate } from "../domain/types.ts";

// JSON のままの形。日付はまだ検証していない文字列
export interface RawSourceData extends Omit<RuleSourceData, "validFrom" | "validTo" | "exceptions"> {
  validFrom: string;
  validTo: string;
  exceptions: (Omit<ExceptionDate, "date"> & { date: string })[];
}

export function parseSourceData(raw: RawSourceData): RuleSourceData {
  return {
    ...raw,
    validFrom: toPlainDate(raw.validFrom),
    validTo: toPlainDate(raw.validTo),
    exceptions: raw.exceptions.map((e) => ({ ...e, date: toPlainDate(e.date) })),
  };
}
