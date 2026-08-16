import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppState, Combatant, Condition } from '../../../shared/types';
import { CONDITIONS } from '../../../shared/types';
import { api } from '../api';
import { useConfirm } from '../Confirm';
import { AttackText } from '../AttackText';
import { AbilityTable } from '../AbilityTable';
import { DiceRollerModal } from '../DiceRoller';
import { MonsterAttackModal, hasRollableAttacks } from '../MonsterAttackModal';
import { useI18n } from '../i18n';

export function CombatScreen({
  state,
  preselectedTemplateId,
}: {
  state: AppState;
  preselectedTemplateId?: string | null;
}) {
  const [showDice, setShowDice] = useState(false);
  const openDice = () => setShowDice(true);

  let body;
  if (!state.combat) {
    body = (
      <StartCombatWizard
        state={state}
        preselectedTemplateId={preselectedTemplateId}
        onOpenDice={openDice}
      />
    );
  } else if (state.combat.phase === 'setup') {
    body = <SetupPhase state={state} onOpenDice={openDice} />;
  } else {
    body = <ActivePhase state={state} onOpenDice={openDice} />;
  }

  return (
    <>
      {body}
      {showDice && <DiceRollerModal state={state} onClose={() => setShowDice(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- wizard

function StartCombatWizard({
  state,
  preselectedTemplateId,
  onOpenDice,
}: {
  state: AppState;
  preselectedTemplateId?: string | null;
  onOpenDice: () => void;
}) {
  const { t } = useI18n();
  const [templateId, setTemplateId] = useState<string | null>(preselectedTemplateId ?? null);

  useEffect(() => {
    if (preselectedTemplateId && state.encounterTemplates.some((t) => t.id === preselectedTemplateId)) {
      setTemplateId(preselectedTemplateId);
    }
  }, [preselectedTemplateId, state.encounterTemplates]);
  const [pcIds, setPcIds] = useState<Set<string>>(new Set(state.pcs.map((p) => p.id)));
  const [rollMode, setRollMode] = useState<'all' | 'monstersOnly'>('monstersOnly');

  const togglePc = (id: string) => {
    const next = new Set(pcIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPcIds(next);
  };

  const canStart = templateId !== null;

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{t('combat.startCombat')}</h1>
        <div className="header-actions">
          <button className="btn" onClick={onOpenDice}>{t('combat.diceRoller')}</button>
        </div>
      </header>

      {state.encounterTemplates.length === 0 ? (
        <p className="empty-note">
          {t('combat.needTemplate')}
        </p>
      ) : (
        <div className="wizard">
          <section className="wizard-step">
            <h2>{t('combat.step1')}</h2>
            <div className="wizard-options">
              {state.encounterTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  className={`pick-btn large ${templateId === tpl.id ? 'picked' : ''}`}
                  onClick={() => setTemplateId(tpl.id)}
                >
                  <strong>{tpl.name}</strong>
                  <span className="muted">
                    {tpl.entries.reduce((s, e) => s + e.quantity, 0)} {t('templates.monsters')}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="wizard-step">
            <h2>{t('combat.step2')}</h2>
            {state.pcs.length === 0 && (
              <p className="muted">{t('combat.noPcs')}</p>
            )}
            <div className="wizard-options">
              {state.pcs.map((pc) => (
                <button
                  key={pc.id}
                  className={`pick-btn large ${pcIds.has(pc.id) ? 'picked' : ''}`}
                  onClick={() => togglePc(pc.id)}
                >
                  <strong>{pc.name}</strong>
                  <span className="muted">{t('combat.hpAc', { hp: pc.maxHp, ac: pc.ac })}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="wizard-step">
            <h2>{t('combat.step3')}</h2>
            <div className="wizard-options">
              <button
                className={`pick-btn large ${rollMode === 'all' ? 'picked' : ''}`}
                onClick={() => setRollMode('all')}
              >
                <strong>{t('combat.rollAll')}</strong>
                <span className="muted">{t('combat.rollAllNote')}</span>
              </button>
              <button
                className={`pick-btn large ${rollMode === 'monstersOnly' ? 'picked' : ''}`}
                onClick={() => setRollMode('monstersOnly')}
              >
                <strong>{t('combat.rollMonsters')}</strong>
                <span className="muted">{t('combat.rollMonstersNote')}</span>
              </button>
            </div>
          </section>

          <button
            className="btn primary big"
            disabled={!canStart}
            onClick={() => void api.startCombatSetup(templateId!, [...pcIds], rollMode)}
          >
            {t('combat.rollInitiative')}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- setup

function SetupPhase({ state, onOpenDice }: { state: AppState; onOpenDice: () => void }) {
  const { t, mon } = useI18n();
  const combat = state.combat!;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const allSet = combat.combatants.every((c) => c.initiative !== null);

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{t('combat.initiativeOrder')}</h1>
        <div className="header-actions">
          <button className="btn" onClick={onOpenDice}>{t('combat.diceRoller')}</button>
          <button className="btn" onClick={() => void api.endCombat()}>{t('common.cancel')}</button>
          <button
            className="btn primary"
            disabled={!allSet}
            title={allSet ? '' : t('combat.enterInitFirst')}
            onClick={() => void api.beginCombat()}
          >
            {t('combat.beginCombat')}
          </button>
        </div>
      </header>

      <p className="muted setup-hint">{t('combat.setupHint')}</p>

      <ul className="setup-list">
        {combat.combatants.map((c, i) => (
          <li
            key={c.id}
            className={`setup-row ${c.type} ${dragIndex === i ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) {
                void api.reorderCombatant(dragIndex, i);
                setDragIndex(i);
              }
            }}
          >
            <span className="drag-handle">⋮⋮</span>
            <span className="setup-name">
              {mon(c.displayName)}
              <span className="muted"> · {t('combat.mod')} {c.initMod >= 0 ? `+${c.initMod}` : c.initMod}</span>
            </span>
            {c.type === 'monster' ? (
              <span className="setup-init">
                <strong>{c.initiative}</strong>
                <button
                  className="btn small"
                  title={t('combat.reroll')}
                  onClick={() => void api.rerollInitiative(c.id)}
                >
                  🎲
                </button>
              </span>
            ) : (
              <span className="setup-init">
                <input
                  type="number"
                  className="init-input"
                  placeholder="—"
                  value={c.initiative ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    void api.setInitiative(c.id, v === '' ? null : parseInt(v, 10));
                  }}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- active

function ActivePhase({ state, onOpenDice }: { state: AppState; onOpenDice: () => void }) {
  const { t, mon, cond: cond2 } = useI18n();
  const combat = state.combat!;
  const confirm = useConfirm();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [conditionsFor, setConditionsFor] = useState<string | null>(null);
  const [attacksFor, setAttacksFor] = useState<string | null>(null);
  const [addingMonster, setAddingMonster] = useState(false);
  const [attackModalFor, setAttackModalFor] = useState<string | null>(null);

  const currentId = combat.combatants[combat.currentIndex]?.id;
  const scrollPendingRef = useRef<string | null>(null);

  /**
   * The row whose quick reference the auto-open setting wants showing, or
   * null when the setting is off or the current actor has nothing to show.
   * Panels that temporarily replace the reference restore it from here.
   */
  const autoReferenceId = (() => {
    if (!state.settings.autoOpenAttacks) return null;
    const cur = combat.combatants[combat.currentIndex];
    return cur && cur.type === 'monster' && cur.attacks.length > 0 ? cur.id : null;
  })();
  useEffect(() => {
    // Follow the turn with the quick reference (Settings → DM Combat Screen).
    if (!state.settings.autoOpenAttacks) return;
    const cur = combat.combatants[combat.currentIndex];
    if (cur && cur.type === 'monster' && cur.attacks.length > 0) {
      setAttacksFor(cur.id);
      setConditionsFor(null);
      scrollPendingRef.current = cur.id;
    } else {
      setAttacksFor(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, state.settings.autoOpenAttacks]);

  useLayoutEffect(() => {
    // After the auto-opened reference is in the DOM, bring the whole card
    // (row + reference) into view — minimally, and only when needed. Cards
    // taller than the viewport align to the top so the reference's start
    // (ability table) is visible below the sticky header.
    if (scrollPendingRef.current && attacksFor === scrollPendingRef.current) {
      scrollPendingRef.current = null;
      const el = document.querySelector(`[data-cid="${attacksFor}"]`);
      if (!el) return;
      const viewH = el.closest('.content')?.clientHeight ?? window.innerHeight;
      const oversized = el.getBoundingClientRect().height > viewH - 88;
      el.scrollIntoView({ block: oversized ? 'start' : 'nearest', behavior: 'smooth' });
    }
  }, [attacksFor]);

  const amountFor = (id: string) => {
    const n = parseInt(amounts[id] ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const applyAmount = (id: string, kind: 'damage' | 'heal') => {
    const n = amountFor(id);
    if (n === null) return;
    if (kind === 'damage') void api.applyDamage(id, n);
    else void api.applyHeal(id, n);
    setAmounts({ ...amounts, [id]: '' });
  };

  return (
    <div className="screen">
      <header className="screen-header combat-sticky">
        <h1>
          {t('combat.header')}{' '}
          <span className="round-badge">{t('combat.roundBadge', { n: combat.round })}</span>
        </h1>
        <div className="header-actions">
          <button className="btn" onClick={onOpenDice}>{t('combat.diceRoller')}</button>
          <button className="btn" onClick={() => setAddingMonster(true)}>{t('combat.addMonster')}</button>
          <button className="btn" onClick={() => void api.prevTurn()}>{t('combat.prev')}</button>
          <button className="btn primary" onClick={() => void api.nextTurn()}>{t('combat.next')}</button>
          <button
            className="btn danger"
            onClick={async () => {
              if (await confirm(t('combat.endThisCombat'), t('combat.end'))) void api.endCombat();
            }}
          >
            {t('combat.end')}
          </button>
        </div>
      </header>

      <ul className="combat-list">
        {combat.combatants.map((c, i) => {
          const isCurrent = i === combat.currentIndex;
          // Same bloodied cue as the Player View: below half HP the row tints
          // progressively redder. Translucent, so it sits on every theme.
          const bloodied = !c.isDowned && c.currentHp < c.maxHp / 2;
          const severity = bloodied ? Math.min(1, (c.maxHp / 2 - c.currentHp) / (c.maxHp / 2)) : 0;
          const bloodStyle = bloodied
            ? {
                background: `linear-gradient(90deg, rgba(190, 36, 36, ${(0.1 + severity * 0.16).toFixed(3)}), rgba(190, 36, 36, ${(0.03 + severity * 0.08).toFixed(3)}))`,
              }
            : undefined;
          return (
            <li
              key={c.id}
              data-cid={c.id}
              className={`combat-row ${c.type} ${isCurrent ? 'current' : ''} ${c.isDowned ? 'downed' : ''}`}
              style={bloodStyle}
            >
              <div
                className={`combat-row-main ${c.type === 'monster' && c.attacks.length > 0 ? 'clickable' : ''}`}
                onClick={(e) => {
                  // Clicking a monster row toggles its attack preview; leave
                  // buttons and inputs to do their own thing.
                  if ((e.target as HTMLElement).closest('button, input')) return;
                  if (c.type === 'monster' && c.attacks.length > 0) {
                    setAttacksFor(attacksFor === c.id ? null : c.id);
                    setConditionsFor(null);
                  }
                }}
              >
                <span className="init-badge">{c.initiative}</span>
                <span className="combat-name">
                  {isCurrent && <span className="turn-arrow">▶ </span>}
                  {mon(c.displayName)}
                  {c.isDowned && <span className="downed-tag"> ✝ {t('combat.downed')}</span>}
                </span>
                <span className="ac-badge" title={t('combat.armorClass')}>{t('common.ac')} {c.ac}</span>
                <span className={`hp ${c.currentHp <= c.maxHp / 2 ? 'low' : ''}`}>
                  {c.currentHp}/{c.maxHp}
                </span>
                {bloodied && <span className="bloodied-tag">{t('pv.bloodied')}</span>}
                <span className="hp-controls">
                  <input
                    type="number"
                    min={1}
                    placeholder="0"
                    className="amount-input"
                    value={amounts[c.id] ?? ''}
                    onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyAmount(c.id, e.shiftKey ? 'heal' : 'damage');
                    }}
                  />
                  <button
                    className="btn small danger"
                    disabled={amountFor(c.id) === null}
                    onClick={() => applyAmount(c.id, 'damage')}
                    title={t('combat.applyDamage')}
                  >
                    {t('combat.dmgBtn')}
                  </button>
                  <button
                    className="btn small heal"
                    disabled={amountFor(c.id) === null}
                    onClick={() => applyAmount(c.id, 'heal')}
                    title={t('combat.applyHealing')}
                  >
                    {t('combat.healBtn')}
                  </button>
                </span>
                <span className="row-tools">
                  {c.type === 'monster' && isCurrent && hasRollableAttacks(c) && (
                    <button
                      className="btn small primary"
                      title={t('combat.rollMonsterAttack')}
                      onClick={() => setAttackModalFor(c.id)}
                    >
                      {t('combat.attack')}
                    </button>
                  )}
                  <button
                    className={`btn small ${conditionsFor === c.id ? 'primary' : ''}`}
                    onClick={() => {
                      const closing = conditionsFor === c.id;
                      setConditionsFor(closing ? null : c.id);
                      // Closing conditions hands the row back to the
                      // auto-opened quick reference, if there is one.
                      setAttacksFor(closing ? autoReferenceId : null);
                    }}
                  >
                    {t('combat.conditions')}
                  </button>
                  {c.type === 'monster' && c.attacks.length > 0 && (
                    <button
                      className={`btn small ${attacksFor === c.id ? 'primary' : ''}`}
                      onClick={() => {
                        setAttacksFor(attacksFor === c.id ? null : c.id);
                        setConditionsFor(null);
                      }}
                    >
                      {t('combat.attacks')}
                    </button>
                  )}
                </span>
              </div>

              {c.conditions.length > 0 && (
                <div className="condition-badges">
                  {c.conditions.map((cond) => (
                    <span key={cond} className="condition-badge" title={t('combat.clickToRemove')}
                      onClick={() => void api.toggleCondition(c.id, cond)}>
                      {cond2(cond)}
                    </span>
                  ))}
                </div>
              )}

              {conditionsFor === c.id && (
                <div className="condition-picker">
                  {CONDITIONS.map((cond) => (
                    <button
                      key={cond}
                      className={`pick-btn ${c.conditions.includes(cond) ? 'picked' : ''}`}
                      onClick={() => void api.toggleCondition(c.id, cond)}
                    >
                      {cond2(cond)}
                    </button>
                  ))}
                </div>
              )}

              {attacksFor === c.id && (
                <AttackPanel
                  combatant={c}
                  l10n={state.monsters.find((m) => m.id === c.sourceId)?.l10n?.de}
                />
              )}
            </li>
          );
        })}
      </ul>
      {combat.combatants.length === 0 && (
        <p className="empty-note">{t('combat.noCombatants')}</p>
      )}

      {addingMonster && <AddMonsterModal state={state} onClose={() => setAddingMonster(false)} />}
      {attackModalFor && (
        <MonsterAttackModal
          state={state}
          attackerId={attackModalFor}
          onClose={() => setAttackModalFor(null)}
        />
      )}
    </div>
  );
}

function AddMonsterModal({ state, onClose }: { state: AppState; onClose: () => void }) {
  const { t, mon } = useI18n();
  const [filter, setFilter] = useState('');
  const [quantity, setQuantity] = useState('1');

  const monsters = state.monsters.filter((m) =>
    m.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('combat.addMonsterToCombat')}</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          {t('combat.initiativeAuto')}
        </p>
        <div className="form-row">
          <label>
            {t('common.quantity')}
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label>
            {t('templates.searchLibrary')}
            <input
              autoFocus
              placeholder={t('monsters.search')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
        </div>
        <div className="monster-pick-list">
          {monsters.slice(0, 60).map((m) => (
            <button
              key={m.id}
              className="pick-btn"
              title={`HP ${m.maxHp} · AC ${m.ac}`}
              onClick={async () => {
                await api.addMonsterToCombat(m.id, qty);
                onClose();
              }}
            >
              {qty > 1 ? `${qty}× ` : ''}{mon(m.name)}
            </button>
          ))}
          {monsters.length > 60 && (
            <span className="muted">{t('combat.moreRefine', { n: monsters.length - 60 })}</span>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

function AttackPanel({
  combatant,
  l10n,
}: {
  combatant: Combatant;
  l10n?: import('../../../shared/i18n').MonsterL10n;
}) {
  const { t, abilityCode, locAction, fmtRange } = useI18n();
  return (
    <div className="attack-panel">
      {combatant.abilities && <AbilityTable abilities={combatant.abilities} />}
      {combatant.attacks.map((a) => {
        const loc = locAction(l10n, a);
        // Attack rolls render compactly; save/other actions live in their text.
        const showText = a.type !== 'attack' && loc.text;
        return (
          <div key={a.id} className="attack-panel-row" title={loc.text}>
            <strong>{loc.name}</strong>
            {a.display.toHit && <span>{a.display.toHit} {t('combat.toHit')}</span>}
            {a.save && <span>{t('combat.saveDc', { ability: abilityCode(a.save.ability), dc: a.save.dc })}</span>}
            {loc.range && <span>{fmtRange(loc.range)}</span>}
            {loc.damage && <span>{loc.damage}</span>}
            {a.attack?.usage?.type === 'recharge' && <span className="muted">{t('attack.recharge', { min: a.attack.usage.min })}</span>}
            {showText && <AttackText text={loc.text} />}
          </div>
        );
      })}
    </div>
  );
}
