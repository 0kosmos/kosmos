# Creates the signing key for Kosmos updates (run once).
# Asks for a password with a * for every letter you type, then creates:
#   %USERPROFILE%\.tauri\kosmos.key      private key: keep it secret, back it up
#   %USERPROFILE%\.tauri\kosmos.key.pub  public key: goes into the app
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File scripts\make-update-key.ps1

$keyPath = Join-Path $env:USERPROFILE ".tauri\kosmos.key"
if (Test-Path $keyPath) {
    Write-Host "A key already exists at $keyPath - not touching it." -ForegroundColor Yellow
    exit 1
}

function Read-Password($prompt) {
    $secure = Read-Host $prompt -AsSecureString   # shows * while you type
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

while ($true) {
    $p1 = Read-Password "Choose a password for the update key"
    if ($p1.Length -lt 8) { Write-Host "Use at least 8 characters." -ForegroundColor Yellow; continue }
    $p2 = Read-Password "Type the same password again"
    if ($p1 -eq $p2) { break }
    Write-Host "The two passwords don't match, try again." -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force (Split-Path $keyPath) | Out-Null
npx tauri signer generate -w $keyPath -p $p1 --ci
$p1 = $null; $p2 = $null

if (Test-Path "$keyPath.pub") {
    Write-Host ""
    Write-Host "Done! Key created in $(Split-Path $keyPath)" -ForegroundColor Green
    Write-Host "Back up kosmos.key and your password (e.g. in a password manager)." -ForegroundColor Green
} else {
    Write-Host "Something went wrong: no key was created." -ForegroundColor Red
}
