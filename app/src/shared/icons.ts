/**
 * The monoline icon set. One weight, one grid, `currentColor` throughout, so
 * an icon inherits whatever colour its row already has — muted in the sidebar,
 * the palette accent on the active item, green on the connected deck status.
 *
 * Drawn on a 24 grid at 1.75 stroke with round caps and joins. Everything has
 * to survive 20px, which is the size that actually ships, so no detail leaves
 * less than about 2px of gap. Framework-free: the values are raw SVG markup,
 * so a non-React consumer (the Stream Deck plugin, later) can reuse them.
 */

export type IconName =
  | 'swords'
  | 'shield'
  | 'eye'
  | 'book'
  | 'map'
  | 'archive'
  | 'sliders'
  | 'equalizer'
  | 'phone'
  | 'monitor'
  | 'expand'
  | 'dotOn'
  | 'dotOff'
  | 'burst'
  | 'plus';

export const ICON_PATHS: Record<IconName, string> = {
  /* Crossed swords: long blades, short guards. The guards are what stop it
     reading as a plain X at 20px. */
  swords:
    '<path d="M4.4 4.4 17.6 17.6M13.6 17.6 17.6 13.6M19.6 4.4 6.4 17.6M10.4 17.6 6.4 13.6"/>',
  shield:
    '<path d="M12 3.6 19.4 6.5V12c0 4.3-2.9 7.4-7.4 8.8C7.5 19.4 4.6 16.3 4.6 12V6.5Z"/>' +
    '<path d="M9.4 11.9 11.5 14l3.1-3.6"/>',
  /* Draconic slit pupil — the most legible "monster" glyph at 20px, and the
     only one of the candidates that cannot be mistaken for a person. */
  eye:
    '<path d="M2.8 12S6.6 6.3 12 6.3 21.2 12 21.2 12 17.4 17.7 12 17.7 2.8 12 2.8 12Z"/>' +
    '<path d="M12 8.5c1 1.5 1.5 2.9 1.5 3.5s-.5 2-1.5 3.5c-1-1.5-1.5-2.9-1.5-3.5s.5-2 1.5-3.5Z"/>',
  book:
    '<path d="M12 6.6C10 5.1 7.6 4.4 4.6 4.4v13c3 0 5.4.7 7.4 2.2 2-1.5 4.4-2.2 7.4-2.2v-13c-3 0-5.4.7-7.4 2.2Z"/>' +
    '<path d="M12 6.6v13M7.3 9.3h2.3M14.4 9.3h2.3"/>',
  map:
    '<path d="M3.6 6.6 9 4.5v13l-5.4 2.1Z"/>' +
    '<path d="M9 4.5l6 2.1v13l-6-2.1M15 6.6l5.4-2.1v13L15 19.6"/>',
  archive:
    '<path d="M3.6 8.6h16.8v9.3a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6Z"/>' +
    '<path d="M3.6 8.6 5.6 4.5h12.8l2 4.1M9.6 12.4h4.8"/>',
  /* Rails break around each knob, so the glyph needs no opaque fill and works
     on any background — including the tinted active row. */
  sliders:
    '<path d="M3.9 7.1h2.7M11.4 7.1h8.7M3.9 12h9.1M17.8 12h2.3M3.9 16.9h1.1M9.8 16.9h10.3"/>' +
    '<circle cx="9" cy="7.1" r="1.9"/><circle cx="15.4" cy="12" r="1.9"/><circle cx="7.4" cy="16.9" r="1.9"/>',
  equalizer: '<path d="M6.8 15.6V8.4M12 18.6V5.4M17.2 13.8v-3.6"/>',
  phone: '<rect x="6" y="3.6" width="12" height="16.8" rx="1.8"/><path d="M10.4 6.5h3.2M12 17.4h.01"/>',
  monitor: '<rect x="3.6" y="5.2" width="16.8" height="10.2" rx="1.4"/><path d="M9.4 19.2h5.2M12 15.4v3.8"/>',
  expand:
    '<path d="M4 9V5.6A1.6 1.6 0 0 1 5.6 4H9M15 4h3.4A1.6 1.6 0 0 1 20 5.6V9' +
    'M20 15v3.4a1.6 1.6 0 0 1-1.6 1.6H15M9 20H5.6A1.6 1.6 0 0 1 4 18.4V15"/>',
  dotOn: '<circle cx="12" cy="12" r="4.6" fill="currentColor" stroke="none"/>',
  dotOff: '<circle cx="12" cy="12" r="4.4"/>',
  /* Explosion, not a sparkle: evenly spaced points read as "magic", so both
     the radii and the angles are jittered. */
  burst:
    '<path d="M12.0 2.4L13.6 8.1L18.6 6.0L16.3 10.4L21.5 11.7L15.7 13.5L17.9 18.4L13.6 16.2' +
    'L12.5 21.7L10.5 16.0L5.5 18.3L7.6 13.8L2.6 11.7L8.2 10.4L5.7 5.9L10.3 7.9Z"/>',
  plus: '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
};

/** Most glyphs share one weight; a couple carry more presence on purpose. */
export const ICON_STROKE: Partial<Record<IconName, number>> = {
  plus: 3.1,
};

export const DEFAULT_ICON_STROKE = 1.75;

/** Raw SVG string, for non-React consumers. */
export function iconSvg(name: IconName, size = 20): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="${ICON_STROKE[name] ?? DEFAULT_ICON_STROKE}" ` +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    `${ICON_PATHS[name]}</svg>`
  );
}
