// Coverage check for the UI localization.
//
// Renders every screen in English and then in German against a running app and
// reports any visible line that did not change. Whatever is left should only be
// proper nouns, numbers, and SRD monster content from the dataset - any UI
// string that shows up here is one that never got routed through t().
//
// Start the app with a debug port and a throwaway profile first:
//
//   cd app
//   npx electron . --remote-debugging-port=9222 --user-data-dir=/tmp/i18n-check
//   node scripts/check-i18n.mjs
//

async function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = (m, p) => { const i = ++id; return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
  return { ws, send, eval: async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval');
    return r.result?.result?.value;
  }};
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await fetch('http://127.0.0.1:9222/json').then((r) => r.json());
const dm = await connect(targets.find((x) => x.url.includes('#dm')).webSocketDebuggerUrl);

// ---- seed enough data that every screen has content to render
await dm.eval('window.api.importSrd()');
let s = await dm.eval('window.api.getState()');
for (const p of s.pcs) await dm.eval(`window.api.deletePc('${p.id}')`);
for (const t of s.encounterTemplates) await dm.eval(`window.api.deleteTemplate('${t.id}')`);
await dm.eval(`window.api.savePc({ name: 'Thorin', maxHp: 30, ac: 16, initMod: 1 })`);
s = await dm.eval('window.api.getState()');
const ow = s.monsters.find((m) => m.name === 'Owlbear') ?? s.monsters[0];
await dm.eval(`window.api.saveTemplate({ name: 'Waldlager', entries: [{ monsterTemplateId: '${ow.id}', quantity: 2 }] })`);

const nav = async (label) => {
  await dm.eval(`(() => { const b=[...document.querySelectorAll('.nav-btn')].find(x=>x.textContent.includes(${JSON.stringify(label)})); if(b) b.click(); })()`);
  await sleep(450);
};
const text = () => dm.eval(`document.body.innerText`);

/** Capture every screen, plus a live combat and the modals. */
async function captureAll(tag) {
  const shots = {};
  const screens = tag === 'en'
    ? { combat: 'Combat', party: 'Party', monsters: 'Monsters', spellbook: 'Spellbook', encounters: 'Encounters', settings: 'Settings' }
    : { combat: 'Kampf', party: 'Gruppe', monsters: 'Monster', spellbook: 'Zauberbuch', encounters: 'Begegnungen', settings: 'Einstellungen' };

  for (const [key, label] of Object.entries(screens)) {
    await nav(label);
    shots[key] = await text();
  }
  // monster library with a stat block open
  await nav(screens.monsters);
  await dm.eval(`(() => { const r=[...document.querySelectorAll('tbody tr')][0]; const b=r&&[...r.querySelectorAll('button')][0]; if(b) b.click(); })()`);
  await sleep(400);
  shots.monsterExpanded = await text();

  // PC edit form
  await nav(screens.party);
  await dm.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Add|Hinzuf/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(400);
  shots.pcForm = await text();
  await dm.eval(`(() => { const b=[...document.querySelectorAll('.modal button, button')].find(x=>/Cancel|Abbrechen/.test(x.textContent)); if(b) b.click(); })()`);

  // template editor
  await nav(screens.encounters);
  await dm.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/New Template|Neue Vorlage/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(400);
  shots.templateForm = await text();
  await dm.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Cancel|Abbrechen/.test(x.textContent)); if(b) b.click(); })()`);

  // combat: setup wizard then active
  await nav(screens.combat);
  await sleep(300);
  shots.combatSetup = await text();

  const st = await dm.eval('window.api.getState()');
  if (!st.combat) {
    const tpl = st.encounterTemplates[0];
    await dm.eval(`window.api.startCombatSetup('${tpl.id}', ${JSON.stringify(st.pcs.map((p) => p.id))}, 'all')`);
    await sleep(300);
    shots.combatInitiative = await text();
    await dm.eval('window.api.beginCombat()');
    await sleep(400);
    const st2 = await dm.eval('window.api.getState()');
    const mon = st2.combat.combatants.find((c) => c.type === 'monster');
    await dm.eval(`window.api.toggleCondition('${mon.id}', 'Poisoned')`);
    await sleep(400);
  }
  shots.combatActive = await text();

  // dice roller modal
  await dm.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Dice Roller|W\\u00fcrfeln/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(450);
  shots.diceRoller = await text();
  await dm.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Close|Schlie/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(300);

  // add-monster modal
  await dm.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Add Monster|Monster hinzu/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(450);
  shots.addMonster = await text();
  await dm.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Cancel|Abbrechen/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(300);

  // player view
  if (!(await dm.eval('window.api.getPlayerViewOpen()'))) {
    await dm.eval('window.api.togglePlayerView()');
    await sleep(2500);
  }
  const t2 = await fetch('http://127.0.0.1:9222/json').then((r) => r.json());
  const pvT = t2.find((x) => x.url.includes('#player'));
  if (pvT) {
    const pv = await connect(pvT.webSocketDebuggerUrl);
    await sleep(500);
    shots.playerView = await pv.eval('document.body.innerText');
    pv.ws.close();
  }
  return shots;
}

await dm.eval(`window.api.updateSettings({ language: 'en' })`);
await sleep(500);
const EN = await captureAll('en');
await dm.eval(`window.api.updateSettings({ language: 'de' })`);
await sleep(600);
const DE = await captureAll('de');

// ---- compare
const NOISE = /^[\s\d.,:/+×()–—-]*$/;              // numbers, separators
const PROPER = /^(Thorin|Owlbear|Eulenbär|Waldlager|SRD|CC-BY-4\.0|D&D|PHB Style \(Default\)|Default Electron|Dark|Light|English|Deutsch|Aboleth|WebSocket|Stream Deck|OBS|w\d|d\d+)/i;
const lines = (t) => (t ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

const suspects = new Map();
for (const key of Object.keys(EN)) {
  const en = lines(EN[key]);
  const de = new Set(lines(DE[key] ?? ''));
  for (const l of en) {
    if (NOISE.test(l) || PROPER.test(l)) continue;
    if (!/[A-Za-z]{3,}/.test(l)) continue;
    if (de.has(l)) {
      if (!suspects.has(l)) suspects.set(l, new Set());
      suspects.get(l).add(key);
    }
  }
}
console.log(`screens compared: ${Object.keys(EN).length}\n`);
console.log(`UNCHANGED BETWEEN EN AND DE (${suspects.size}):\n`);
for (const [line, where] of [...suspects].sort()) {
  console.log(`  ${JSON.stringify(line).padEnd(72)} ${[...where].join(',')}`);
}
writeFileSync(process.argv[2] ?? 'lang-diff.json', JSON.stringify({ EN, DE }, null, 1));
dm.ws.close();
