/**
 * Renders the turn keys as SVG images instead of plain titles.
 *
 * setTitle() can't control outline weight or scale text to the content, so the
 * turn keys draw themselves: the label sits in a small band at the top and the
 * actor name fills the rest at the largest size that still fits inside a
 * margin. Every glyph is drawn twice — a thick stroke pass, then the fill —
 * which produces a heavy outline in any SVG renderer (no reliance on
 * `paint-order`, which the deck's renderer may not support).
 */

export interface KeyPalette {
  from: string;
  to: string;
}

/**
 * What a picker key *is*, which drives its background colour:
 * green = confirms, red = cancels, slate = steps back, blue = paging,
 * purple = a pressable choice, bright green = a chosen one, flat near-black
 * = a read-out that does nothing, black = an unused key.
 */
export type KeyRole =
  | 'item'
  | 'selected'
  | 'confirm'
  | 'cancel'
  | 'back'
  | 'page'
  | 'display'
  | 'empty';

export const ROLE_PALETTES: Record<KeyRole, KeyPalette> = {
  item: { from: '#241d33', to: '#4a3d69' },
  selected: { from: '#14532d', to: '#3f9d55' },
  confirm: { from: '#155e2e', to: '#22c55e' },
  cancel: { from: '#4a1010', to: '#b91c1c' },
  back: { from: '#1c2533', to: '#4a5a72' },
  page: { from: '#16304f', to: '#3b82f6' },
  // Read-outs are deliberately flat and dark so they don't read as buttons.
  display: { from: '#0a0a0f', to: '#181822' },
  empty: { from: '#08080b', to: '#0e0e13' },
};

const CANVAS = 72;
const MARGIN = 5;
const LABEL_FONT = 10;
/** Height of the top band reserved for the label. */
const LABEL_BAND = 15;
const LINE_HEIGHT = 1.1;
const MIN_FONT = 9;
const MAX_FONT = 26;
/** Outline thickness as a fraction of the font size. */
const STROKE_RATIO = 0.26;
const FONT_STACK = "'Segoe UI', Arial, Helvetica, sans-serif";

const NARROW = new Set([...`ilIj|.,'!:;()[]`]);
const WIDE = new Set([...'MWmw@%']);

/**
 * Approximate rendered width of a string, in em units of its font size.
 * Symbols and emoji (✓ ✕ ▶ ⚔ ✚ 🎲 💀 …) render far wider than their code
 * point count suggests, so they're charged a full em — over-estimating a
 * little just sizes the text down, while under-estimating overflows the key.
 */
export function relWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp > 0x2000) w += 1.05;
    else if (NARROW.has(ch)) w += 0.32;
    else if (WIDE.has(ch)) w += 0.88;
    else if (ch === ' ') w += 0.3;
    else if (ch >= 'A' && ch <= 'Z') w += 0.66;
    else w += 0.58;
  }
  return w;
}

/** Largest font size at which every line fits the box, clamped to sane bounds. */
export function fitFontSize(
  lines: string[],
  availW: number,
  availH: number,
  min = MIN_FONT,
  max = MAX_FONT,
): number {
  if (lines.length === 0) return max;
  const widest = Math.max(...lines.map(relWidth), 0.001);
  const byWidth = availW / widest;
  const byHeight = availH / (lines.length * LINE_HEIGHT);
  return Math.max(min, Math.min(max, byWidth, byHeight));
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One line drawn twice: thick stroke underneath, fill on top. */
function textLine(x: number, y: number, size: number, fill: string, text: string): string {
  const common =
    `x="${x}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${FONT_STACK}" ` +
    `font-size="${size.toFixed(1)}" font-weight="700"`;
  const stroke = Math.max(2, size * STROKE_RATIO).toFixed(1);
  const body = esc(text);
  return (
    `<text ${common} fill="none" stroke="#000" stroke-width="${stroke}" ` +
    `stroke-linejoin="round" stroke-linecap="round">${body}</text>` +
    `<text ${common} fill="${fill}">${body}</text>`
  );
}

/**
 * Key image: gradient background, small label band, then the actor name
 * auto-sized to fill the remaining space.
 */
export function turnKeyImage(label: string, nameLines: string[], palette: KeyPalette): string {
  const availW = CANVAS - MARGIN * 2;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${palette.from}"/>` +
      `<stop offset="1" stop-color="${palette.to}"/></linearGradient></defs>`,
    `<rect width="${CANVAS}" height="${CANVAS}" fill="url(#g)"/>`,
  ];

  if (nameLines.length === 0) {
    // No combat: the label alone, centred and as large as it can be.
    const size = fitFontSize([label], availW, CANVAS - MARGIN * 2, MIN_FONT, 18);
    parts.push(textLine(CANVAS / 2, CANVAS / 2 + size * 0.35, size, '#ffffff', label));
  } else {
    parts.push(textLine(CANVAS / 2, MARGIN + LABEL_FONT * 0.85, LABEL_FONT, '#f3ecff', label));
    const areaTop = LABEL_BAND;
    const areaH = CANVAS - LABEL_BAND - MARGIN;
    const size = fitFontSize(nameLines, availW, areaH);
    const lineH = size * LINE_HEIGHT;
    const top = areaTop + (areaH - nameLines.length * lineH) / 2;
    nameLines.forEach((line, i) => {
      parts.push(textLine(CANVAS / 2, top + lineH * i + size * 0.82, size, '#ffffff', line));
    });
  }

  parts.push('</svg>');
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(parts.join(''))}`;
}

/**
 * Picker key: the whole face is text, auto-sized to the largest that fits.
 * Display keys get a dashed inset border as a second cue that they're a
 * read-out rather than something to press.
 */
export function pickerKeyImage(lines: string[], role: KeyRole): string {
  const palette = ROLE_PALETTES[role];
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${palette.from}"/>` +
      `<stop offset="1" stop-color="${palette.to}"/></linearGradient></defs>`,
    `<rect width="${CANVAS}" height="${CANVAS}" fill="url(#g)"/>`,
  ];
  if (role === 'display') {
    parts.push(
      `<rect x="2.5" y="2.5" width="${CANVAS - 5}" height="${CANVAS - 5}" rx="4" fill="none" ` +
        `stroke="#6b7280" stroke-width="1.5" stroke-dasharray="4 3"/>`,
    );
  }
  if (lines.length > 0) {
    const availH = CANVAS - MARGIN * 2;
    const size = fitFontSize(lines, CANVAS - MARGIN * 2, availH, MIN_FONT, 22);
    const lineH = size * LINE_HEIGHT;
    const top = MARGIN + (availH - lines.length * lineH) / 2;
    lines.forEach((line, i) => {
      parts.push(textLine(CANVAS / 2, top + lineH * i + size * 0.82, size, '#ffffff', line));
    });
  }
  parts.push('</svg>');
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(parts.join(''))}`;
}
