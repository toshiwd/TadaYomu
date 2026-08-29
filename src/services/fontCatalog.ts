export const DOWNLOADED_FONT_PREFIX = "downloaded:";
export const OPTIONAL_READER_FONT_ID = "noto-serif-jp";

type FontWeight = 400 | 600 | 700;

export interface OptionalReaderFont {
  id: string;
  displayName: string;
  family: string;
  license: string;
  files: readonly {
    weight: FontWeight;
    fileName: string;
    url: string;
    size: number;
  }[];
}

const RELEASE_BASE_URL =
  "https://github.com/toshiwd/TadaYomu/releases/download/v1.3.75";

export const OPTIONAL_READER_FONTS: readonly OptionalReaderFont[] = [
  {
    id: OPTIONAL_READER_FONT_ID,
    displayName: "Noto Serif JP（明朝）",
    family: "TadayomuDownloadedNotoSerifJP",
    license: "SIL Open Font License 1.1",
    files: [
      {
        weight: 400,
        fileName: "NotoSerifJP-400.ttf",
        url: `${RELEASE_BASE_URL}/NotoSerifJP-400.ttf`,
        size: 7_682_584,
      },
      {
        weight: 600,
        fileName: "NotoSerifJP-600.ttf",
        url: `${RELEASE_BASE_URL}/NotoSerifJP-600.ttf`,
        size: 7_679_856,
      },
      {
        weight: 700,
        fileName: "NotoSerifJP-700.ttf",
        url: `${RELEASE_BASE_URL}/NotoSerifJP-700.ttf`,
        size: 7_677_168,
      },
    ],
  },
];

export function getDownloadedFontId(fontFamily: string): string | null {
  if (!fontFamily.startsWith(DOWNLOADED_FONT_PREFIX)) return null;
  const fontId = fontFamily.slice(DOWNLOADED_FONT_PREFIX.length);
  return OPTIONAL_READER_FONTS.some((font) => font.id === fontId) ? fontId : null;
}

export function getOptionalReaderFont(fontId: string): OptionalReaderFont | null {
  return OPTIONAL_READER_FONTS.find((font) => font.id === fontId) ?? null;
}

