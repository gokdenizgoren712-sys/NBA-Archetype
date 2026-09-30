# Primary Arch — fantezi sezon içi günlük güncelleme (Windows Görev Zamanlayıcı bunu çalıştırır).
# Yeni maç loglarını çeker, projeksiyonu yeniler, yalnız o dosyayı main'e gönderir (Railway deploy eder).
# Sezon başlamadıysa hiçbir şey yapmadan çıkar. Ayrıntı: src/fantasy/update.py
param([string]$Python = "")

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
if (-not $Python) { $Python = (Get-Command python -ErrorAction Stop).Source }

$logDir = Join-Path $repo "data\logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("fantasy_update_" + (Get-Date -Format "yyyy-MM-dd") + ".log")

"--- $(Get-Date -Format s) ---" | Out-File -FilePath $log -Append -Encoding utf8
$env:PYTHONIOENCODING = "utf-8"
& $Python -m src.fantasy.update --push 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
exit $LASTEXITCODE
