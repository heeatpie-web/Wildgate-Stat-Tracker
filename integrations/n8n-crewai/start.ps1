param(
  [switch]$Build = $true
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Edit .env and set OPENAI_API_KEY before starting."
  exit 1
}

if ($Build) {
  docker compose up -d --build
} else {
  docker compose up -d
}

Write-Host "n8n: http://localhost:5678"
Write-Host "CrewAI health: http://localhost:8000/health"
