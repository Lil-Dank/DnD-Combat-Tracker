import { ICON_PATHS, ICON_STROKE, DEFAULT_ICON_STROKE, type IconName } from '../shared/icons';

/**
 * A monoline glyph from the shared set. Inherits `color`, so a nav row's
 * active/hover state colours the icon for free — no per-state variants.
 */
export function Icon({
  name,
  size = 20,
  title,
}: {
  name: IconName;
  size?: number;
  /** Set only when the icon is the sole label; decorative otherwise. */
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE[name] ?? DEFAULT_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
