Param()

$ErrorActionPreference = 'Stop'

Write-Host "Starting local static file server for Syndicate2026..."

if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "Using Python HTTP server on http://localhost:8000"
    python -m http.server 8000
    return
}

if (Get-Command python3 -ErrorAction SilentlyContinue) {
    Write-Host "Using Python3 HTTP server on http://localhost:8000"
    python3 -m http.server 8000
    return
}

Write-Host "Python is not installed or not on PATH." -ForegroundColor Yellow
Write-Host "Install Python or run a local static server using your preferred tool."
