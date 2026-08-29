import { Directory, File, Paths } from "expo-file-system";
import {
  DOWNLOADED_FONT_PREFIX,
  OPTIONAL_READER_FONTS,
  getDownloadedFontId,
  getOptionalReaderFont,
  type OptionalReaderFont,
} from "./fontCatalog";

export {
  DOWNLOADED_FONT_PREFIX,
  OPTIONAL_READER_FONT_ID,
  OPTIONAL_READER_FONTS,
  getDownloadedFontId,
  getOptionalReaderFont,
} from "./fontCatalog";

type FontWeight = 400 | 600 | 700;

export interface ReaderFontFace {
  family: string;
  weight: FontWeight;
  uri: string;
}

function getFontDirectory(fontId: string): Directory {
  return new Directory(Paths.document, "fonts", fontId);
}

function getFontFile(font: OptionalReaderFont, fileName: string): File {
  return new File(getFontDirectory(font.id), fileName);
}

export function getDownloadedFontFamily(fontId: string): string | null {
  return getOptionalReaderFont(fontId)?.family ?? null;
}

export function isInstalledFontFamily(fontFamily: string): boolean {
  const fontId = getDownloadedFontId(fontFamily);
  if (!fontId) return false;
  const font = getOptionalReaderFont(fontId);
  return Boolean(font && font.files.every((file) => getFontFile(font, file.fileName).exists));
}

export function getInstalledFontIds(): string[] {
  return OPTIONAL_READER_FONTS
    .filter((font) => isInstalledFontFamily(`${DOWNLOADED_FONT_PREFIX}${font.id}`))
    .map((font) => font.id);
}

export function getReaderFontFaces(fontFamily: string): ReaderFontFace[] {
  const fontId = getDownloadedFontId(fontFamily);
  const font = fontId ? getOptionalReaderFont(fontId) : null;
  if (!font || !isInstalledFontFamily(fontFamily)) return [];
  return font.files.map((file) => ({
    family: font.family,
    weight: file.weight,
    uri: getFontFile(font, file.fileName).uri,
  }));
}

export async function downloadFontFamily(fontId: string): Promise<void> {
  const font = getOptionalReaderFont(fontId);
  if (!font) throw new Error("未対応のフォントです");

  const directory = getFontDirectory(font.id);
  directory.create({ intermediates: true, idempotent: true });

  for (const file of font.files) {
    const finalFile = getFontFile(font, file.fileName);
    if (finalFile.exists && finalFile.size === file.size) continue;

    const temporaryFile = new File(
      directory,
      `${file.fileName}.${Date.now()}.download`,
    );
    try {
      const downloadedFile = await File.downloadFileAsync(file.url, temporaryFile);
      if (downloadedFile.size !== file.size) {
        throw new Error(`${file.fileName}: サイズ検証に失敗しました`);
      }
      if (finalFile.exists) finalFile.delete();
      downloadedFile.move(finalFile);
    } catch (error) {
      if (temporaryFile.exists) temporaryFile.delete();
      throw error;
    }
  }

  if (!isInstalledFontFamily(`${DOWNLOADED_FONT_PREFIX}${font.id}`)) {
    throw new Error("フォントの保存状態を確認できませんでした");
  }
}

export function deleteFontFamily(fontId: string): void {
  const font = getOptionalReaderFont(fontId);
  if (!font) return;
  const directory = getFontDirectory(font.id);
  if (directory.exists) directory.delete();
}
