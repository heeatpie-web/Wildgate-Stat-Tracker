# n8n + CrewAI Integration (for Wildgate app)

This package gives you a working multi-role AI team orchestrated by n8n.

## What this includes

- `crewai-service/`: FastAPI service exposing CrewAI endpoints.
- `docker-compose.yml`: Runs `n8n` and `crewai-service` together.
- `n8n-workflows/crewai-team-orchestrator.json`: Importable workflow.
- `.env.example`: Required environment variables.

## Team roles configured

- `project_manager`
- `ui_designer`
- `engineer`
- `qa`
- `test_engineer`
- `git_manager`

## Prerequisites

- Docker Desktop installed and running
- OpenAI API key

## Setup

1. Open a terminal in `integrations/n8n-crewai`.
2. Create your env file:

```powershell
Copy-Item .env.example .env
```

3. Edit `.env` and set:
- `OPENAI_API_KEY`
- `N8N_ENCRYPTION_KEY` (long random string)
- `N8N_BASIC_AUTH_PASSWORD`

4. Start services:

```powershell
docker compose up -d --build
```

Or use the helper script:

```powershell
.\start.ps1
```

5. Open n8n:
- URL: `http://localhost:5678`
- Login with your `.env` basic auth credentials.

## Import the workflow

1. In n8n, click **Import from File**.
2. Select `n8n-workflows/crewai-team-orchestrator.json`.
3. Save and activate the workflow.

The webhook path is:
- `POST http://localhost:5678/webhook/crew-team`

## Test request

```powershell
$payload = @{
  task = "Add OCR confidence score to match history table and create tests."
  context = "Electron + React + TypeScript app."
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:5678/webhook/crew-team" -ContentType "application/json" -Body $payload
```

Expected response shape:
- `plan`: decomposed work plan
- `outputs`: one output per role

## Direct CrewAI service endpoints

- `GET http://localhost:8000/health`
- `POST http://localhost:8000/digest`
- `POST http://localhost:8000/execute-role`
- `POST http://localhost:8000/run`

## Troubleshooting

- If n8n cannot reach CrewAI service, ensure URL is `http://crewai-service:8000` inside the workflow.
- If model calls fail, verify `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`.
- If webhook returns 401, check n8n basic auth user/password in `.env`.

## Stop everything

```powershell
docker compose down
```

Or:

```powershell
.\stop.ps1
```
