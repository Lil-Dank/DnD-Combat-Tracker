// The simulated Stream Deck panel for the GitHub Pages demo.
//
// This is not a mock-up: it bundles the plugin's REAL picker state machine,
// bridge and key renderer (with '@elgato/streamdeck' and 'ws' stubbed), so
// every flow behaves exactly like the hardware — actor select, numpad,
// conditions, dice roller, monster attacks, end-combat confirm, timeouts and
// all. Commands land in the demo engine the same way the desktop app would
// receive them over the WebSocket.
import { picker } from '../../../plugin/src/picker.ts';
import { bridge } from '../../../plugin/src/bridge.ts';
import { turnKeyImage, pickerKeyImage } from '../../../plugin/src/key-image.ts';
import { actorAt, actorKeyLines } from '../../../plugin/src/turn-labels.ts';
import { profileListeners } from './sd-stub.mjs';
import FakeWs from './ws-stub.mjs';

const COLS = 5;
const ROWS = 3;
const SLOTS = COLS * ROWS;
const DEVICE = { id: 'demo-deck', size: { columns: COLS, rows: ROWS } };

// Same palettes the real plugin uses for its turn keys.
const TURN_PURPLE = { from: '#3b1d63', to: '#7c3aed' };
const TURN_GOLD = { from: '#4a3410', to: '#d4a94f' };

const css = `
#demo-deck { position: fixed; right: 16px; bottom: 16px; z-index: 9999;
  width: 330px; background: #1c1c1e; border: 1px solid #3a3a3d; border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.55); font-family: 'Segoe UI', sans-serif;
  user-select: none; }
#demo-deck header { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  color: #d8d8dc; font-size: 12.5px; border-bottom: 1px solid #303033; }
#demo-deck header strong { flex: 1; font-weight: 600; }
#demo-deck header button { background: #2c2c30; color: #cfcfd4; border: 1px solid #444;
  border-radius: 6px; font-size: 11.5px; padding: 3px 8px; cursor: pointer; }
#demo-deck header button:hover { background: #38383d; }
#demo-deck .grid { display: grid; grid-template-columns: repeat(${COLS}, 1fr);
  gap: 6px; padding: 10px; background: #111; border-radius: 0 0 12px 12px; }
#demo-deck .key { aspect-ratio: 1; border-radius: 8px; overflow: hidden;
  background: #060606; border: 1px solid #2b2b2b; padding: 0; cursor: pointer; }
#demo-deck .key img { width: 100%; height: 100%; display: block; }
#demo-deck .key:active { transform: scale(0.94); }
#demo-deck.collapsed .grid { display: none; }
#demo-deck .hint { padding: 6px 12px 8px; color: #8b8b92; font-size: 11px; }
#demo-deck.collapsed .hint { display: none; }
`;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

