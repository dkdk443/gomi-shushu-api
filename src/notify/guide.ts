// 種別ごとの「分け方・出し方」の案内ページ。ソースごとに区の公式ページを書く
interface Guide {
  // 分け方・出し方の総合ページ
  overview: string;
  types: Record<string, string>;
}

const GUIDES: Record<string, Guide> = {
  "suginami-2026": {
    overview: "https://www.city.suginami.tokyo.jp/s104/713.html",
    // びん・かん・プラ、古紙・ペットボトルは区のページが品目ごとに分かれているので、総合ページにする
    types: {
      "可燃ごみ": "https://www.city.suginami.tokyo.jp/s104/716.html",
      "不燃ごみ": "https://www.city.suginami.tokyo.jp/s104/717.html",
    },
  },
};

// type を省略すると総合ページ。知らないソースは undefined
export function guideUrl(source: string, type?: string): string | undefined {
  const guide = GUIDES[source];
  if (!guide) return undefined;
  return (type && guide.types[type]) || guide.overview;
}
