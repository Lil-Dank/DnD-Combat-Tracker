import { useEffect, useMemo, useRef, useState } from 'react';
import { abilityCodeLabel, abilityLabels, conditionLabel, damageTypeLabel, translate, DAMAGE_TYPE_DE, type Lang } from '../shared/i18n';
import { displayDice, formatDice, parseDice } from '../shared/dice';
import { damageTypeSegments, logEntrySegments, logEntryText } from '../shared/logText';
import type { LogEntry, MonsterAction } from '../shared/types';
import { ABILITY_KEYS, abilityMod } from '../shared/types';
import { formToAction, actionToForm, emptyAction, ABILITIES, type ActionForm } from '../renderer/src/actionForm';
import type {
  ArchiveEntryMsg,
  AttackResultMsg,
  SaveResolvedMsg,
  StateMsg,
  WireCombatant,
} from './protocol';
import { PlayerSocket, deviceToken } from './ws';
import { DamageEditor } from '../components/DamageEditor';

type View =
  | { id: 'home' }
  | { id: 'hp'; mode: 'damage' | 'heal' }
  | { id: 'attack' }
  | { id: 'myAttacks' }
  | { id: 'log' }
  | { id: 'archive' };

/** Rollable actions, same filter the deck uses. */
const rollable = (a: MonsterAction) =>
  a.type === 'attack' || (a.type === 'save' && a.onHit.damage.length > 0);

