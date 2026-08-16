import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { AppState, Combatant, Condition } from '../../../shared/types';
import { useI18n } from '../i18n';

/**
 * Display-only window for the players' screen. Monster HP is never shown;
 * monsters below 50% max HP redden progressively ("bloodied").
 *
 * Layout always fits every actor on screen: more actors → extra columns and
 * smaller (but still readable) cards. Soft cap 25 — beyond that, overflow.
 */

const baseName = (c: Combatant) => c.displayName.replace(/\s+\d+$/, '');

const instanceNumber = (c: Combatant): number | null => {
  const m = c.displayName.match(/\s(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
};

const isBloodied = (c: Combatant) => c.currentHp < 0.5 * c.maxHp;

const severityOf = (c: Combatant) =>
  isBloodied(c) ? Math.min(1, (0.5 * c.maxHp - c.currentHp) / (0.5 * c.maxHp)) : 0;

/** [1,2,3] → "1-3"; [1,4] → "1,4"; [1,3,4] → "1,3-4". */
function formatNumbers(nums: number[]): string {
  const sorted = [...nums].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const n of sorted.slice(1).concat(NaN)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = n;
  }
  return parts.join(',');
}

type Entry =
  | { kind: 'pc'; c: Combatant }
  | { kind: 'monsters'; name: string; groupKey: string; members: Combatant[] };

/**
 * Monsters only merge when the players couldn't tell them apart anyway:
 * adjacent in the initiative order, same name, same bloodied state, and the
 * same set of conditions. One goblin bloodied while its neighbor isn't →
 * separate numbered cards, so players can see which one is hurt.
 */
function publicStateKey(c: Combatant): string {
  return `${baseName(c)}|${isBloodied(c) ? 'b' : '-'}|${[...c.conditions].sort().join(',')}`;
}

function buildEntries(combatants: Combatant[]): Entry[] {
  const entries: Entry[] = [];
  for (const c of combatants) {
    if (c.type === 'pc') {
      entries.push({ kind: 'pc', c });
      continue;
    }
    const groupKey = publicStateKey(c);
    const last = entries[entries.length - 1];
    if (last && last.kind === 'monsters' && last.groupKey === groupKey) {
      last.members.push(c);
    } else {
      entries.push({ kind: 'monsters', name: baseName(c), groupKey, members: [c] });
    }
  }
  return entries;
}

/**
 * Live size of the area the cards actually get, however the window changes.
 * A callback ref (rather than an effect) because the stage only exists while
 * a combat is running — it has to be measured whenever it appears.
 */
function useStageSize(): [(el: HTMLDivElement | null) => void, { w: number; h: number }] {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const setRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    observer.current = ro;
    // Seed straight away so the first paint isn't the fallback size.
    setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
  }, []);
  return [setRef, size];
}

/** Soft cap: past this many cards the layout stops shrinking and overflows. */
const SIZING_CAP = 25;
const GAP = 10;
/** A card narrower than this can't hold a name and HP side by side. */
const MIN_CARD_W = 200;
const MIN_FONT = 13;
const MAX_FONT = 34;
/** A card is roughly this many em tall: one name line plus padding. */
const CARD_EM_H = 2.3;
/** …and needs roughly this many em of width for a name beside its HP. */
const CARD_EM_W = 10;

export interface PvLayout {
  cols: number;
  rows: number;
  fontPx: number;
}

/**
 * Pick the column count that yields the largest readable card for the space
 * we actually have. Every candidate is scored by the font size it allows —
 * limited by both the resulting card height and its width — so a wide window
 * spreads into columns while a narrow one stays in one.
 */
export function chooseLayout(count: number, w: number, h: number): PvLayout {
  if (count <= 0 || w <= 0 || h <= 0) return { cols: 1, rows: 1, fontPx: 24 };
  const sizingCount = Math.min(count, SIZING_CAP);
  const maxCols = Math.max(1, Math.min(6, Math.floor((w + GAP) / (MIN_CARD_W + GAP))));

  let best: PvLayout | null = null;
  for (let cols = 1; cols <= maxCols; cols++) {
    const rows = Math.ceil(sizingCount / cols);
    const cardW = (w - GAP * (cols - 1)) / cols;
    const cardH = (h - GAP * (rows - 1)) / rows;
    if (cardW < MIN_CARD_W) continue;
    const fontPx = Math.min(cardH / CARD_EM_H, cardW / CARD_EM_W, MAX_FONT);
    // Ties (e.g. everything already at MAX_FONT) prefer fewer columns.
    if (!best || fontPx > best.fontPx + 0.01) {
      best = { cols, rows, fontPx };
    }
  }
  if (!best) best = { cols: 1, rows: sizingCount, fontPx: MIN_FONT };
  return { ...best, fontPx: Math.max(MIN_FONT, Math.min(MAX_FONT, best.fontPx)) };
}

