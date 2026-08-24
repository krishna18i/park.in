
# Keeps the Park.in API up all day: restarts uvicorn automatically if it ever exits.
# Start it by right-click > "Run with PowerShell", or:  powershell -ExecutionPolicy Bypass -File run-backend.ps1
# Stop it by closing this window.

$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root '.venv\Scripts\python.exe'
$log    = Join-Path $root 'backend\server.log'

Set-Location (Join-Path $root 'backend')
$Host.UI.RawUI.WindowTitle = 'Park.in API - http://localhost:8000'

function Write-Log($msg) {
    Write-Host $msg
    Add-Content -Path $log -Value "$msg" -Encoding utf8
}

while ($true) {
    Write-Log "=== starting uvicorn $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
    & $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 2>&1 | ForEach-Object { Write-Log $_ }
    Write-Log "=== server exited $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - restarting in 3s ==="
    Start-Sleep -Seconds 3
}