export function App() {
  const [state, setState] = useState<StateMsg | null>(null);
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState<View>({ id: 'home' });
  const [toast, setToast] = useState<string | null>(null);
  const [attackMsg, setAttackMsg] = useState<AttackResultMsg | SaveResolvedMsg | null>(null);
  const [waitingSave, setWaitingSave] = useState(false);
  const [archiveEntry, setArchiveEntry] = useState<ArchiveEntryMsg | null>(null);
  const socketRef = useRef<PlayerSocket | null>(null);

  const lang: Lang = state?.language ?? 'en';
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);

  useEffect(() => {
    const socket = new PlayerSocket((msg) => {
      switch (msg.type) {
        case 'state':
          setState(msg);
          break;
        case 'attackResult':
          setAttackMsg(msg);
          break;
        case 'savePending':
          setWaitingSave(true);
          break;
        case 'saveResolved':
          setWaitingSave(false);
          setAttackMsg(msg);
          break;
        case 'archiveEntry':
          setArchiveEntry(msg);
          break;
        case 'kicked':
          setToast('mob.kicked');
          setView({ id: 'home' });
          break;
        case 'error':
          setToast(`mob.err.${msg.code}`);
          break;
        default:
          break;
      }
    }, setConnected);
    socketRef.current = socket;
    socket.connect();
    return () => socket.close();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    // Phones have no devtools: surface uncaught errors instead of dying
    // silently. (translate() falls through to the raw text for non-keys.)
    const onError = (e: ErrorEvent) => setToast(e.message || 'mob.err.generic');
    const onReject = (e: PromiseRejectionEvent) => setToast(String(e.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onReject);
    };
  }, []);

  const send = (msg: Record<string, unknown>) =>
    socketRef.current?.send({ ...msg, token: deviceToken() });

  if (!state) {
    const guess: Lang = navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
    return <div className="center muted">{translate(guess, 'mob.connecting')}</div>;
  }

  const you = state.you;
  const gatingHint = !state.myTurn && state.combatActive && you?.combatantId
    ? state.gating === 'relaxed'
      ? 'mob.offTurnRelaxed'
      : 'mob.notYourTurn'
    : null;
  const canAct = state.myTurn;
  const canSelfHp = state.myTurn || state.gating === 'relaxed';

  return (
    <div className="mob">
      {!connected && <div className="banner offline">{t('mob.disconnected')}</div>}
      {toast && <div className="toast">{t(toast)}</div>}

      {!you ? (
        <ClaimScreen state={state} t={t} send={send} />
      ) : (
        <>
          <header className="mob-header">
            <div className="mob-title">
              <strong>{you.name}</strong>
              {state.combatActive && (
                <span className="round">{t('log.round', { round: state.round })}</span>
              )}
            </div>
            <button className="linkish" onClick={() => send({ type: 'release' })}>
              {t('mob.release')}
            </button>
          </header>

          {state.combatActive && (
            <div className={`turn-banner ${state.myTurn ? 'mine' : ''}`}>
              {t(state.myTurn ? 'mob.yourTurn' : gatingHint ?? 'mob.notYourTurn')}
            </div>
          )}

          {view.id === 'home' && (
            <>
              {state.combatActive ? (
                <InitiativeList state={state} t={t} lang={lang} />
              ) : (
                <div className="center muted tall">{t('mob.noCombat')}</div>
              )}
              <LogPeek state={state} lang={lang} onOpen={() => setView({ id: 'log' })} />
              <nav className="action-bar">
                <button
                  disabled={!state.combatActive || (!canAct && !canSelfHp)}
                  onClick={() => setView({ id: 'hp', mode: 'damage' })}
                >
                  💥 {t('mob.damage')}
                </button>
                <button
                  disabled={!state.combatActive || (!canAct && !canSelfHp)}
                  onClick={() => setView({ id: 'hp', mode: 'heal' })}
                >
                  ✚ {t('mob.heal')}
                </button>
                <button
                  disabled={!state.combatActive || !canAct || you.attacks.filter(rollable).length === 0}
                  onClick={() => setView({ id: 'attack' })}
                >
                  ⚔ {t('mob.attack')}
                </button>
                <button onClick={() => setView({ id: 'myAttacks' })}>
                  📝 {t('mob.myAttacks')}
                </button>
              </nav>
            </>
          )}

          {view.id === 'hp' && (
            <HpFlow
              state={state}
              t={t}
              mode={view.mode}
              selfOnly={!state.myTurn}
              onDone={(targets, amount) => {
                send({
                  type: view.mode === 'damage' ? 'applyDamage' : 'applyHeal',
                  targets,
                  amount,
                });
                setView({ id: 'home' });
              }}
              onCancel={() => setView({ id: 'home' })}
            />
          )}

          {view.id === 'attack' && (
            <AttackFlow
              state={state}
              t={t}
              send={send}
              result={attackMsg}
              waiting={waitingSave}
              clearResult={() => setAttackMsg(null)}
              onClose={() => {
                setAttackMsg(null);
                setWaitingSave(false);
                setView({ id: 'home' });
              }}
            />
          )}

          {view.id === 'myAttacks' && (
            <MyAttacks
              state={state}
              t={t}
              send={send}
              onArchive={() => setView({ id: 'archive' })}
              onClose={() => setView({ id: 'home' })}
            />
          )}

          {view.id === 'log' && (
            <Sheet title={t('mob.logTitle')} onClose={() => setView({ id: 'home' })} t={t}>
              <LogList log={state.log} lang={lang} />
            </Sheet>
          )}

          {view.id === 'archive' && (
            <Sheet title={t('mob.archive')} onClose={() => setView({ id: 'myAttacks' })} t={t}>
              {archiveEntry ? (
                <>
                  <button className="sheet-back" onClick={() => setArchiveEntry(null)}>
                    {t('common.back')}
                  </button>
                  <h3>
                    {archiveEntry.templateName}{' '}
                    <span className="muted">
                    {archiveEntry.rounds === 1
                      ? t('mob.roundsOne')
                      : t('mob.rounds', { rounds: archiveEntry.rounds })}
                  </span>
                  </h3>
                  <LogList log={archiveEntry.log} lang={lang} />
                </>
              ) : state.archive.length === 0 ? (
                <p className="muted">{t('mob.archiveEmpty')}</p>
              ) : (
                <ul className="archive-list">
                  {state.archive.map((a) => (
                    <li key={a.id}>
                      <button onClick={() => send({ type: 'getArchive', archiveId: a.id })}>
                        <strong>{a.templateName}</strong>
                        <span className="muted">
                          {new Date(a.endedAt).toLocaleDateString(
                            state.language === 'de' ? 'de-DE' : 'en-US',
                          )}{' '}
                          · {a.rounds === 1 ? t('mob.roundsOne') : t('mob.rounds', { rounds: a.rounds })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Sheet>
          )}
        </>
      )}
    </div>
  );
}

// ---- claim ------------------------------------------------------------------

function ClaimScreen({
  state,
  t,
  send,
}: {
  state: StateMsg;
  t: (k: string, p?: Record<string, string | number>) => string;
  send: (msg: Record<string, unknown>) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const pc = state.claims.find((c) => c.pcId === selected);

  return (
    <div className="claim">
      <h1>{t('mob.pickPc')}</h1>
      <ul className="claim-list">
        {state.claims.map((c) => (
          <li key={c.pcId}>
            <button
              className={`claim-pc ${selected === c.pcId ? 'selected' : ''} ${c.taken ? 'taken' : ''}`}
              disabled={c.taken}
              onClick={() => setSelected(c.pcId)}
            >
              <strong>{c.name}</strong>
              {c.taken && (
                <span className="muted">
                  {t('mob.taken')}
                  {c.playerName ? ` · ${c.playerName}` : ''}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {pc && (
        <div className="claim-join">
          <label>
            {t('mob.yourName')}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </label>
          <button
            className="big primary"
            onClick={() => send({ type: 'claim', pcId: pc.pcId, playerName: name })}
          >
            {t('mob.join', { name: pc.name })}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- initiative ------------------------------------------------------------

function InitiativeList({
  state,
  t,
  lang,
}: {
  state: StateMsg;
  t: (k: string, p?: Record<string, string | number>) => string;
  lang: Lang;
}) {
  return (
    <ul className="init-list">
      {state.combatants.map((c) => (
        <li
          key={c.id}
          className={`init-row ${c.type} ${c.isCurrentTurn ? 'current' : ''} ${
            c.id === state.you?.combatantId ? 'me' : ''
          } ${c.isDowned ? 'downed' : ''}`}
        >
          <div className="init-main">
            <span className="init-name">
              {c.isCurrentTurn && '▶ '}
              {c.name}
            </span>
            <span className="init-status">
              {c.type === 'pc' && c.currentHp !== undefined && (
                <span className="hp">
                  {c.isDowned ? t('pv.downed') : `${c.currentHp}/${c.maxHp}`}
                </span>
              )}
              {c.type === 'monster' && c.isBloodied && (
                <span className="bloodied">🩸 {t('pv.bloodied')}</span>
              )}
            </span>
          </div>
          {c.conditions.length > 0 && (
            <div className="init-conditions">
              {c.conditions.map((cond) => (
                <span key={cond} className="chip">
                  {conditionLabel(lang, cond)}
                </span>
              ))}
            </div>
          )}
          {c.id === state.you?.combatantId && state.you.abilities && (
            <div className="you-stats">
              {ABILITY_KEYS.map((k) => {
                const score = state.you!.abilities![k];
                const mod = abilityMod(score);
                return (
                  <span key={k} className="you-stat tnum">
                    <b>{abilityLabels(lang)[k]}</b> {score} ({mod >= 0 ? `+${mod}` : mod})
                  </span>
                );
              })}
            </div>
          )}
          {c.id === state.you?.combatantId && state.you.notes && (
            <div className="you-notes">{state.you.notes}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---- damage / heal ----------------------------------------------------------

function HpFlow({
  state,
  t,
  mode,
  selfOnly,
  onDone,
  onCancel,
}: {
  state: StateMsg;
  t: (k: string, p?: Record<string, string | number>) => string;
  mode: 'damage' | 'heal';
  selfOnly: boolean;
  onDone: (targets: string[], amount: number) => void;
  onCancel: () => void;
}) {
  const [targets, setTargets] = useState<string[]>(
    selfOnly && state.you?.combatantId ? [state.you.combatantId] : [],
  );
  const [amount, setAmount] = useState('');

  const toggle = (id: string) =>
    setTargets((ts) => (ts.includes(id) ? ts.filter((x) => x !== id) : [...ts, id]));

  const parsed = parseInt(amount, 10);
  const valid = targets.length > 0 && Number.isInteger(parsed) && parsed >= 1 && parsed <= 999;

  return (
    <Sheet title={`${mode === 'damage' ? '💥' : '✚'} ${t(`mob.${mode}`)}`} onClose={onCancel} t={t}>
      <h3>{t('mob.pickTargets')}</h3>
      <div className="target-grid">
        {state.combatants
          .filter((c) => !selfOnly || c.id === state.you?.combatantId)
          .map((c) => (
            <button
              key={c.id}
              className={`target ${c.type} ${targets.includes(c.id) ? 'selected' : ''}`}
              onClick={() => toggle(c.id)}
            >
              {c.name}
            </button>
          ))}
      </div>
      <label className="amount-label">
        {t('mob.amount')}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </label>
      <div className="quick-amounts">
        {[1, 5, 10].map((n) => (
          <button key={n} onClick={() => setAmount(String((parseInt(amount, 10) || 0) + n))}>
            +{n}
          </button>
        ))}
        <button onClick={() => setAmount('')}>{t('mob.clear')}</button>
      </div>
      <button className="big primary" disabled={!valid} onClick={() => onDone(targets, parsed)}>
        {t('mob.apply')}
      </button>
    </Sheet>
  );
}

// ---- attack flow ------------------------------------------------------------

function AttackFlow({
  state,
  t,
  send,
  result,
  waiting,
  clearResult,
  onClose,
}: {
  state: StateMsg;
  t: (k: string, p?: Record<string, string | number>) => string;
  send: (msg: Record<string, unknown>) => void;
  result: AttackResultMsg | SaveResolvedMsg | null;
  waiting: boolean;
  clearResult: () => void;
  onClose: () => void;
}) {
  const you = state.you!;
  const [attack, setAttack] = useState<MonsterAction | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [d20, setD20] = useState('');
  const [natural, setNatural] = useState<20 | 1 | null>(null);
  const [damage, setDamage] = useState('');

  const attacks = useMemo(() => you.attacks.filter(rollable), [you.attacks]);
  const isSave = attack ? attack.type === 'save' || attack.save !== null : false;

  const toggleTarget = (id: string) => {
    if (isSave) {
      setTargets((ts) => (ts.includes(id) ? ts.filter((x) => x !== id) : [...ts, id]));
    } else {
      setTargets([id]);
    }
  };

  const fireDigital = () => {
    send(
      isSave
        ? { type: 'attackDigital', attackId: attack!.id, targetIds: targets }
        : { type: 'attackDigital', attackId: attack!.id, targetIds: targets },
    );
  };

  const fireManual = () => {
    if (isSave) {
      send({
        type: 'attackManual',
        attackId: attack!.id,
        targetIds: targets,
        damage: parseInt(damage, 10) || 0,
      });
      return;
    }
    send({
      type: 'attackManual',
      attackId: attack!.id,
      targetIds: targets,
      d20Total: parseInt(d20, 10) || 0,
      natural: natural ?? undefined,
      damage: parseInt(damage, 10) || 0,
    });
  };

  // Result view (single attack or resolved saves)
  if (result || waiting) {
    return (
      <Sheet title={attack?.name ?? t('mob.attack')} onClose={onClose} t={t}>
        {waiting && <p className="waiting">{t('mob.waitingDm')}</p>}
        {result?.type === 'attackResult' && (
          <div className="result">
            <div className={`verdict ${result.outcome}`}>
              {t(`log.outcome.${result.outcome}`)}
            </div>
            <p>
              {result.targetName}
              {result.die !== null && ` · ${displayDice(state.language, 'd20')}: ${result.die}`}
              {` · ${result.total}`}
            </p>
            <p className="big-num">
              {result.damage !== null
                ? t('mob.dmgDealt', { damage: result.damage })
                : t('mob.noDamage')}
            </p>
            <button className="big primary" onClick={onClose}>
              {t('mob.done')}
            </button>
          </div>
        )}
        {result?.type === 'saveResolved' && (
          <div className="result">
            {result.cancelled ? (
              <p>{t('mob.cancelled')}</p>
            ) : (
              <ul className="save-results">
                {result.results.map((r) => (
                  <li key={r.targetId}>
                    <strong>{r.targetName}</strong>{' '}
                    {t(r.saved ? 'mob.savedHalf' : 'mob.failedFull')} ·{' '}
                    {t('mob.dmgDealt', { damage: r.amount })}
                  </li>
                ))}
              </ul>
            )}
            <button className="big primary" onClick={onClose}>
              {t('mob.done')}
            </button>
          </div>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet title={`⚔ ${t('mob.attack')}`} onClose={onClose} t={t}>
      {!attack && (
        <>
          <h3>{t('mob.pickAttack')}</h3>
          <ul className="attack-list">
            {attacks.map((a) => (
              <li key={a.id}>
                <button onClick={() => setAttack(a)}>
                  <strong>{a.name}</strong>
                  <span className="muted">
                    {a.display.toHit ?? (a.save ? `${abilityCodeLabel(state.language, a.save.ability)} ${a.save.dc}` : '')}
                    {a.display.damage ? (
                      <> · <DmgText lang={state.language} text={a.display.damage} /></>
                    ) : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {attack && (
        <>
          <h3>
            {attack.name} — {t('mob.pickTargets')}
          </h3>
          <div className="target-grid">
            {state.combatants
              .filter((c) => c.id !== you.combatantId)
              .map((c) => (
                <button
                  key={c.id}
                  className={`target ${c.type} ${targets.includes(c.id) ? 'selected' : ''}`}
                  onClick={() => toggleTarget(c.id)}
                >
                  {c.name}
                </button>
              ))}
          </div>

          {targets.length > 0 && (
            <>
              <div className="mode-toggle">
                <button className={manual ? '' : 'selected'} onClick={() => setManual(false)}>
                  {t('mob.digital')}
                </button>
                <button className={manual ? 'selected' : ''} onClick={() => setManual(true)}>
                  {t('mob.manual')}
                </button>
              </div>

              {!manual && (
                <button className="big primary" onClick={fireDigital}>
                  {t('mob.roll')}
                </button>
              )}

              {manual && (
                <div className="manual-entry">
                  {!isSave && (
                    <>
                      <label>
                        {t('mob.d20Total')}
                        <input
                          type="number"
                          inputMode="numeric"
                          value={d20}
                          onChange={(e) => setD20(e.target.value)}
                        />
                      </label>
                      <div className="nat-toggle">
                        <button
                          className={natural === 20 ? 'selected' : ''}
                          onClick={() => setNatural(natural === 20 ? null : 20)}
                        >
                          {t('mob.nat20')}
                        </button>
                        <button
                          className={natural === 1 ? 'selected' : ''}
                          onClick={() => setNatural(natural === 1 ? null : 1)}
                        >
                          {t('mob.nat1')}
                        </button>
                      </div>
                    </>
                  )}
                  <label>
                    {t('mob.damageRolled')}
                    <input
                      type="number"
                      inputMode="numeric"
                      value={damage}
                      onChange={(e) => setDamage(e.target.value)}
                    />
                  </label>
                  <button
                    className="big primary"
                    disabled={!isSave && d20.trim() === '' && natural === null}
                    onClick={fireManual}
                  >
                    {t('mob.resolve')}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

// ---- my attacks -------------------------------------------------------------

function MyAttacks({
  state,
  t,
  send,
  onArchive,
  onClose,
}: {
  state: StateMsg;
  t: (k: string, p?: Record<string, string | number>) => string;
  send: (msg: Record<string, unknown>) => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const you = state.you!;
  const [form, setForm] = useState<ActionForm | null>(null);

  const patch = (p: Partial<ActionForm>) => setForm((f) => (f ? { ...f, ...p } : f));

  const save = () => {
    if (!form || !form.name.trim()) return;
    const existing = you.attacks.find((a) => a.id === form.id);
    send({ type: 'saveAttack', action: formToAction(form, existing?.order ?? you.attacks.length, existing) });
    setForm(null);
  };

  return (
    <Sheet title={`📝 ${t('mob.myAttacks')}`} onClose={onClose} t={t}>
      {!form && (
        <>
          <ul className="attack-list">
            {you.attacks.map((a) => (
              <li key={a.id}>
                <button onClick={() => setForm(actionToForm(a))}>
                  <strong>{a.name}</strong>
                  <span className="muted">
                    {a.display.toHit ?? (a.save ? `${abilityCodeLabel(state.language, a.save.ability)} ${a.save.dc}` : '')}
                    {a.display.damage ? (
                      <> · <DmgText lang={state.language} text={a.display.damage} /></>
                    ) : ''}
                  </span>
                </button>
                <button
                  className="delete"
                  aria-label={t('common.delete')}
                  onClick={() => send({ type: 'deleteAttack', actionId: a.id })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button className="big" onClick={() => setForm(emptyAction())}>
            + {t('pcs.addAttack')}
          </button>
          <button className="linkish archive-link" onClick={onArchive}>
            📜 {t('mob.archive')}
          </button>
        </>
      )}

      {form && (
        <div className="mob-form">
          <label>
            {t('common.name')}
            <input value={form.name} onChange={(e) => patch({ name: e.target.value })} autoFocus />
          </label>
          <label>
            {t('common.type')}
            <select
              value={form.type}
              onChange={(e) => patch({ type: e.target.value as ActionForm['type'] })}
            >
              <option value="attack">{t('monsters.type.attack')}</option>
              <option value="save">{t('monsters.type.save')}</option>
            </select>
          </label>
          {form.type === 'attack' && (
            <label>
              {t('monsters.f.toHit')}
              <input
                type="number"
                inputMode="numeric"
                placeholder="+5"
                value={form.toHit}
                onChange={(e) => patch({ toHit: e.target.value })}
              />
            </label>
          )}
          {form.type === 'save' && (
            <div className="form-pair">
              <label>
                {t('monsters.f.saveAbility')}
                <select
                  value={form.saveAbility}
                  onChange={(e) => patch({ saveAbility: e.target.value })}
                >
                  {ABILITIES.map((ab) => (
                    <option key={ab} value={ab}>
                      {ab}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('common.dc')}
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.saveDc}
                  onChange={(e) => patch({ saveDc: e.target.value })}
                />
              </label>
            </div>
          )}
          <DamageEditor
            t={t}
            lang={state.language}
            value={{
              dice: form.damage[0]?.dice ?? '',
              flat: form.damage[0]?.flat ?? '',
              type: form.damage[0]?.type ?? '',
              condition: form.damage[0]?.condition ?? '',
            }}
            onChange={(p) =>
              patch({
                damage: [
                  {
                    dice: form.damage[0]?.dice ?? '',
                    flat: form.damage[0]?.flat ?? '',
                    type: form.damage[0]?.type ?? '',
                    condition: form.damage[0]?.condition ?? '',
                    ...p,
                  },
                ],
              })
            }
          />
          <div className="form-pair">
            <button className="big" onClick={() => setForm(null)}>
              {t('common.cancel')}
            </button>
            <button className="big primary" disabled={!form.name.trim()} onClick={save}>
              {t('pcs.save')}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---- log --------------------------------------------------------------------

function LogPeek({
  state,
  lang,
  onOpen,
}: {
  state: StateMsg;
  lang: Lang;
  onOpen: () => void;
}) {
  const last = state.log[state.log.length - 1];
  if (!last) return null;
  return (
    <button className="log-peek" onClick={onOpen}>
      <span className="peek-label">📜 {translate(lang, 'mob.logTitle')}</span>
      <span className="peek-entry">{logEntryText(lang, last)}</span>
      <span className="peek-chevron">▴</span>
    </button>
  );
}

/** Damage display string with dt-<type> colored damage-type words. */
function DmgText({ lang, text }: { lang: Lang; text: string }) {
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

function LogList({ log, lang }: { log: LogEntry[]; lang: Lang }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [log.length]);

  let lastRound = -1;
  return (
    <div className="log-list">
      {log.map((e) => {
        const roundHeader =
          e.round !== lastRound && e.round > 0 ? (
            <div className="log-round">{translate(lang, 'log.round', { round: e.round })}</div>
          ) : null;
        lastRound = e.round > 0 ? e.round : lastRound;
        return (
          <div key={e.id}>
            {roundHeader}
            <div className={`log-entry kind-${e.kind}`}>
              {logEntrySegments(lang, e).map((seg, i) =>
                seg.cls ? (
                  <span key={i} className={seg.cls}>
                    {seg.text}
                  </span>
                ) : (
                  seg.text
                ),
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

// ---- shared sheet -----------------------------------------------------------

function Sheet({
  title,
  onClose,
  t,
  children,
}: {
  title: string;
  onClose: () => void;
  t: (k: string) => string;
  children: React.ReactNode;
}) {
  return (
    <div className="sheet">
      <header className="sheet-header">
        <button className="sheet-back" onClick={onClose}>
          {t('common.back')}
        </button>
        <h2>{title}</h2>
      </header>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
