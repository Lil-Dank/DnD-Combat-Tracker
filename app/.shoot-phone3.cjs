const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const OUT = 'G:/Claude/DnD Combat Tracker/docs/images';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 390, height: 800, show: false,
      webPreferences: { partition: `phone-shot-${Date.now()}`, backgroundThrottling: false } });
    await win.loadURL('http://127.0.0.1:57325');
    await win.webContents.insertCSS('*{scrollbar-width:none} ::-webkit-scrollbar{display:none}');
    const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
    win.webContents.debugger.attach('1.3');
    const cdpShot = async (name) => {
      const { data } = await win.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
      console.log('wrote', name);
    };
    await sleep(1800);
    await cdpShot('phone-claim');
    await js(`
      const byText = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t));
      byText('Aria').click();
      await new Promise((r) => setTimeout(r, 400));
      const input = document.querySelector('.claim-join input');
      if (input) {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(input, 'Alex');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 200));
      byText('Join as').click();
    `);
    await sleep(1000);
    await cdpShot('phone-home');
    await js(`
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith('Attack')).click();
      await new Promise((r) => setTimeout(r, 500));
      [...document.querySelectorAll('.attack-list button')].find((b) => b.textContent.includes('Rapier')).click();
      await new Promise((r) => setTimeout(r, 500));
      [...document.querySelectorAll('.target')].find((b) => b.textContent.includes('Bugbear')).click();
      await new Promise((r) => setTimeout(r, 400));
      [...document.querySelectorAll('.adv-toggle button')].find(b => b.textContent === 'Advantage').click();
    `);
    await sleep(600);
    await cdpShot('phone-attack');
    await js(`
      const byText = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t));
      const back = byText('Back'); if (back) back.click();
      await new Promise((r) => setTimeout(r, 300));
      const rel = byText('Switch character'); if (rel) rel.click();
    `);
    await sleep(400);
  } catch (e) { console.error('failed:', e.message); }
  app.quit();
});
