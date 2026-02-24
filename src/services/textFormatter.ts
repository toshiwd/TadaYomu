/**
 * Text formatting engine (整形エンジン) for Tadayomu.
 * Normalizes and polishes downloaded text for comfortable vertical reading.
 */

/** Apply all formatting rules to raw text */
export function formatNovelText(raw: string, options?: { showImages?: boolean }): string {
  const showImages = options?.showImages ?? false;
  let text = raw;

  // 0. Extract <img> and `<span class="image-link">` tags to protect them from formatting
  const images: { html: string; src: string }[] = [];

  // Match existing <img> tags
  text = text.replace(/<img[^>]*>/gi, (match) => {
    const srcMatch = match.match(/src=["'](.*?)["']/i);
    const src = srcMatch ? srcMatch[1] : "";
    images.push({ html: match, src });
    return `__IMG_${String(images.length - 1).padStart(4, "0")}__`;
  });

  // Match existing `<span class="image-link">` placeholders safely
  text = text.replace(/<span\s+class=["']image-link["']\s+data-src=["']([^"']+)["'][^>]*>[^<]*<\/span>/gi, (match, src) => {
    images.push({ html: match, src: src || "" });
    return `__IMG_${String(images.length - 1).padStart(4, "0")}__`;
  });

  // 1. Normalize line endings
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Full-width / half-width normalization
  text = normalizeWidths(text);

  // 3. Normalize excessive blank lines (max 1 consecutive)
  text = text.replace(/\n{3,}/g, "\n\n");

  // 4. Normalize dashes (convert various dash chars to proper em-dash pairs)
  text = normalizeDashes(text);

  // 5. Normalize ellipsis
  text = normalizeEllipsis(text);

  // 6. Normalize exclamation / question marks spacing
  text = normalizeExclamation(text);

  // 7. Ensure paragraph indentation (全角スペースでの字下げ)
  text = ensureIndentation(text);

  // 8. Trim trailing whitespace per line
  text = text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // 9. Tate-chu-yoko (2-digit numbers, !?, !!, etc.)
  text = applyTateChuYoko(text);

  // 10. Bouten (Emphasis dots)
  text = applyBouten(text);

  // 11. Trim leading/trailing blank lines
  text = text.trim();

  // 12. Restore <img> tags as inline images or link placeholders
  text = text.replace(/__IMG_(\d+)__/g, (match, p1) => {
    const index = parseInt(p1, 10);
    const imgData = images[index];
    if (imgData && imgData.src) {
      if (showImages) {
        return `\n<div class="image-page"><img src="${imgData.src}" /></div>\n`;
      }
      // Return a clickable link placeholder instead of the actual image
      return `<span class="image-link" data-src="${imgData.src}">[画像あり: タップして表示]</span>`;
    }
    return match;
  });

  return text;
}

/** Convert half-width alphanumeric to full-width for vertical consistency */
function normalizeWidths(text: string): string {
  // Half-width ASCII letters & digits → full-width, EXCEPT for __IMG_X__ tokens
  const parts = text.split(/(__IMG_\d+__)/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Text parts (even indices)
      parts[i] = parts[i].replace(/[A-Za-z0-9]/g, (ch) => {
        return String.fromCharCode(ch.charCodeAt(0) + 0xfee0);
      });
    }
  }
  return parts.join("");
}

/** Normalize various dash characters to paired em-dashes ── */
function normalizeDashes(text: string): string {
  // Convert single em dash, en dash, horizontal bar to paired em dashes
  return text
    .replace(/[—―─]{3,}/g, "──") // 3+ dashes → 2
    .replace(/[–\-]{2,}/g, "──") // 2+ hyphens/en-dashes → em-dash pair
    .replace(/(?<![─—―])([─—―])(?![─—―])/g, "──"); // lone dash → pair
}

/** Normalize ellipsis: .... or ・・・ → …… (3-dot pairs) */
function normalizeEllipsis(text: string): string {
  return text
    .replace(/\.{3,}/g, "……")
    .replace(/。{2,}/g, "……")
    .replace(/・{3,}/g, "……")
    .replace(/…{3,}/g, "……");
}

/** Add proper spacing after ！ and ？ when followed by text */
function normalizeExclamation(text: string): string {
  return text.replace(/([！？])(?=[^\s！？」』）\n])/g, "$1　");
}

/** Ensure each paragraph starts with 全角スペース indent */
function ensureIndentation(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // Skip empty lines and lines that are already indented
      if (!line.trim()) return line;
      if (line.startsWith("　")) return line;
      // Skip lines that look like chapter titles or special markers
      if (/^[＊\*※◆◇■□▲△▼▽●○★☆【】〈〉《》「」『』（）]/.test(line))
        return line;
      // Skip ruby markup lines
      if (line.startsWith("<ruby>")) return line;
      // Skip image placeholders
      if (line.startsWith("__IMG_")) return line;
      // Add indent
      return "　" + line;
    })
    .join("\n");
}

