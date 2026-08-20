import WebSocket from 'ws';
import { writeFileSync } from 'fs';
import { join } from 'path';
const [url, outDir, mode = 'full', W = '1500', H = '1000', SC = '2'] = process.argv.slice(2);
const targets = await (await fetch('http://127.0.0.1:9225/json')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.on('open', r));
let id = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (m, p) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evalJs = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Page.navigate', { url });           // navigation clears the override
await sleep(1600);
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: +SC, mobile: false });
await sleep(900);
async function shot(name, clip) {
  const r = await send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
  writeFileSync(join(outDir, name), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
}
if (mode === 'full') await shot('mockup-top.png');
else {
  const n = await evalJs(`document.querySelectorAll(${JSON.stringify(mode)}).length`);
  for (let i = 0; i < n; i++) {
    await evalJs(`document.querySelectorAll(${JSON.stringify(mode)})[${i}].scrollIntoView({block:'center'})`);
    await sleep(260);
    const r = await evalJs(`(() => { const el = document.querySelectorAll(${JSON.stringify(mode)})[${i}];
      const b = el.getBoundingClientRect();
      return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height, id: el.dataset.shot || String(${i}) }; })()`);
    await shot(`shot-${r.id}.png`, { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 });
  }
}
ws.close(); console.log('done');
