import { useEffect, useMemo, useState } from 'react';
import type { CombatantType, LogEntry, LogEntryPatch } from '../shared/types';
import { buildLogCards, entryDamageType, type CardBlock, type CardItem } from '../shared/logCards';
import {
  logCardSegments,
  logCardTime,
  logEntrySegments,
  logRollSegments,
  logSourceTag,
  rollMathSegments,
  type LogSegment,
} from '../shared/logText';
import { damageTypeLabel, type Lang } from '../shared/i18n';
import { displayDice } from '../shared/dice';
import { LogCardEditor } from './LogCardEditor';

/**
 * The combat log as cards (Foundry-style): one card per character, headed by
 * their name, containing structured blocks — attack rolls with both adv/dis
 * dice and a big verdict total, damage rolls with click-to-expand breakdowns,
 * casts with slot chips, public save rows, application lines. Shared by the
 * DM panel (editable), the archive and the phone (read-only; the redaction
 * already stripped DM-only numbers, so blocks simply render what exists).
 */

export interface LogCardOption {
  name: string;
  type: CombatantType;
}

export interface LogCardsProps {
  log: LogEntry[];
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** DM surfaces: source tags in the card headers. */
  showSource?: boolean;
  /** Live DM panel only: hover ✎/🗑 toolbars + inline editor. */
  editable?: boolean;
  /** Actor/target choices for the editor (current combatants). */
  options?: LogCardOption[];
  onEditEntry?: (id: string, patch: LogEntryPatch) => void | Promise<void>;
  onDeleteEntry?: (id: string) => void | Promise<void>;
  /** Lets the host suppress auto-scroll while an editor is open. */
  onEditingChange?: (editing: boolean) => void;
}

