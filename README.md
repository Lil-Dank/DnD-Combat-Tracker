# D&D Combat Tracker

A Windows desktop app for Dungeon Masters to run D&D combat, with a second-monitor
**Player View** and an **Elgato Stream Deck** plugin for hardware turn/HP/condition
control. Everything runs on one machine — no network, no cloud, no accounts.

```
┌─────────────┐   IPC    ┌──────────────┐
│  DM Window  │◄────────►│ Electron main│──── JSON files (%APPDATA%)
└─────────────┘          │   process    │
┌─────────────┐   IPC    │  (canonical  │   WebSocket 127.0.0.1:57321
│ Player View │◄────────►│    state)    │◄─────────────┐
└─────────────┘          └──────────────┘              │
                                              ┌────────┴────────┐
                                              │ Stream Deck app │
                                              │  + our plugin   │
                                              └─────────────────┘
```

## Repository layout

| Path | What it is |
| --- | --- |
| `release/` | **Shippable artifacts: the NSIS installer + the `.streamDeckPlugin`** |
| `app/` | Electron + TypeScript + React app (DM Window + Player View) |
| `plugin/` | Stream Deck plugin (Elgato SDK v2, TypeScript) |
| `app/release/` | electron-builder output (after `npm run dist`) |
| `plugin/dist/` | streamdeck pack output (after `npm run pack`) |

After rebuilding either artifact, copy it into the top-level `release/` folder
to refresh the shippable set.

## Prerequisites

- **Windows 10/11**
- **Node.js 24+** (dev/build only — end users just run the installer)
- **Stream Deck app 7.1+** (tested on 7.4) for the plugin
- Optional for plugin dev: `@elgato/cli` (`npx streamdeck …` is used via devDependency)

## Install (end user)

1. Run the app installer: `release/DnD Combat Tracker Setup 1.0.0.exe`.
2. Double-click `release/com.dmtools.dnd-combat-tracker.streamDeckPlugin` —
   the Stream Deck app installs it.
3. Start the D&D Combat Tracker app. The plugin connects automatically within a
   few seconds (the DM window's sidebar shows "● Stream Deck connected").

### Pairing details (bridge)

- The app hosts a WebSocket server on `127.0.0.1:57321` (fixed default, hard-coded
  in both sides). Nothing to configure normally.
- Port conflict? Change the port in the app under **Settings → Stream Deck
  bridge**, then set the same port in any of the plugin's actions (click the key
  in the Stream Deck app → its inspector has "Tracker app bridge port").
- The plugin retries the connection every 3 s forever; app and plugin can start
  in any order.

## Build from source

```bash
# App
cd app
npm install
npm run dev        # live-reload dev session
npm run build      # compile main/preload/renderer to out/
npm run dist       # → release/DnD Combat Tracker Setup 1.0.0.exe (NSIS)

# Stream Deck plugin
cd plugin
npm install
npm run build      # icons + profiles + bundled bin/plugin.js
npm run pack       # → dist/com.dmtools.dnd-combat-tracker.streamDeckPlugin

# Plugin dev loop
npx streamdeck dev                                        # once: enable dev mode
npx streamdeck link com.dmtools.dnd-combat-tracker.sdPlugin  # once: link into SD app
npm run watch                                             # rebuild on change
npx streamdeck restart com.dmtools.dnd-combat-tracker     # reload after changes
```

Tests: `plugin/scripts/test-picker.mjs` (state-machine harness, `node scripts/test-picker.mjs`).

## Using the app

**Themes:** Settings → Appearance offers four presets for the DM window —
**PHB Style (Default)** (parchment + dark-red headings, styled after official
5e books / Homebrewery), **Default Electron** (the original dark-purple look),
**Dark**, and **Light**. Preset-only by design; the Player View keeps its own
styling and background-color setting.

1. **Party** — add your PCs (name, max HP, AC, initiative modifier). Persists.
2. **Monsters** — click **Import SRD Monsters** for 331 SRD 5.2.1 monsters with
   ability scores and attacks, or add your own (the six ability scores are
   optional — modifiers derive automatically; attacks optional too; each
   attack has an editable details text shown in the previews, `**bold**`
   supported). The quick reference (library expander and combat panel) opens
   with a STR/DEX/CON/INT/WIS/CHA table showing score + modifier.