/** Apply vertical-in-horizontal (Tate-chu-yoko) for 2-digit numbers and specific exclamation marks */
function applyTateChuYoko(text: string): string {
  // 2-digit half-width or full-width numbers (00-99 or ００-９９)
  // For numbers, we check if they are exactly 2 digits and not surrounded by other digits
  text = text.replace(
    /(?<![0-9０-９])([0-9０-９]{2})(?![0-9０-９])/g,
    '<span class="tcy">$1</span>',
  );

  // exclamation marks !?, !!, !? etc.
  // Also include their full-width variants (！, ？)
  // Match 2 to 3 combinations of !, ?, ！, ？
  text = text.replace(/([!?！？]{2,3})/g, '<span class="tcy">$1</span>');

  return text;
}

/** Convert 《《text》》 to <em class="emphasis">text</em> for bouten (emphasis dots) */
function applyBouten(text: string): string {
  return text.replace(/《《([^》\n]+)》》/g, '<em class="emphasis">$1</em>');
}

/** Convert plain text to HTML paragraphs suitable for WebView reader */
export function textToReaderHtml(text: string): string {
  const formatted = formatNovelText(text);
  const paragraphs = formatted.split("\n");

  return paragraphs
    .map((p) => {
      if (!p.trim()) return '<p class="blank">&nbsp;</p>';
      // Escape HTML but preserve ruby tags
      const escaped = p
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<p>${escaped}</p>`;
    })
    .join("\n");
}

/** Convert text with ruby markup back to html for reader */
export function rubyTextToHtml(text: string): string {
  // 1. Bar-required: |漢字《かんじ》 or ｜漢字《かんじ》
  const barRegex = /[|｜]([^｜|《\n]+)《([^》\n]+)》/g;

  // 2. Barless: 漢字《かんじ》
  // Base: Contiguous sequence of ONLY Kanji, ONLY Hiragana, ONLY Katakana, or ONLY Alphanumeric
  // Ruby: ONLY Hiragana, Katakana, Alphanumeric, spaces, hyphens, interpuncts, cho-on
  const barlessRegex =
    /([一-龥]+|[ぁ-ん]+|[ァ-ヶ]+|[a-zA-Z0-9ａ-ｚＡ-Ｚ０-９]+)《([ぁ-んァ-ヶa-zA-Z0-9ａ-ｚＡ-Ｚ０-９\s\-・ー]+)》/g;

  let result = text;
  result = result.replace(
    barRegex,
    "<ruby>$1<rp>(</rp><rt>$2</rt><rp>)</rp></ruby>",
  );
  result = result.replace(barlessRegex, (match, p1, p2) => {
    return `<ruby>${p1}<rp>(</rp><rt>${p2}</rt><rp>)</rp></ruby>`;
  });

  return result;
}
