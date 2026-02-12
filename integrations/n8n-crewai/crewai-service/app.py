import json
import os
import re
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from crewai import Agent, Crew, LLM, Process, Task

app = FastAPI(title="n8n-crewai-service", version="1.0.0")


ROLE_CATALOG: dict[str, dict[str, str]] = {
    "project_manager": {
        "title": "Project Manager",
        "goal": "Break down vague requests into executable, prioritized work with clear owners.",
        "backstory": "You are a pragmatic PM who turns plain-language asks into actionable plans.",
    },
    "ui_designer": {
        "title": "UI Designer",
        "goal": "Convert product goals into concrete UX/UI specs and implementation-ready guidance.",
        "backstory": "You are a product-minded designer focused on usable, testable interfaces.",
    },
    "engineer": {
        "title": "Software Engineer",
        "goal": "Produce implementation details, edge cases, and technical rollout steps.",
        "backstory": "You are a senior engineer who keeps solutions shippable and maintainable.",
    },
    "qa": {
        "title": "QA Analyst",
        "goal": "Identify risks, failure modes, and acceptance criteria before release.",
        "backstory": "You are a QA specialist with a bias for reproducible validation.",
    },
    "test_engineer": {
        "title": "Test Engineer",
        "goal": "Design automated test strategies and practical test cases for CI.",
        "backstory": "You write stable tests that catch regressions without slowing teams down.",
    },
    "git_manager": {
        "title": "Git Manager",
        "goal": "Define branch strategy, PR scope, and merge sequencing for parallel work.",
        "backstory": "You are a release engineer who prevents integration chaos.",
    },
}


class DigestRequest(BaseModel):
    task: str = Field(..., min_length=5)
    context: str | None = None


class ExecuteRoleRequest(BaseModel):
    task: str = Field(..., min_length=5)
    role: str
    plan_summary: str | None = None
    context: str | None = None


class RunRequest(BaseModel):
    task: str = Field(..., min_length=5)
    context: str | None = None


def _llm() -> LLM:
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")
    return LLM(model=model, api_key=api_key, temperature=0.2)


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise HTTPException(status_code=500, detail="Agent did not return JSON")
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail=f"Invalid JSON from agent: {exc}") from exc


def _digest_task(task_text: str, context: str | None = None) -> dict[str, Any]:
    pm = Agent(
        role=ROLE_CATALOG["project_manager"]["title"],
        goal=ROLE_CATALOG["project_manager"]["goal"],
        backstory=ROLE_CATALOG["project_manager"]["backstory"],
        llm=_llm(),
        verbose=False,
        allow_delegation=False,
    )

    prompt = f"""
You are the triage and planning agent for a software team.
Return valid JSON only with this schema:
{{
  "summary": "string",
  "objectives": ["string"],
  "workstreams": [
    {{
      "role": "project_manager|ui_designer|engineer|qa|test_engineer|git_manager",
      "task": "string",
      "deliverable": "string",
      "dependencies": ["string"]
    }}
  ],
  "questions": ["string"]
}}

User task:
{task_text}

Project context:
{context or "none provided"}
"""

    planning_task = Task(
        description=prompt,
        expected_output="Strict JSON only.",
        agent=pm,
    )

    crew = Crew(agents=[pm], tasks=[planning_task], process=Process.sequential, verbose=False)
    result = crew.kickoff()
    payload = _extract_json(str(result))

    if "workstreams" not in payload or not isinstance(payload["workstreams"], list):
        raise HTTPException(status_code=500, detail="Missing workstreams in planning output")

    return payload


def _run_role(role: str, task_text: str, plan_summary: str | None, context: str | None) -> str:
    if role not in ROLE_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unknown role: {role}")

    cfg = ROLE_CATALOG[role]
    specialist = Agent(
        role=cfg["title"],
        goal=cfg["goal"],
        backstory=cfg["backstory"],
        llm=_llm(),
        verbose=False,
        allow_delegation=False,
    )

    specialist_prompt = f"""
You are acting as: {cfg['title']}.
Provide practical output in markdown with these sections:
- Summary
- Proposed Actions
- Risks/Unknowns
- Questions for User

Original task:
{task_text}

PM plan summary:
{plan_summary or "none"}

Project context:
{context or "none provided"}
"""

    role_task = Task(
        description=specialist_prompt,
        expected_output="Markdown with the requested sections.",
        agent=specialist,
    )

    crew = Crew(agents=[specialist], tasks=[role_task], process=Process.sequential, verbose=False)
    return str(crew.kickoff())


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/digest")
def digest(req: DigestRequest) -> dict[str, Any]:
    plan = _digest_task(req.task, req.context)
    return {"plan": plan}


@app.post("/execute-role")
def execute_role(req: ExecuteRoleRequest) -> dict[str, Any]:
    output = _run_role(req.role, req.task, req.plan_summary, req.context)
    return {"role": req.role, "output": output}


@app.post("/run")
def run(req: RunRequest) -> dict[str, Any]:
    plan = _digest_task(req.task, req.context)
    summary = plan.get("summary", "")

    outputs: list[dict[str, str]] = []
    for stream in plan.get("workstreams", []):
        role = stream.get("role")
        stream_task = stream.get("task", req.task)
        if role not in ROLE_CATALOG:
            continue
        role_output = _run_role(role, stream_task, summary, req.context)
        outputs.append({"role": role, "output": role_output})

    return {"plan": plan, "outputs": outputs}
