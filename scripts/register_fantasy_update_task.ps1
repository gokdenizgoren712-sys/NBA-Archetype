# Günlük fantezi güncellemesini Windows Görev Zamanlayıcı'ya kaydeder (bir kez çalıştır).
#   powershell -ExecutionPolicy Bypass -File scripts\register_fantasy_update_task.ps1 -Time 07:30
# Kaldırmak için: Unregister-ScheduledTask -TaskName PrimaryArchFantasyUpdate -Confirm:$false
# Bilgisayar o saatte kapalıysa görev, açıldığında en kısa sürede çalışır (-StartWhenAvailable).
param([string]$Time = "07:30", [string]$TaskName = "PrimaryArchFantasyUpdate")

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "fantasy_daily_update.ps1"
$python = (Get-Command python -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Python `"$python`""
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Primary Arch: fantasy in-season projection update (pushes data/2026-27__fantasy_projections.parquet to main)" -Force | Out-Null
Write-Host "Kaydedildi: $TaskName her gün $Time (log: data\logs\fantasy_update_*.log)"