export function PlayerView({ state }: { state: AppState }) {
  const { t } = useI18n();
  const [stageRef, stage] = useStageSize();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const combat = state.combat;
  const active = combat !== null && combat.phase === 'active';

  const entries: Entry[] = active ? buildEntries(combat.combatants) : [];
  const layout = chooseLayout(entries.length, stage.w, stage.h);
  // All entries still lay out in the chosen columns; past the sizing cap the
  // extra rows simply run off the bottom.
  const rowsAll = Math.max(1, Math.ceil(entries.length / layout.cols));

  /**
   * The estimate above can't know when a long name wraps or a card grows a
   * row of condition badges, so measure the result and scale down until it
   * actually fits (never below the readable floor — past that, it overflows).
   */
  const [fit, setFit] = useState(1);
  const badgeCount = entries.reduce(
    (n, e) => n + (e.kind === 'pc' ? e.c.conditions.length : e.members[0].conditions.length),
    0,
  );
  const fitKey = `${entries.length}|${badgeCount}|${stage.w}x${stage.h}`;
  const lastFitKey = useRef(fitKey);
  useLayoutEffect(() => {
    if (lastFitKey.current !== fitKey) {
      // Inputs changed: start from the estimate again and re-measure.
      lastFitKey.current = fitKey;
      setFit(1);
      return;
    }
    const grid = gridRef.current;
    if (!grid || stage.h <= 0) return;
    if (grid.scrollHeight <= stage.h + 2) return;
    const floor = MIN_FONT / layout.fontPx;
    const next = Math.max(floor, fit * (stage.h / grid.scrollHeight));
    if (next < fit - 0.02) setFit(next);
  });
  const fontPx = Math.max(MIN_FONT, layout.fontPx * fit);

  return (
    <div className="player-view" style={{ background: state.settings.playerViewBgColor }}>
      {/* Outside combat the view stays a plain colored screen (chroma-key friendly). */}
      {active && (
        <>
          <div className="pv-header">
            <span className="pv-round">{t('combat.round', { n: combat.round })}</span>
          </div>
          <div className="pv-stage" ref={stageRef}>
          <div
            className="pv-cards"
            ref={gridRef}
            style={{
              fontSize: fontPx,
              gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rowsAll}, min-content)`,
            }}
          >
            {entries.map((entry) =>
              entry.kind === 'pc' ? (
                <PlayerCard
                  key={entry.c.id}
                  c={entry.c}
                  isCurrent={combat.combatants[combat.currentIndex]?.id === entry.c.id}
                />
              ) : (
                <MonsterGroupCard
                  key={entry.members[0].id}
                  name={entry.name}
                  members={entry.members}
                  isCurrent={entry.members.some(
                    (m) => combat.combatants[combat.currentIndex]?.id === m.id,
                  )}
                />
              ),
            )}
          </div>
          </div>
        </>
      )}
    </div>
  );
}

function ConditionBadges({ conditions }: { conditions: string[] }) {
  const { cond: label } = useI18n();
  if (conditions.length === 0) return null;
  return (
    <div className="pv-conditions">
      {conditions.map((c) => (
        <span key={c} className="pv-condition">{label(c as Condition)}</span>
      ))}
    </div>
  );
}

/**
 * Fully opaque bloodied card colours (any alpha here would let the chroma-key
 * colour show through). Colour and gradient set separately: the `background`
 * shorthand would blank the colour, leaving only the gradient over the key.
 */
function bloodiedStyle(severity: number) {
  return {
    backgroundColor: 'rgb(44, 14, 18)',
    backgroundImage: `linear-gradient(145deg, rgb(${Math.round(70 + severity * 120)}, ${Math.round(18 + severity * 12)}, ${Math.round(22 + severity * 14)}), rgb(44, 14, 18))`,
    borderColor: `rgb(${Math.round(150 + severity * 70)}, ${Math.round(48 + severity * 22)}, 50)`,
  };
}

function PlayerCard({ c, isCurrent }: { c: Combatant; isCurrent: boolean }) {
  const { t } = useI18n();
  // PCs redden exactly like monsters below half HP; downed keeps its own
  // muted look instead (the skull line already carries that state).
  const bloodied = !c.isDowned && isBloodied(c);
  const style = bloodied ? bloodiedStyle(severityOf(c)) : undefined;
  return (
    <div
      className={`pv-card pc ${isCurrent ? 'current' : ''} ${c.isDowned ? 'downed' : ''}`}
      style={style}
    >
      <div className="pv-card-name"><span>{c.displayName}</span></div>
      {isCurrent && <span className="pv-turn-chip">{t('pv.turn')}</span>}
      <div
        className={`pv-hp ${
          c.isDowned ? 'zero' : c.currentHp < c.maxHp / 2 ? 'hurt' : ''
        }`}
      >
        {c.isDowned ? t('pv.downed') : `${c.currentHp} / ${c.maxHp}`}
      </div>
      <ConditionBadges conditions={c.conditions} />
    </div>
  );
}

function MonsterGroupCard({
  name,
  members,
  isCurrent,
}: {
  name: string;
  members: Combatant[];
  isCurrent: boolean;
}) {
  // Members share bloodied state + conditions (that's the grouping criterion).
  const { t, mon } = useI18n();
  const bloodied = isBloodied(members[0]);
  const severity = members.reduce((sum, m) => sum + severityOf(m), 0) / members.length;
  const style = bloodied ? bloodiedStyle(severity) : undefined;
  const numbers = members
    .map(instanceNumber)
    .filter((n): n is number => n !== null);

  return (
    <div className={`pv-card monster ${isCurrent ? 'current' : ''}`} style={style}>
      <div className="pv-card-name">
        <span>{mon(name)}</span>
        {numbers.length > 0 && (
          <span className="pv-nums">{formatNumbers(numbers)}</span>
        )}
        {members.length > 1 && <span className="pv-count">×{members.length}</span>}
      </div>
      {isCurrent && <span className="pv-turn-chip">{t('pv.turn')}</span>}
      <div className="pv-hp monster-hp">{bloodied ? t('pv.bloodied') : ' '}</div>
      <ConditionBadges conditions={members[0].conditions} />
    </div>
  );
}
