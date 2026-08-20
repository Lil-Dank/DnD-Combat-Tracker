/**
 * The logo mark: a fanned stack of cards whose front card carries an
 * initiative row — an avatar dot, a name bar in the accent, an HP bar. The
 * app's actual subject, drawn.
 *
 * Colours come in as strings, so the app passes `var(--brand-front)` and the
 * icon rasteriser passes `#26222F`: one geometry, two colour universes.
 * Framework-free and value-import-free, because `scripts/build-icon.cjs` loads
 * this inside Electron through a one-shot esbuild transform.
 */

/** Above ~36px the three-card fan reads; below it, two fatter cards do. */
export type MarkVariant = 'full' | 'simple';

export type MarkTreatment =
  /** On its own rounded tile — the app icon, installer, favicon. */
  | 'tile'
  /** Bare, with a drop shadow for definition. */
  | 'shadow'
  /** Bare, using the palette's on-panel role set (light cards on a dark
   *  sidebar, dark on a light one) — the in-app lock-up. */
  | 'inverse'
  /** Bare, cards separated by a hairline in the panel colour. */
  | 'stroke'
  /** Bare, no help at all. */
  | 'bare';

export interface MarkColors {
  tile: string;
  back1: string;
  back2: string;
  front: string;
  dot: string;
  accent: string;
  bar2: string;
  /** Only used by the `stroke` treatment. */
  edge?: string;
}

export interface MarkOptions {
  treatment?: MarkTreatment;
  /** Forces a variant; by default it follows `size`. */
  variant?: MarkVariant;
  colors?: MarkColors;
  /** Accessible name; omit for decorative uses. */
  title?: string;
}

/** CSS custom properties, for the in-app SVG. */
export const CSS_COLORS: MarkColors = {
  tile: 'var(--brand-tile)',
  back1: 'var(--brand-back-1)',
  back2: 'var(--brand-back-2)',
  front: 'var(--brand-front)',
  dot: 'var(--brand-dot)',
  accent: 'var(--brand-accent)',
  bar2: 'var(--brand-bar-2)',
  edge: 'var(--bg-panel)',
};

/** The on-panel role set — what `inverse` paints with. */
export const CSS_COLORS_ON_PANEL: MarkColors = {
  tile: 'var(--brand-tile)',
  back1: 'var(--on-back-1)',
  back2: 'var(--on-back-2)',
  front: 'var(--on-front)',
  dot: 'var(--on-dot)',
  accent: 'var(--on-accent-bar)',
  bar2: 'var(--on-bar-2)',
  edge: 'var(--bg-panel)',
};

/**
 * Framing copied from the signed-off proof sheet: a square viewport centred on
 * the stack rather than a tight crop — the air around the fan is part of the
 * drawing, and cropping to the ink makes the mark read as a wedge.
 */
const BOX = {
  full: { x: 8.14, y: 6.14, size: 83.73 },
  simple: { x: 8.14, y: 16.15, size: 83.77 },
};

export function variantFor(size: number): MarkVariant {
  return size >= 40 ? 'full' : 'simple';
}

export function markSvg(size: number, opts: MarkOptions = {}): string {
  const tr: MarkTreatment = opts.treatment ?? 'tile';
  const variant = opts.variant ?? variantFor(size);
  const full = variant === 'full';
  const tile = tr === 'tile';
  const c = opts.colors ?? (tr === 'inverse' ? CSS_COLORS_ON_PANEL : CSS_COLORS);

  const edge = tr === 'stroke' ? ` stroke="${c.edge ?? 'transparent'}" stroke-width="2.6"` : '';
  const card = (fill: string, rot?: number) =>
    `<rect x="14" y="35" width="72" height="26" rx="4" fill="${fill}"${edge}` +
    (rot ? ` transform="rotate(${rot} 18 48)"` : '') +
    '/>';

  const art = full
    ? card(c.back1, -19) +
      card(c.back2, 19) +
      card(c.front) +
      `<circle cx="28" cy="48" r="6.5" fill="${c.dot}"/>` +
      `<rect x="40" y="41" width="34" height="5" rx="2.5" fill="${c.accent}"/>` +
      `<rect x="40" y="50" width="21" height="5" rx="2.5" fill="${c.bar2}"/>`
    : card(c.back1, 17) +
      card(c.front) +
      `<circle cx="30" cy="48" r="8" fill="${c.dot}"/>` +
      `<rect x="44" y="43" width="32" height="10" rx="5" fill="${c.accent}"/>`;

  const box = BOX[variant];
  const pad = tile ? 0 : 0.06;
  const scale = (size * (1 - pad * 2)) / box.size;
  const tx = size / 2 - (box.x + box.size / 2) * scale;
  const ty = size / 2 - (box.y + box.size / 2) * scale;

  // The shadow belongs to the cards, not to the tile behind them.
  const shadow =
    tr === 'shadow'
      ? ` filter="drop-shadow(0 ${(size * 0.014).toFixed(2)}px ${(size * 0.026).toFixed(2)}px rgba(0,0,0,.5))"`
      : '';

  const a11y = opts.title
    ? ` role="img" aria-label="${opts.title}"`
    : ' aria-hidden="true" focusable="false"';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}"${a11y}>` +
    (tile ? `<rect width="${size}" height="${size}" rx="${(size * 0.21).toFixed(2)}" fill="${c.tile}"/>` : '') +
    `<g${shadow} transform="translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${scale.toFixed(4)})">${art}</g>` +
    '</svg>'
  );
}
