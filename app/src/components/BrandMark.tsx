import { markSvg, type MarkTreatment } from '../shared/brandMark';
import type { BrandPalette } from '../shared/brand';

/**
 * The logo mark, drawn from CSS custom properties so it recolours with the
 * theme. `paletteVars` renders any palette without switching the app's theme —
 * that is what the settings swatch grid needs.
 */
export function BrandMark({
  size = 28,
  treatment = 'inverse',
  title,
}: {
  size?: number;
  treatment?: MarkTreatment;
  title?: string;
}) {
  return (
    <span
      className="brand-mark"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: markSvg(size, { treatment, title }) }}
    />
  );
}

/** Inline custom properties for one palette, so it can render out of theme. */
export function paletteVars(p: BrandPalette): React.CSSProperties {
  return {
    '--brand-tile': p.tile,
    '--brand-ground': p.ground,
    '--brand-back-1': p.back1,
    '--brand-back-2': p.back2,
    '--brand-front': p.front,
    '--brand-dot': p.dot,
    '--brand-accent': p.accent,
    '--brand-bar-2': p.bar2,
    '--brand-text': p.text,
    '--brand-text-muted': p.textMuted,
    '--brand-turn': p.turn,
    '--on-back-1': p.on.back1,
    '--on-back-2': p.on.back2,
    '--on-front': p.on.front,
    '--on-dot': p.on.dot,
    '--on-accent-bar': p.on.accent,
    '--on-bar-2': p.on.bar2,
  } as React.CSSProperties;
}

/**
 * The sidebar brand: the mark beside a two-line wordmark, with TURNS in the
 * accent. The wordmark is DOM text rather than SVG so it uses the theme font
 * and gets real hinting at 15px.
 */
export function BrandLockup({ appName }: { appName: string }) {
  return (
    <div className="app-title" title={appName}>
      <BrandMark size={28} treatment="inverse" />
      <span className="wordmark" aria-label={appName}>
        <span className="wm-1" aria-hidden="true">
          DECK OF MANY
        </span>
        <span className="wm-2" aria-hidden="true">
          TURNS
        </span>
      </span>
    </div>
  );
}