export function SegText({ segs }: { segs: LogSegment[] }) {
  return (
    <>
      {segs.map((seg, i) =>
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

/** Ticks every `ms` so relative timestamps stay fresh. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const subjectCls = (type?: CombatantType) =>
  type === 'pc' ? 'pc' : type === 'monster' ? 'monster' : '';

export function LogCards({
  log,
  lang,
  t,
  showSource = false,
  editable = false,
  options = [],
  onEditEntry,
  onDeleteEntry,
  onEditingChange,
}: LogCardsProps) {
  const items = useMemo(() => buildLogCards(log), [log]);
  const now = useNow(60_000);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    onEditingChange?.(editing !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const tools = (entry: LogEntry) =>
    editable && (
      <span className="log-block-tools">
        <button
          className="lbt-edit"
          title={t('common.edit')}
          onClick={() => setEditing(editing === entry.id ? null : entry.id)}
        >
          ✎
        </button>
        <button
          className="lbt-del"
          title={t('common.delete')}
          onClick={() => void onDeleteEntry?.(entry.id)}
        >
          🗑
        </button>
      </span>
    );

  const editor = (entry: LogEntry) =>
    editable &&
    editing === entry.id && (
      <LogCardEditor
        entry={entry}
        lang={lang}
        t={t}
        options={options}
        onSave={async (patch) => {
          await onEditEntry?.(entry.id, patch);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );

  const nameSpan = (name: string | undefined, type: CombatantType | undefined) =>
    name ? <b className={`sc seg-${type ?? 'none'}`}>{name}</b> : null;

  const renderAttack = (b: CardBlock & { kind: 'attack' }) => {
    const r = b.roll;
    const hasNumbers = r.total !== undefined;
    const dice = r.dice && r.dice.length > 1 ? r.dice : r.die !== undefined ? [r.die] : [];
    const advMode =
      dice.length > 1 ? (r.die === Math.max(...dice) ? 'adv' : 'dis') : null;
    const rollKey = `roll-${r.id}`;
    const rollBreakdown = logRollSegments(lang, r);
    const d = b.damage;
    const dmgType = d ? entryDamageType(d) : null;
    const dmgKey = d ? `dmg-${d.id}` : '';
    // "2d6 [3+5] +4 = 12" → formula "2d6 +4" for the row; full math expands.
    // Redacted live math ("2d6 +4 = 12", no brackets) still shows the thrown
    // composition but has no per-die results left to expand.
    const formula = d?.math
      ? displayDice(lang, d.math.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*=.*$/, ''))
      : null;
    const dmgExpands = !!d?.math && d.math.includes('[');
    return (
      <div key={b.key} className="log-block" data-kind="attack">
        {tools(r)}
        <div className="lb-action">
          {r.attackName}
          {r.targetName && (
            <span className="to"> → {nameSpan(r.targetName, r.targetType)}</span>
          )}
        </div>
        {hasNumbers ? (
          <>
            <div
              className={`lb-roll ${open.has(rollKey) ? 'open' : ''}`}
              onClick={() => rollBreakdown && toggle(rollKey)}
            >
              <span className="lbl">{t('log.card.attack')}</span>
              {advMode === 'adv' && <span className="adv">ADV</span>}
              {advMode === 'dis' && <span className="dis">DIS</span>}
              {dice.map((die, i) => (
                <span
                  key={i}
                  className={`die tnum ${dice.length > 1 && die !== r.die ? 'dropped' : ''}`}
                >
                  {die}
                </span>
              ))}
              <span className={`total tnum ${r.outcome ?? 'hit'}`}>{r.total}</span>
              <span className={`verdict ${r.outcome ?? 'hit'}`}>
                {t(`log.outcome.${r.outcome ?? 'hit'}`)}
              </span>
              {rollBreakdown && <span className="chev">▶</span>}
            </div>
            {rollBreakdown && open.has(rollKey) && (
              <div className="lb-breakdown tnum">
                <SegText segs={rollBreakdown} />
              </div>
            )}
          </>
        ) : (
          // Redacted (phones): the verdict is public, the numbers are not.
          <div className="lb-roll noclick">
            <span className="lbl">{t('log.card.attack')}</span>
            <span className={`verdict solo ${r.outcome ?? 'hit'}`}>
              {t(`log.outcome.${r.outcome ?? 'hit'}`)}
            </span>
          </div>
        )}
        {d && (
          <div className="lb-dmg">
            <span className="dmg-label sc">
              {t('log.card.damageLabel')}
              {dmgType && (
                <>
                  {' — '}
                  <span className={`type dt-${dmgType}`}>{damageTypeLabel(lang, dmgType)}</span>
                </>
              )}
            </span>
            <div
              className={`lb-dmg-row ${open.has(dmgKey) ? 'open' : ''} ${dmgExpands ? '' : 'noclick'}`}
              onClick={() => dmgExpands && toggle(dmgKey)}
            >
              {formula && <span className="formula tnum">{formula} =</span>}
              <span className={`total tnum ${dmgType ? `dt-${dmgType}` : ''}`}>{d.amount}</span>
              {dmgExpands && <span className="chev">▶</span>}
            </div>
            {dmgExpands && d.math && open.has(dmgKey) && (
              <div className="lb-breakdown tnum">
                <SegText segs={rollMathSegments(displayDice(lang, d.math), d.mathTypes)} />
              </div>
            )}
          </div>
        )}
        {editor(r)}
        {d && editing === d.id && editor(d)}
      </div>
    );
  };

  const renderCast = (b: CardBlock & { kind: 'cast' }) => {
    const e = b.entry;
    return (
      <div key={b.key} className="log-block lb-cast" data-kind="cast">
        {tools(e)}
        <div className="lb-action">
          ✨ <span className="casts-word">{t('log.card.casts')}</span>{' '}
          <span className="spell-name sc">{e.attackName}</span>
        </div>
        <div className="chips">
          <span className="slot-chip">
            {e.slotLevel != null ? t('log.card.slot', { n: e.slotLevel }) : t('log.card.cantrip')}
          </span>
          {e.conc && <span className="slot-chip">Ⓒ {t('spellbook.concentration')}</span>}
        </div>
        {editor(e)}
      </div>
    );
  };

  const renderSave = (b: CardBlock & { kind: 'save' }) => {
    const e = b.entry;
    const ok = e.outcome === 'saved';
    const mod = e.die !== undefined && e.total !== undefined ? e.total - e.die : null;
    return (
      <div key={b.key} className="log-block lb-save" data-kind="save">
        {tools(e)}
        <div className="save-label sc">🛡 {e.attackName}</div>
        <div className="lb-roll save noclick">
          <span className="lbl">{t('log.card.save')}</span>
          {e.die !== undefined && <span className="die tnum">{e.die}</span>}
          {mod !== null && mod !== 0 && (
            <span className="mod tnum">{mod > 0 ? `+${mod}` : mod}</span>
          )}
          {e.total !== undefined && (
            <span className={`total tnum ${ok ? 'ok' : 'fail'}`}>{e.total}</span>
          )}
          {e.dc !== undefined && <span className="vs tnum">{t('log.card.vsDc', { dc: e.dc })}</span>}
          <span className={`verdict ${ok ? 'ok' : 'fail'}`}>
            {t(ok ? 'log.card.saveOk' : 'log.card.saveFail')}
          </span>
        </div>
        {editor(e)}
      </div>
    );
  };

  const renderTextBlock = (b: CardBlock & { kind: 'take' | 'heal' | 'condition' | 'downkill' }) => {
    const e = b.entry;
    const cls = b.kind === 'downkill' ? 'log-block lb-down' : 'log-block';
    return (
      <div key={b.key} className={cls} data-kind={b.kind}>
        {tools(e)}
        <div className="lb-effect">
          <SegText segs={logCardSegments(lang, e)} />
        </div>
        {editor(e)}
      </div>
    );
  };

  const renderBlock = (b: CardBlock) => {
    switch (b.kind) {
      case 'attack':
        return renderAttack(b);
      case 'cast':
        return renderCast(b);
      case 'save':
        return renderSave(b);
      default:
        return renderTextBlock(b);
    }
  };

  const renderItem = (item: CardItem) => {
    if (item.type === 'separator') {
      if (item.sepKind === 'round') {
        return (
          <div key={item.key} className="log-sep-round">
            {t('log.round', { round: item.round ?? 0 })}
          </div>
        );
      }
      if (item.sepKind === 'turn') {
        return (
          <div key={item.key} className={`log-sep-turn ${subjectCls(item.entry?.actorType)}`}>
            ▶ <SegText segs={logEntrySegments(lang, item.entry!)} />
          </div>
        );
      }
      return (
        <div key={item.key} className="log-sep-bound">
          {item.sepKind === 'combatStart' ? '⚔ ' : '🏁 '}
          {t(item.sepKind === 'combatStart' ? 'log.combatStart' : 'log.combatEnd')}
        </div>
      );
    }
    return (
      <div key={item.key} className={`log-card ${subjectCls(item.subject.type)}`}>
        {item.subject.name && (
          <div className="log-card-header">
            <span className="log-card-name">{item.subject.name}</span>
            <span className="log-card-meta">
              {showSource && <>{logSourceTag(lang, { source: item.source, sourceName: item.sourceName } as LogEntry)} · </>}
              {logCardTime(lang, now, item.ts)}
            </span>
          </div>
        )}
        {item.blocks.map(renderBlock)}
      </div>
    );
  };

  return <div className="log-cards">{items.map(renderItem)}</div>;
}
