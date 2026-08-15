// Generates the bundled .streamDeckProfile files: a grid of generic "slot"
// keys the plugin relabels at runtime (actor select / numpad / conditions).
//
// Uses the Stream Deck app's ProfilesV3 format (verified against app 7.4):
// a zip containing "<GUID>.sdProfile/manifest.json" (umbrella: Device, Pages)
// plus "Profiles/<pageGuid>/manifest.json" holding the page's key actions.
import AdmZip from 'adm-zip';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'com.dmtools.dnd-combat-tracker.sdPlugin');
const PLUGIN_UUID = 'com.dmtools.dnd-combat-tracker';

// Mirrors the schema of stock working profiles (e.g. BarRaider WinTools):
// V2 manifest, Settings null — the plugin identifies keys by coordinates.
function slotAction() {
  return {
    Name: 'Picker Slot',
    Settings: null,
    State: 0,
    States: [
      {
        FFamily: '',
        FSize: '11',
        FStyle: '',
        FUnderline: 'off',
        Image: '',
        Title: '',
        TitleAlignment: 'middle',
        TitleColor: '#ffffff',
        TitleShow: '',
      },
    ],
    UUID: `${PLUGIN_UUID}.slot`,
  };
}

/** Deterministic GUID-ish strings so rebuilds are stable. */
function guidFor(seed) {
  const hex = [...seed]
    .map((c, i) => ((c.charCodeAt(0) * 31 + i * 17) % 256).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(32, 'a')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildProfile({ name, deviceModel, cols, rows }) {
  const folderGuid = guidFor(`${name}-profile`).toUpperCase();

  const actions = {};
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      actions[`${col},${row}`] = slotAction();
    }
  }

  const manifest = {
    Actions: actions,
    DeviceModel: deviceModel,
    InstalledByPluginUUID: PLUGIN_UUID,
    Name: name,
    PreconfiguredName: `profiles/${name}`,
    Version: '1.0',
  };

  const zip = new AdmZip();
  const base = `${folderGuid}.sdProfile`;
  zip.addFile(`${base}/manifest.json`, Buffer.from(JSON.stringify(manifest)));
  const out = join(root, 'profiles', `${name}.streamDeckProfile`);
  mkdirSync(dirname(out), { recursive: true });
  zip.writeZip(out);
  console.log(`Wrote profiles/${name}.streamDeckProfile (${cols}x${rows}, ${deviceModel})`);
}

// Stream Deck XL (8x4)
buildProfile({ name: 'DnD Combat Picker XL', deviceModel: '20GAT9901', cols: 8, rows: 4 });

// Classic 15-key Stream Deck / MK.2 (5x3)
buildProfile({ name: 'DnD Combat Picker', deviceModel: '20GBA9901', cols: 5, rows: 3 });
