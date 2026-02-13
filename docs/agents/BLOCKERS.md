# Blockers

## Active Blockers

*Only items that actually block the RC are listed here. Resolved items appear only under "Resolved Blockers (with closing date)" below.*

## Resolved Blockers (with closing date)

*One-sentence resolution note + closing date so downstream roles know whether anything still needs attention.*

- **RM-BLK-005 — Step 19 audit hold** (release-manager, opened 2026-02-13). Closed 2026-02-13: RM confirmed Step 19a/19b/19c evidence in 03_VALIDATION, attested foundation secure, recorded signoff in 03_VALIDATION and 04_HANDOFF; audit hold lifted. New builds and QA may proceed; roles may resume next tasks.
- **SmartCapturesPanel build failure** (builder, opened 2026-02-12). Closed 2026-02-12: Builder fixed undefined `toolsOpen`/`setToolsOpen`; debugger re-ran build + test PASS.
- **RC release gate — missing UI + security evidence** (release-manager, opened 2026-02-13T13:30Z). Closed 2026-02-13T13:35Z: Evidence was present (snap:views 01:00Z, security 109/109 01:15Z, plan reconciliation 02:00Z); RM closed as GO.
- **RC checklist — npm test evidence missing** (release-manager, opened 2026-02-12T23:52Z). Closed 2026-02-13T13:24Z: Release-manager ran `npm test` and recorded PASS in 03_VALIDATION.
- **Gate C — UI screenshot proof for Lane B missing** (release-manager, opened 2026-02-12T23:52Z). Closed 2026-02-13T01:00Z: `npm run snap:views` — 0% mismatch, 5/5 views; evidence in 03_VALIDATION.
- **Gate A — security negative-test evidence missing** (release-manager, opened 2026-02-12T23:52Z). Closed 2026-02-13T01:15Z: Security suite 109/109 PASS; evidence in 03_VALIDATION and `dataset/ocr-corpus/reports/security-gate-a.json`.
- **01_PLAN step 5/6 status ambiguity** (release-manager, opened 2026-02-12T23:52Z). Closed 2026-02-13T01:00Z: Steps 1–5 marked COMPLETE, Step 6 IN_PROGRESS in 01_PLAN.
- **Corpus drift Bug 3 baseline** (builder, URGENT, opened 2026-02-12T19:54Z). Closed 2026-02-12T23:30Z: PM selected 15-sample baseline; builder/debugger authorized to resume.
- **ui-designer role not bound** (project-manager, opened 2026-02-12T19:50Z). Closed 2026-02-12T21:10Z: ui-designer bound to active tab; Lane B locks claimed.
- **Ground truth corpus too small** (debugger, opened 2026-02-12T20:00Z). Closed 2026-02-12T21:00Z: Corpus populated with 15 samples; baseline established.
- **Missing screenshot images in dataset/images/** (project-manager, 2026-02-12T20:31Z). Closed same day: Valid image path and OCR run confirmed via `npm run ocr:predict`.
- **Missing batch prediction pipeline** (project-manager, 2026-02-12T20:31Z). Closed same day: `scripts/ocr_corpus_predict.cjs` implemented; `npm run ocr:predict` wired.

## Scope Creep Intercept Template

Use this when a new request does not pass OCR scope gate.

```md
### Blocker
- Date (UTC):
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): project-manager
- Blocker: Request is out-of-scope for OCR-only cycle.
- Impact: Diverts effort from OCR baseline objectives.
- Needed input: Confirm park/defer to parking lot or formally re-scope intake.
- Status: ACTIVE
```

## Lock Policy Violation Template

Use this when a lock conflicts with OCR-only scope.

```md
### Blocker
- Date (UTC):
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): project-manager
- Blocker: Active lock is out-of-scope for OCR-only mode.
- Impact: Scope drift and delivery delay for OCR baseline.
- Needed input: Release lock now or provide OCR scope gate justification.
- Status: ACTIVE
```

## Wrong-Approach Risk Template

Use this when implementation assumptions are uncertain and could cause rework.

```md
### Blocker
- Date (UTC):
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`):
- Blocker: Potential wrong-approach risk detected before implementation.
- Impact: High rework risk if assumptions are incorrect.
- Needed input: Confirm constraints/files/contracts before proceeding.
- Status: ACTIVE
```

## Copy-Paste Blocker Template

```md
### Blocker
- Date (UTC): 2026-02-12T17:15:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): debugger
- Blocker:
- Impact:
- Needed input:
- Status: ACTIVE
```

## Stale Lock Takeover Template

```md
### Blocker
- Date (UTC): 2026-02-12T17:20:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `release-manager` | `verifier` | `reporter`): builder
- Blocker: Lock appears stale in `docs/WORKLOCKS.md` for `path/to/file`.
- Impact: Cannot proceed with assigned lane.
- Needed input: Project manager decision to release/reassign lock.
- Status: ACTIVE
```


## Blocker Protocol v2 (AOM_V2)

### Severity Levels
- `S1`: release-blocking or security-critical.
- `S2`: feature-blocking with active owner dependency.
- `S3`: workflow/process friction.
- `S4`: informational risk.

### SLA Defaults
- `S1`: 15 minutes
- `S2`: 45 minutes
- `S3`: same day
- `S4`: next planning cycle

### Blocker Entry v2
- Date (UTC):
- Severity: `S1|S2|S3|S4`
- Owner:
- Blocker:
- Impact:
- Needed input:
- SLA deadline (UTC):
- Status: `ACTIVE|RESOLVED|DUPLICATE`
- Canonical ID:

Rules:
- Duplicate blockers must be marked `DUPLICATE` with canonical ID pointer.
- ACTIVE blockers need explicit owner + deadline.

