# NBA Arketip Sunucularini Baslat
# Kullanim: .\start.ps1

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "FastAPI baslatiliyor (port 8000)..." -ForegroundColor Cyan
Start-Process python -ArgumentList "-m uvicorn api.main:app --port 8000 --reload" -WorkingDirectory $ROOT -WindowStyle Minimized

Start-Sleep -Seconds 3

Write-Host "Vite baslatiliyor (port 5173)..." -ForegroundColor Cyan
Start-Process npm -ArgumentList "run dev -- --port 5173" -WorkingDirectory "$ROOT\frontend" -WindowStyle Minimized

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Sunucular calistirildi!" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "   Backend:  http://localhost:8000/api" -ForegroundColor Yellow
Write-Host ""

Start-Process "http://localhost:5173"
