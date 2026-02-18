/**
 * Text formatting engine (整形エンジン) for Tadayomu.
 * Normalizes and polishes downloaded text for comfortable vertical reading.
 */

/** Apply all formatting rules to raw text */
export function formatNovelText(raw: string): string {
    let text = raw;

    // 1. Normalize line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. Full-width / half-width normalization
    text = normalizeWidths(text);

    // 3. Normalize excessive blank lines (max 1 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n');

    // 4. Normalize dashes (convert various dash chars to proper em-dash pairs)
    text = normalizeDashes(text);

    // 5. Normalize ellipsis
    text = normalizeEllipsis(text);

    // 6. Normalize exclamation / question marks spacing
    text = normalizeExclamation(text);

    // 7. Ensure paragraph indentation (全角スペースでの字下げ)
    text = ensureIndentation(text);

    // 8. Trim trailing whitespace per line
    text = text.split('\n').map((line) => line.trimEnd()).join('\n');

    // 9. Trim leading/trailing blank lines
    text = text.trim();

    return text;
}

/** Convert half-width alphanumeric to full-width for vertical consistency */
function normalizeWidths(text: string): string {
    // Half-width ASCII letters & digits → full-width
    return text.replace(/[A-Za-z0-9]/g, (ch) => {
        return String.fromCharCode(ch.charCodeAt(0) + 0xFEE0);
    });
}

/** Normalize various dash characters to paired em-dashes ── */
function normalizeDashes(text: string): string {
    // Convert single em dash, en dash, horizontal bar to paired em dashes
    return text
        .replace(/[—―─]{3,}/g, '──')  // 3+ dashes → 2
        .replace(/[–\-]{2,}/g, '──')   // 2+ hyphens/en-dashes → em-dash pair
        .replace(/(?<![─—―])([─—―])(?![─—―])/g, '──'); // lone dash → pair
}

/** Normalize ellipsis: .... or ・・・ → …… (3-dot pairs) */
function normalizeEllipsis(text: string): string {
    return text
        .replace(/\.{3,}/g, '……')
        .replace(/。{2,}/g, '……')
        .replace(/・{3,}/g, '……')
        .replace(/…{3,}/g, '……');
}

/** Add proper spacing after ！ and ？ when followed by text */
function normalizeExclamation(text: string): string {
    return text
        .replace(/([！？])(?=[^\s！？」』）\n])/g, '$1　');
}

/** Ensure each paragraph starts with 全角スペース indent */
function ensureIndentation(text: string): string {
    return text.split('\n').map((line) => {
        // Skip empty lines and lines that are already indented
        if (!line.trim()) return line;
        if (line.startsWith('　')) return line;
        // Skip lines that look like chapter titles or special markers
        if (/^[＊\*※◆◇■□▲△▼▽●○★☆【】〈〉《》「」『』（）]/.test(line)) return line;
        // Skip ruby markup lines
        if (line.startsWith('<ruby>')) return line;
        // Add indent
        return '　' + line;
    }).join('\n');
}

/** Convert plain text to HTML paragraphs suitable for WebView reader */
export function textToReaderHtml(text: string): string {
    const formatted = formatNovelText(text);
    const paragraphs = formatted.split('\n');

    return paragraphs
        .map((p) => {
            if (!p.trim()) return '<p class="blank">&nbsp;</p>';
            // Escape HTML but preserve ruby tags
            const escaped = p
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            return `<p>${escaped}</p>`;
        })
        .join('\n');
}

/** Convert text with ruby markup back to html for reader */
export function rubyTextToHtml(text: string): string {
    // Pattern: |漢字《かんじ》 or 漢字《かんじ》
    return text.replace(
        /[|｜]?([^\s|｜《]+)《([^》]+)》/g,
        '<ruby>$1<rp>(</rp><rt>$2</rt><rp>)</rp></ruby>'
    );
}
