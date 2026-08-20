/**
 * Make app/release/ writable before electron-builder rebuilds into it.
 *
 * Two things hold it open. A running copy of the app is the obvious one — it
 * pins its own exe and app.asar. The subtler one is Windows itself: after the
 * exe is signed, Defender keeps a handle open while it scans ~200 MB, and
 * killing processes does nothing for that. Either way electron-builder dies
 * mid-build with EBUSY/EPERM on unlink, leaving a half-written folder that
 * looks like it built fine.
 *
 * So: kill anything running out of release/, then wait for the exe to actually
 * become openable rather than sleeping a fixed amount and hoping. Runs as
 * npm's preunpack/predist hook.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const dir = path.resolve(__dirname, '..', 'release');
// PowerShell single-quoted literals: backslash is not an escape there, so the
// path goes in verbatim and only ' needs doubling. JSON.stringify would double
// every separator and match nothing.
const q = (p) => `'${p.replace(/'/g, "''")}'`;
const TIMEOUT_S = 90;
/** Process name of the built app — electron-builder names the exe after it. */
const PRODUCT_NAME = 'Deck of Many Turns';

const ps = `
$ErrorActionPreference = 'SilentlyContinue'
# Match on path first. But an orphaned Electron child reports an empty Path —
# PowerShell cannot read the image of a process it did not start — and that one
# still pins the exe, so fall back to the product name. The user's rule is to
# kill any running copy before building, so a name match is intended here.
$byPath = @(Get-Process | Where-Object { $_.Path -like ${q(path.join(dir, '*'))} })
$byName = @(Get-Process -Name ${q(PRODUCT_NAME)})
$targets = @($byPath + $byName | Sort-Object Id -Unique)
foreach ($p in $targets) { "free: killing $($p.ProcessName) ($($p.Id))" }
if ($targets.Count -gt 0) {
  $targets | Stop-Process -Force
  foreach ($p in $targets) { try { $p.WaitForExit(5000) | Out-Null } catch {} }
}

# Whether or not we killed anything, the exe may still be held — most often by
# Defender finishing its scan of the last build's output.
$exe = ${q(path.join(dir, 'win-unpacked', 'Deck of Many Turns.exe'))}
if (-not (Test-Path $exe)) { 'free: no previous build to unlock'; exit 0 }
$deadline = (Get-Date).AddSeconds(${TIMEOUT_S})
$waited = $false
while ((Get-Date) -lt $deadline) {
  try {
    [IO.File]::Open($exe, 'Open', 'ReadWrite', 'None').Close()
    if ($waited) { 'free: handle released' } else { 'free: release/ is writable' }
    exit 0
  } catch {
    if (-not $waited) { 'free: exe is locked, waiting for the handle to drop...' }
    $waited = $true
    Start-Sleep -Milliseconds 500
  }
}
"free: STILL LOCKED after ${TIMEOUT_S}s - the build will probably fail"
exit 0
`;

try {
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8',
    timeout: (TIMEOUT_S + 30) * 1000,
  });
  process.stdout.write(out);
} catch (err) {
  // Never block the build on this — electron-builder's own EBUSY is a clearer
  // error than anything we could report here.
  console.warn('free-release: could not check for running processes —', err.message);
}
