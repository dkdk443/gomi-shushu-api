// ごみを出す締め切りの時刻。ソースごとに区の案内に合わせる。知らないソースは undefined
const DEADLINES: Record<string, string> = {
  "suginami-2026": "8:00",
};

export function deadlineOf(source: string): string | undefined {
  return DEADLINES[source];
}