3. **Encounters** — build reusable templates: monsters + quantities
   (e.g. 4× Goblin Warrior, 1× Bugbear Warrior). Create / edit / duplicate /
   delete, or hit **⚔ Start Combat** on a card to jump straight into the combat
   wizard with that template preselected.
4. **Combat** — pick a template, tick the PCs joining, choose **Roll for all** or
   **Roll for monsters only** (you type the players' rolls). Order sorts by
   initiative (ties by modifier); drag rows to settle remaining ties. **Begin
   Combat** starts round 1.
   - Damage/heal from each row (type amount, Enter = damage, Shift+Enter = heal).
     Heal caps at max HP; damage floors at 0.
   - At 0 HP monsters are removed from the order (and Player View / Stream Deck);
     PCs stay, marked **downed** (healing revives them).
   - The current-turn monster's card shows a **🎲 Attack** button running the
     same workflow as the Stream Deck's Monster Attack: pick the attack →
     pick target(s) (multi for save-based AoE) → roll attack vs the target's
     AC (HIT/MISS, CRIT/NAT 1) and/or damage → for save actions choose who
     succeeded (they take half, rounded down) → apply.
   - **Conditions** toggles the SRD conditions (+ exhaustion) on any combatant;
     badges show on DM and Player views. **Attacks** (or simply clicking a
     monster's row) shows its full action list — attack rolls plus Multiattack /
     breath / save-based ability text (DM-only quick reference — never on the
     Player View).
   - **+ Add Monster** drops additional monsters from the library into the
     running combat: initiative is auto-rolled, they slot into the order at
     their roll, and instance numbering continues (Goblin Warrior 4, 5, …).
5. **Player View** — sidebar button opens the display-only window; drag it to the
   players' monitor and use the **Fullscreen** toggle. It remembers its position
   across restarts (falls back to the primary display if the monitor is gone).
   The layout measures the space it actually has and picks the column count
   that yields the largest readable card, then scales the text to fit —
   a narrow window stays in one column, a wide one spreads into several, and
   the result is verified by measurement so wrapped names or condition badges
   can't push content off-screen. Past ~25 cards it stops shrinking (floor
   ~13px) and the remainder scrolls. Long names wrap rather than colliding
   with the HP block on the right.
   PC cards show `current/max` HP; monster cards hide numbers and turn
   progressively redder once below 50% HP ("bloodied"); the active combatant is
   highlighted. Same-named monsters that are adjacent in the initiative order
   collapse into one card with a ×N count (a PC or other monster in between
   splits the group, keeping the displayed turn order truthful) —
   the bloodied tint scales with the group's average state and shows
   "Bloodied ×k", and conditions aggregate across the group ("Poisoned ×2").
   Background color is configurable under **Settings**. Outside combat the
   window is just the solid background color — set it to green and it doubles
   as a chroma-key surface for OBS.
   The whole view is styled for that use: every element drawn onto the
   background is fully opaque (no translucent cards, no `opacity` fades, no
   blurred glows), so the keyer can't bleed through or fringe them, and the
   palette avoids green *and* blue entirely — white / bone / amber / red on
   near-black — so the same layout keys cleanly on either a green or a blue
   screen. That's why PC HP is white (amber below half, red when downed)
   rather than the usual green.

## Stream Deck plugin

Actions (drag onto any keys on your main profile):

- **Next Turn / Previous Turn** — advance/rewind the turn. Each key names the
  actor it would move to (`Next ▶ / #2 / Goblin`), wrapping around the ends of
  the initiative order, so you can see who's coming up before pressing.
- **Current Turn** — display-only: names whoever is acting right now
  (`▶ Now / #1 / Goblin`). Pressing it does nothing.

  These three keys draw themselves as images rather than using plain titles,
  so the name is rendered at the largest size that still fits inside a margin
  (shrinking only as the name needs more lines) with a heavy outline for
  readability at a glance.
- **Damage / Heal** — the deck switches to a multi-actor select (toggle any
  combatants — current-turn ▶ and downed 💀 markers, paginated if needed) →
  **✓ Next** opens the numpad (digits, `C` clear, `✓ Enter`) → Enter applies
  the amount to **every selected actor** and returns to the profile you
  started from. The numpad's Back key returns to actor-select with the
  selection kept; Cancel keys return straight to your profile. Next/Done/
  Apply always sits at the **bottom-right** corner (like Enter and Roll);
  the **▶ More** paging key sits top-right when a list overflows.
- **Condition** — multi-actor select (toggle any combatants, **✓ Next**) →
  condition grid applying to the whole selection: ✓ = all selected have it,
  `~` = only some. Pressing a condition toggles it uniformly — on for
  everyone if anyone lacks it, off for everyone once all have it. **✓ Done**
  (bottom-right) returns to the profile you started from; **← Back**
  (top-left) returns to actor select with the selection kept.
- **Monster Attack** — lists the current-turn monster's rollable actions
  (attack rolls, plus save actions that deal damage — DC shown). Pick one,
  then pick the **target**: attack rolls take a single target; save-based
  actions (breath weapons etc.) are treated as AoE — toggle several targets
  and press **✓ Done**. The roll screen shows the target's name and **AC**
  (or the target count for AoE) and offers **🎲 Attack** (d20 + to-hit;
  compares against the target's AC and shows **✔ HIT / ✘ MISS**, nat 20
  always hits with CRIT!, nat 1 always misses) and/or **🎲 Damage** (rolls the
  actual dice — `2d8+2`, `12d8`, multi-part damage summed with a breakdown;
  flat-damage attacks use their fixed value; conditional damage like "if the
  attack roll had Advantage" is rolled but shown separately). A rolled damage
  total is **applied to the target(s) HP automatically after a 5 s countdown**,
  then the deck returns to the profile the Monster Attack key was pressed on.
  Pressing Back during the countdown cancels the pending apply (re-roll
  safely). For AoE the full rolled amount goes to every picked target —
  handle save-for-half by picking only the targets that failed, or adjust in
  the app.
- **Dice Roller** — custom rolls without the SRD data: enter the number of
  dice on a numpad → pick the die (d4/d6/d8/d10/d12/d20/d100) → enter a
  modifier (± key for negative) → **"more dice?"** asks whether to add extra
  dice of a different kind (Yes loops back through amount → die and asks
  again, so pools like `2d8+1 +1d4 +2d6` build up; No proceeds). The summary
  screen shows the full pool with **🎲 Roll** (re-roll as often as you like),
  a **＋ Dice** key to add more parts if the input needs redoing, plus
  **⚔ Damage** and **✚ Heal** keys. Pressing one opens a multi-actor select —
  toggle any combatants, then **Apply** sends the rolled total to all of them
  and returns to your profile. Rolling works even without the app connected;
  applying needs it. The same roller lives in the DM window's sidebar
  (🎲 Dice Roller): add/remove extra dice rows, roll the pool (per-part
  breakdown shown), pick combatants, Damage/Heal.
- **End Combat** — shows an on-deck confirm screen (✕ Cancel / ✓ End Combat,
  with the current round displayed); confirming ends the combat in the app and
  returns to your profile.

Picker keys are drawn by the plugin, so every key's text is auto-sized to the
largest that fits inside a margin and carries a heavy outline. The background
colour tells you what a key is: **purple** = a pressable choice, **green** =
confirms (Next / Done / Apply / Enter / Roll), **red** = cancels, **slate** =
Back or Clear, **blue** = paging, **bright green** = something you've picked,
**flat dark with a dashed border** = a read-out that does nothing, and
**near-black** = an unused key.

Every picker screen has exactly one **✕ Cancel** key, always at the
**bottom-left** of the grid, that exits straight back to the profile you
started from. The top-left key is **← Back** (one step) on screens that have a
previous step; on the first screen of a flow there's nothing to go back to, so
that key carries the first list entry instead. On the modifier numpad,
pressing the value display flips the modifier's sign (±).

Pressing any plugin key also switches the DM window to its **Combat** screen,
so the app follows what you're doing on the deck. Picker screens also time out after
**90 s without any key press** (150 s on the Dice Roller and Monster Attack
screens) and return to your profile on their own.

Rolling damage for a **saving-throw action** inserts a "who saved?" step
before the 5 s apply countdown: toggle the targets that succeeded (marked
✓½), press Apply, and they take **half damage (rounded down)** while everyone
else takes full.

Implementation note: Stream Deck profiles are static bundles, so the plugin
ships **one generic "DnD Combat Picker" profile per device type** (XL 8×4 and
classic/MK.2 5×3) made of blank slot keys; the plugin relabels them at runtime
for the three logical screens (actor select / numpad / conditions). The grid is
read from the connected device, and lists longer than one screen get a
**▶ More** paging key. Actor labels refresh live as HP changes or monsters die.

### Attack data model

Monster actions follow a schema derived from the SRD 5.2.1 attack grammar
(423 attack-roll entries): a discriminated `type` (`attack` / `save` / `other`),
a parsed layer (kind, to-hit, reach/range, per-instance damage dice with
average + type + optional condition, save ability/DC, riders) and an
always-populated `display` layer whose `text` keeps the raw SRD sentence as a
safety net. The importer reconciles Open5e's structured rows against the SRD
sentence text (which is authoritative) — second damage instances and row-less
attacks (e.g. the roper's grapple-only Tentacle) come from the text parse.
Older libraries are migrated to the new schema automatically on app start.

## Monster data source & license

Monster data is compiled at build time (`app/scripts/build-srd.mjs`) from the
[Open5e API dataset](https://github.com/open5e/open5e-api)
(`data/v2/wizards-of-the-coast/srd-2024`: `Creature.json`, `CreatureAction.json`,
`CreatureActionAttack.json`) into `app/resources/srd/monsters.json`, which is
bundled with the installer. Per monster: name, max HP, AC, initiative modifier
(the stat block's initiative bonus, else derived from DEX as
`floor((DEX − 10) / 2)`), and all actions: weapon/spell attacks arrive fully
structured (name, to-hit, reach/range, damage dice + type), while Multiattack,
breath weapons, and other save-based abilities are kept as reference entries
with best-effort damage parsing and the raw action text (hover an attack row
for the full text). Unparseable attack data is skipped without failing the
monster.

> **Attribution:** This work includes material from the **System Reference
> Document 5.2.1** ("SRD 5.2.1") by Wizards of the Coast LLC, available at
> https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
> Commons Attribution 4.0 International License (CC-BY-4.0).

The same attribution is shown in-app under **Settings → About / Credits**.

## Decisions & notes (v1)

- **Previous Turn at round 1, first actor** does nothing (can't go before combat).
- **Killing the current monster** passes the turn to the next actor; if it was
  last in the order, the round counter advances as the pointer wraps.
- **Re-importing the SRD** updates existing SRD entries by name (no duplicates);
  your manual monsters are untouched. Deleting a monster removes it from any
  encounter templates that referenced it.
- **In-progress combat persists** across app restarts (bonus feature): the live
  combat is saved to disk on every change and restored on launch.
- **Data location:** `%APPDATA%/dnd-combat-tracker/data/*.json` — one JSON file
  per store (PCs, monsters, templates, settings, active combat), loaded into
  id-indexed maps in the main process and written back atomically
  (temp file + rename) on every change.
- **Exhaustion** is a simple on/off condition in v1 (no levels). No temp HP in v1.
- **Deck sizes:** the picker's runtime layout is grid-agnostic — slots map from
  key coordinates against the grid of the profile in use, and capacity/paging/
  numpad layouts adapt (numpad supports 5×3 up to any wider grid). Profiles
  ship for the 15-key 5×3 (MK.2/classic) and 8×4 XL; a larger device gets the
  biggest profile that fits. Stream Deck profiles are device-model-bound, so a
  future model (e.g. a 9×4 deck) needs one entry in
  `plugin/scripts/build-profiles.mjs`, the manifest `Profiles` list, and the
  `PROFILES` table in `plugin/src/picker.ts` — the rest adapts automatically.
  Devices smaller than 5×3 get an alert for picker flows (Next/Prev still
  work). The "Picker Slot" action appears in the Stream Deck actions list (a
  Stream Deck app requirement for profile keys) but never needs to be placed
  manually.
- **Stream Deck sleep:** if the deck's display is asleep, the first
  profile-switch can be delayed until the deck wakes; press any key first if
  your deck sleeps aggressively.
