/**
 * Kill anything running out of app/release/ before electron-builder writes
 * there. A running copy holds win-unpacked's exe and app.asar open, and the
 * build dies with EBUSY halfway through — leaving a half-written folder that
 * looks like it built fine.
 *
 * Scoped to this repo's release/ folder on purpose: an installed copy under
 * AppData never locks these files, so there is nothing to gain from killing
 * it. Runs as npm's preunpack/predist hook.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const dir = path.resolve(__dirname, '..', 'release');
// A PowerShell single-quoted literal: backslash is NOT an escape there, so
// the path goes in verbatim and only ' needs doubling. JSON.stringify would
// double every separator and match nothing.
const psPath = `'${dir.replace(/'/g, "''")}\\*'`;
const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$targets = @(Get-Process | Where-Object { $_.Path -like ${psPath} })
if ($targets.Count -eq 0) { 'free: nothing running from release/'; exit 0 }
foreach ($p in $targets) { "free: killing $($p.ProcessName) ($($p.Id))" }
$targets | Stop-Process -Force
Start-Sleep -Milliseconds 600
`;

try {
  const out = execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8' },
  );
  process.stdout.write(out);
} catch (err) {
  // Never block the build on this — electron-builder's own EBUSY is a
  // clearer error than anything we could report here.
  console.warn('free-release: could not check for running processes —', err.message);
}
