# Blockers

## Active Blockers

### Blocker (RESOLVED)
- Date (UTC): 2026-02-12T19:50:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): project-manager
- Blocker: `ui-designer` role is not properly assigned to an explicit active agent tab for current OCR cycle.
- Impact: OCR UI correction usability lane cannot proceed; risk of PM/debugger doing ad hoc UI work outside role boundaries.
- Needed input: Confirm which active agent tab is bound to `ui-designer` and seed it with `docs/agents/role-inputs/ui-designer.md`.
- Status: RESOLVED
- Resolution (2026-02-12T21:10:00Z): ui-designer role bound to active agent tab. Locks claimed for OCR lane B files. Lane B status set to ACTIVE.

### Blocker (RESOLVED)
- Date (UTC): 2026-02-12T20:00:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): debugger
- Blocker: Ground truth corpus is too small for a meaningful OCR baseline (currently 1 runnable sample).
- Impact: Metrics are now computable but not statistically representative; failure matrix and trend confidence are weak.
- Needed input: Provide/label at least 10-20 diverse real screenshots and add them to corpus.
- Status: RESOLVED
- Resolution (2026-02-12T18:55Z): Debugger populated corpus with 15 labeled samples (5 Crew Hub, 10 Map screens) from user-provided screenshot paths. Ran full pipeline: `ocr:truth:build` -> `ocr:predict` (15/15 OK) -> `ocr:eval` -> `ocr:baseline:promote`. Baseline established.

## Resolved Blockers
- Date (UTC): 2026-02-12T20:31:00Z
- Owner: project-manager
- Blocker: Missing screenshot images in `dataset/images/`.
- Resolution: Confirmed at least one valid image path and successful OCR run via `npm run ocr:predict`.

- Date (UTC): 2026-02-12T20:31:00Z
- Owner: project-manager
- Blocker: Missing batch prediction pipeline.
- Resolution: Implemented `scripts/ocr_corpus_predict.cjs` and wired `npm run ocr:predict`; predictions now generated to `dataset/ocr-corpus/predictions.latest.json`.

## Scope Creep Intercept Template

Use this when a new request does not pass OCR scope gate.

```md
### Blocker
- Date (UTC):
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): project-manager
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
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): project-manager
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
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`):
- Blocker: Potential wrong-approach risk detected before implementation.
- Impact: High rework risk if assumptions are incorrect.
- Needed input: Confirm constraints/files/contracts before proceeding.
- Status: ACTIVE
```

## Copy-Paste Blocker Template

```md
### Blocker
- Date (UTC): 2026-02-12T17:15:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): debugger
- Blocker:
- Impact:
- Needed input:
- Status: ACTIVE
```

## Stale Lock Takeover Template

```md
### Blocker
- Date (UTC): 2026-02-12T17:20:00Z
- Owner (`project-manager` | `ui-designer` | `builder` | `debugger` | `verifier` | `reporter`): builder
- Blocker: Lock appears stale in `docs/WORKLOCKS.md` for `path/to/file`.
- Impact: Cannot proceed with assigned lane.
- Needed input: Project manager decision to release/reassign lock.
- Status: ACTIVE
```