// The panel belongs on the DM view only; the Player View tab loads the same
// page and must stay clean for chroma keying.
function boot() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const grid = el('div', { class: 'grid' });
  const resetBtn = el('button', { text: 'Reset demo' });
  const collapseBtn = el('button', { text: '—' });
  const panel = el('div', { id: 'demo-deck' }, [
    el('header', {}, [
      el('strong', { text: '🎛 Stream Deck (simulated)' }),
      resetBtn,
      collapseBtn,
    ]),
    grid,
    el('div', {
      class: 'hint',
      text: 'The real plugin logic, running in your browser. Demo data stays local.',
    }),
  ]);
  document.body.appendChild(panel);

  resetBtn.addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });
  collapseBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    collapseBtn.textContent = panel.classList.contains('collapsed') ? '▲' : '—';
  });

  // ---- keys -------------------------------------------------------------------

  const keys = [];
  for (let i = 0; i < SLOTS; i++) {
    const img = el('img', { alt: '' });
    const btn = el('button', { class: 'key' }, [img]);
    btn.addEventListener('click', () => onPress(i));
    grid.appendChild(btn);
    keys.push({ btn, img });
  }

  const BLANK =
    'data:image/svg+xml,' +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#060606"/></svg>');

  function setKey(slot, image) {
    keys[slot].img.src = image || BLANK;
  }

  /** Fake SDK key action handed to the picker: setImage lands in our grid. */
  const slotAction = (slot) => ({
    setTitle: async () => {},
    setImage: async (image) => {
      if (mode === 'picker') setKey(slot, image);
    },
    showOk: async () => {},
    showAlert: async () => flash(slot),
  });

  function flash(slot) {
    keys[slot].btn.style.outline = '2px solid #d94040';
    setTimeout(() => (keys[slot].btn.style.outline = ''), 350);
  }

  // ---- main profile layout ----------------------------------------------------

  // slot -> action key (mirrors a sensible home-profile layout)
  const MAIN = new Map([
    [0, { kind: 'prev' }],
    [1, { kind: 'current' }],
    [2, { kind: 'next' }],
    [3, { kind: 'begin', op: 'dice', lines: ['🎲', 'Dice'] }],
    [4, { kind: 'begin', op: 'end', lines: ['⏻', 'End'] }],
    [5, { kind: 'begin', op: 'damage', lines: ['⚔', 'Damage'] }],
    [6, { kind: 'begin', op: 'heal', lines: ['✚', 'Heal'] }],
    [7, { kind: 'begin', op: 'condition', lines: ['☰', 'Condi-', 'tion'] }],
    [8, { kind: 'begin', op: 'attack', lines: ['🎲', 'Attack'] }],
  ]);

  let mode = 'main'; // 'main' | 'picker'

  function renderMain() {
    for (let i = 0; i < SLOTS; i++) {
      const spec = MAIN.get(i);
      if (!spec) {
        setKey(i, BLANK);
        continue;
      }
      if (spec.kind === 'prev') {
        setKey(i, turnKeyImage('◀ Prev', actorKeyLines(actorAt(bridge.state, -1)), TURN_PURPLE));
      } else if (spec.kind === 'current') {
        setKey(i, turnKeyImage('▶ Now', actorKeyLines(actorAt(bridge.state, 0)), TURN_GOLD));
      } else if (spec.kind === 'next') {
        setKey(i, turnKeyImage('Next ▶', actorKeyLines(actorAt(bridge.state, 1)), TURN_PURPLE));
      } else {
        setKey(i, pickerKeyImage(spec.lines, 'item'));
      }
    }
  }

  async function onPress(slot) {
    if (mode === 'picker') {
      await picker.slotPressed(slot, slotAction(slot));
      return;
    }
    const spec = MAIN.get(slot);
    if (!spec) return;
    let ok = true;
    if (spec.kind === 'prev') bridge.send({ type: 'prevTurn' });
    else if (spec.kind === 'next') bridge.send({ type: 'nextTurn' });
    else if (spec.kind === 'current') return;
    else if (spec.op === 'dice') ok = await picker.beginDice(DEVICE);
    else if (spec.op === 'end') ok = await picker.beginEndConfirm(DEVICE);
    else if (spec.op === 'attack') ok = await picker.beginAttack(DEVICE);
    else ok = await picker.begin(spec.op, DEVICE);
    if (ok === false) flash(slot);
  }

  // ---- wiring -----------------------------------------------------------------

  profileListeners.add((profile) => {
    mode = profile ? 'picker' : 'main';
    if (mode === 'main') renderMain();
    // picker mode: the picker pushes images through slotAction.setImage
  });

  async function start() {
    const demo = window.__demo;
    if (!demo) return;
    await demo.ready();

    // Register every slot with the picker once, like keys appearing on the deck.
    for (let i = 0; i < SLOTS; i++) await picker.slotAppeared(i, slotAction(i));

    bridge.start();
    await new Promise((r) => setTimeout(r, 30));
    const sock = FakeWs.instances.at(-1);
    const push = () => sock.emit('message', JSON.stringify(demo.bridgeState()));
    push();
    demo.onState(push);
    renderMain();
    demo.onState(() => {
      if (mode === 'main') renderMain();
    });
  }

  start();
}

if (location.hash.replace('#', '') !== 'player') boot();
