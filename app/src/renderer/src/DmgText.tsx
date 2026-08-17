import { damageTypeSegments } from '../../shared/logText';
import { useI18n } from './i18n';

/**
 * A damage display string ("7 (1d8+3) Piercing") with its damage-type words
 * colored via dt-<type> classes. Only for damage strings — running plain
 * action text through it would false-positive on words like "cold".
 */
export function DmgText({ text }: { text: string }) {
  const { lang } = useI18n();
  return (
    <>
      {damageTypeSegments(lang, text).map((seg, i) =>
        seg.cls ? (
          <span key={i} className={seg.cls}>
            {seg.text}
          </span>
        ) : (
          seg.text
        ),
      )}
    </>
  );
}
