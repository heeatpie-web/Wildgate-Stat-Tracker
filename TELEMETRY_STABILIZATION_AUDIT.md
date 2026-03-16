# Telemetry Stabilization Audit

This note is for a follow-up agent reviewing the telemetry stabilization and auto-capture speed pass that was just implemented.

## Goal of This Audit

The implementation was intended to satisfy this plan:

1. Move match lifecycle ownership into `useLogMonitor`.
2. Stop `telemetryProcessor` from mutating lifecycle state.
3. Preserve trusted prospector loadout data across match boundaries.
4. Treat ship telemetry as ship selection only.
5. Speed up ESC -> Crew Hub auto-capture navigation with validation and a guarded fallback.
6. Add coverage for the lifecycle, loadout persistence, ship-selection, prompt, and capture retry paths.

This audit is written to help you answer two questions:

1. Did the code actually implement the plan correctly?
2. Was there a cleaner or lower-risk way to get to the same result?

## Files Changed

- [src/hooks/useLogMonitor.ts](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts)
- [src/utils/telemetryProcessor.ts](/N:/Coding%20(backup)/src/utils/telemetryProcessor.ts)
- [electron/autoCaptureCoordinator.cjs](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs)
- [src/hooks/__tests__/useLogMonitor.test.ts](/N:/Coding%20(backup)/src/hooks/__tests__/useLogMonitor.test.ts)
- [src/utils/__tests__/telemetryProcessor.test.ts](/N:/Coding%20(backup)/src/utils/__tests__/telemetryProcessor.test.ts)
- [electron/autoCaptureCoordinator.test.js](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.test.js)
- [src/App.test.tsx](/N:/Coding%20(backup)/src/App.test.tsx)

## High-Level Summary of What Changed

### 1. Lifecycle ownership moved into `useLogMonitor`

The hook now owns:

- lifecycle start detection
- lifecycle end detection
- telemetry draft creation
- telemetry draft finalization
- timer synchronization for lifecycle-driven match flow
- overlay transition to `Setup` and `Result`
- `telemetry:draft-started` and `telemetry:draft-ready` dispatch

Relevant anchors:

- [useLogMonitor.ts:579](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L579)
- [useLogMonitor.ts:709](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L709)
- [useLogMonitor.ts:769](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L769)
- [useLogMonitor.ts:797](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L797)
- [useLogMonitor.ts:1066](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1066)
- [useLogMonitor.ts:1957](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1957)

Key implementation details:

- Start signals:
  - gameplay/practice map load
  - live matchmaker state with a non-empty session ID
- End signals:
  - frontend map load
  - explicit session clear after start
- `shouldStartLifecycle` prevents double-start when matchmaker start is followed by map start.
- `endTelemetryLifecycle` creates a draft if one does not yet exist, then finalizes it.
- Late-created drafts now inherit `telemetryLifecycleStartedAtRef` instead of the match-end timestamp.

That last fix matters. It was discovered during test work: a minimal draft created only at match end was initially receiving `00:00` because the draft timestamp was set to the end event. The hook now uses the lifecycle start time when available.

### 2. `telemetryProcessor` was reduced to non-lifecycle side effects

The processor no longer:

- sets `isMatchInProgress`
- sets `matchStartTime`
- sets timer values
- sets overlay phase
- tracks session lifecycle
- triggers match-end UI behavior

It now only handles:

- player ID discovery
- device display info
- game resolution
- logging/debug for loadout and ship-selection records

Relevant anchors:

- [telemetryProcessor.ts:70](/N:/Coding%20(backup)/src/utils/telemetryProcessor.ts#L70)
- [telemetryProcessor.ts:136](/N:/Coding%20(backup)/src/utils/telemetryProcessor.ts#L136)
- [telemetryProcessor.ts:157](/N:/Coding%20(backup)/src/utils/telemetryProcessor.ts#L157)
- [telemetryProcessor.ts:170](/N:/Coding%20(backup)/src/utils/telemetryProcessor.ts#L170)

This is aligned with the plan and removes the previous split-brain risk where lifecycle changes could come from both the hook and the processor.

### 3. Prospector loadout persistence was changed to be less destructive

New-match reset no longer blindly wipes the trusted prospector loadout. Instead:

- hero and ship are re-seeded from the last trusted loadout
- active weapons are rebuilt from the preserved loadout
- prospector slot groups only clear when telemetry explicitly sends an empty value

Relevant anchors:

- [useLogMonitor.ts:496](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L496)
- [useLogMonitor.ts:1737](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1737)
- [useLogMonitor.ts:1834](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1834)

The key mechanism is `isExplicitlyEmptyTelemetryValue`. The old behavior inferred "clear" from a resolved GUID list being empty. The new behavior requires the raw telemetry field itself to be explicitly empty.

### 4. `NebLoadoutSaved` ordering/session guards were tightened

The hook now rejects:

- pre-match `NebLoadoutSaved` events
- stale older `NebLoadoutSaved` events unless they qualify for the existing out-of-order exception

Relevant anchors:

- [useLogMonitor.ts:1152](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1152)

This is intended to stop prior-match or older saves from rolling the live loadout backward.

### 5. Ship telemetry is now treated as ship selection only

The implementation keeps ship-type detection from:

- local loadout/selection blobs
- shared `shipselection` / `GameModeShipSelection` records

It avoids allowing shared signals to overwrite a trusted local ship selection once local telemetry has already resolved a concrete ship.

Relevant anchors:

- [useLogMonitor.ts:456](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L456)
- [useLogMonitor.ts:834](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L834)
- [useLogMonitor.ts:1593](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1593)
- [useLogMonitor.ts:1850](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1850)

Important behavior:

- `localTelemetryShipSelectionRef` is set when local telemetry resolves a ship.
- shared ship updates are suppressed if that local telemetry ship selection is still considered trusted.
- weak placeholder labels are still rejected.

### 6. Auto-capture Crew Hub navigation was sped up

The auto-capture sequence now:

- uses shorter waits for ESC menu and Crew Hub navigation
- validates `crew_hub` before capture A
- treats screen-type mismatches as validation errors
- retries once with the slower legacy-like wait profile
- attempts a best-effort ESC recovery before retrying

Relevant anchors:

- [autoCaptureCoordinator.cjs:24](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs#L24)
- [autoCaptureCoordinator.cjs:70](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs#L70)
- [autoCaptureCoordinator.cjs:300](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs#L300)
- [autoCaptureCoordinator.cjs:343](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs#L343)
- [autoCaptureCoordinator.cjs:400](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs#L400)

This is consistent with the plan. The tactical-map timings were intentionally left unchanged in both profiles.

## Tests Added or Updated

### Hook coverage

Relevant anchors:

- [useLogMonitor.test.ts:450](/N:/Coding%20(backup)/src/hooks/__tests__/useLogMonitor.test.ts#L450)
- [useLogMonitor.test.ts:649](/N:/Coding%20(backup)/src/hooks/__tests__/useLogMonitor.test.ts#L649)

Coverage now includes:

- no duplicate restart when matchmaker-start is followed by map-start
- minimal draft creation/finalization at match end with no existing draft
- reduced processor context
- explicit stale/pre-match loadout-save handling
- shared ship telemetry cases already present in the suite

### Processor coverage

Relevant anchors:

- [telemetryProcessor.test.ts:27](/N:/Coding%20(backup)/src/utils/__tests__/telemetryProcessor.test.ts#L27)

Coverage now confirms:

- identity discovery still works
- device info and resolution parsing still work
- lifecycle telemetry no longer mutates lifecycle state through the processor

### Auto-capture coverage

Relevant anchors:

- [autoCaptureCoordinator.test.js:61](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.test.js#L61)
- [autoCaptureCoordinator.test.js:129](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.test.js#L129)
- [autoCaptureCoordinator.test.js:228](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.test.js#L228)

Coverage now checks:

- faster wait profile
- `crew_hub` validation before capture A
- fallback retry behavior
- mismatch failure after retry

### UI prompt / hotkey sync coverage

Relevant anchors:

- [App.test.tsx:325](/N:/Coding%20(backup)/src/App.test.tsx#L325)
- [App.test.tsx:493](/N:/Coding%20(backup)/src/App.test.tsx#L493)
- [App.test.tsx:532](/N:/Coding%20(backup)/src/App.test.tsx#L532)

This was updated because the app now depends on store subscription behavior for hotkey state sync, and the previous tests were asserting older F10 invocation behavior rather than the current mount-time sync contract.

## Commands Already Run

These focused suites passed:

1. `npm test -- src/hooks/__tests__/useLogMonitor.test.ts`
2. `npm test -- src/utils/__tests__/telemetryProcessor.test.ts`
3. `npm test -- electron/autoCaptureCoordinator.test.js`
4. `npm test -- src/App.test.tsx`

I did not run the full repo test suite.

## What Another Agent Should Audit First

### A. Confirm lifecycle ownership is truly single-sourced now

Review:

- [useLogMonitor.ts](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts)
- [telemetryProcessor.ts](/N:/Coding%20(backup)/src/utils/telemetryProcessor.ts)

Questions to answer:

- Is there any remaining path outside `useLogMonitor` that can still flip lifecycle state, timer state, or overlay phase?
- Are there any event-order combinations where start and end can both fire for a single event batch and create a race?
- Is the use of refs plus provider state still coherent, or is there a hidden double-source issue left?

### B. Verify minimal draft finalization behavior

Review:

- [useLogMonitor.ts:615](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L615)
- [useLogMonitor.ts:709](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L709)
- [useLogMonitor.ts:797](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L797)
- [useLogMonitor.test.ts:649](/N:/Coding%20(backup)/src/hooks/__tests__/useLogMonitor.test.ts#L649)

Questions to answer:

- Is it always correct for a late-created draft to inherit `telemetryLifecycleStartedAtRef`?
- Could there be a case where the lifecycle start ref is stale and causes an incorrect duration?
- Should `createTelemetryDraftIfNeeded` accept an explicit `startedAt` parameter instead of depending on hidden ref state?

### C. Verify loadout preservation is not now too permissive

Review:

- [useLogMonitor.ts:496](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L496)
- [useLogMonitor.ts:1737](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1737)
- [useLogMonitor.ts:1834](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1834)

Questions to answer:

- Does `isExplicitlyEmptyTelemetryValue` correctly distinguish omitted fields from intentionally empty fields in all known payload shapes?
- Could nested objects with sparse/partial values be misclassified as "empty"?
- Is reseeding `activeWeapons` from the last trusted loadout always correct on match start, or can it surface stale UI state longer than intended?

### D. Verify ship selection precedence

Review:

- [useLogMonitor.ts:834](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L834)
- [useLogMonitor.ts:1593](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1593)
- [useLogMonitor.ts:1850](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1850)

Questions to answer:

- Does `localTelemetryShipSelectionRef` clear in all appropriate cases?
- Is `shipSource !== 'telemetry'` the right reset trigger?
- Could a valid later shared update be suppressed for too long after a stale local event?

### E. Verify auto-capture recovery assumptions

Review:

- [autoCaptureCoordinator.cjs:24](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs#L24)
- [autoCaptureCoordinator.cjs:70](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs#L70)
- [autoCaptureCoordinator.cjs:400](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs#L400)

Questions to answer:

- Is a single `ESC` best-effort recovery before retry actually sufficient?
- Can fast-path failure leave the UI in a state where retrying the full sequence is unsafe?
- Should fallback reuse actual prior screen detection state instead of blindly restarting?

## Areas Where a Better Path May Exist

This section is the part most worth auditing critically.

### 1. `useLogMonitor` is still carrying too much responsibility

The current implementation improves correctness, but it makes `useLogMonitor` even more central and stateful. A better design may be:

- extract lifecycle detection/finalization into a dedicated pure helper or reducer
- feed the reducer normalized telemetry events
- keep the hook responsible only for side effects and store writes

That would likely reduce regression risk and make tests less mock-heavy.

### 2. `createTelemetryDraftIfNeeded` now depends on hidden lifecycle state

The late-draft duration bug was fixed by making draft creation inherit `telemetryLifecycleStartedAtRef`. That solved the bug, but the function now silently depends on a ref outside its argument list.

A cleaner path may have been:

- pass `startedAt` explicitly when creating the draft
- keep `createTelemetryDraftIfNeeded` deterministic from inputs

That would make the lifecycle math easier to review.

### 3. The empty-value heuristic is still heuristic

`isExplicitlyEmptyTelemetryValue` is pragmatic, but it is not schema-driven. If telemetry payloads evolve, this could still misclassify fields.

A better long-term path may be:

- normalize loadout payloads into a typed intermediate shape first
- base clearing decisions on that normalized shape instead of recursive generic emptiness checks

### 4. Auto-capture still relies on timing, just less of it

The fallback strategy is an improvement, but the overall design is still timing-based navigation with post-hoc validation.

A better path may be:

- validate each navigation step before continuing
- or model recovery paths explicitly per detected screen
- or use more OCR/state checks before sending the next navigation command

The current implementation is faster and likely better, but it is not a real state machine.

### 5. The UI/hotkey tests were adapted, not deeply expanded

The mount-time sync tests cover the current contract, but they do not prove full end-to-end behavior of the prompt and auto-capture start flow. If there is any concern around the user-facing popup or result-entry path, another agent should consider either:

- extending the integration tests further
- or running a manual app verification pass

## Specific Risks That May Still Exist

1. Lifecycle refs and store state may still drift if provider state updates lag behind event bursts.
2. Session-clear end detection may still be sensitive to odd event ordering.
3. Shared ship-selection suppression may hide valid updates after an earlier local telemetry event.
4. Late minimal draft creation assumes the current loadout is still representative at end-of-match.
5. Auto-capture fallback may still fail if the first fast attempt leaves the menu stack in an unexpected state.

## Suggested Review Procedure

1. Read the diff in [useLogMonitor.ts](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts) first.
2. Confirm `telemetryProcessor.ts` no longer has lifecycle side effects.
3. Read the two new hook tests in [useLogMonitor.test.ts](/N:/Coding%20(backup)/src/hooks/__tests__/useLogMonitor.test.ts#L450) and [useLogMonitor.test.ts](/N:/Coding%20(backup)/src/hooks/__tests__/useLogMonitor.test.ts#L649).
4. Review the ship-selection and explicit-empty-slot logic around [useLogMonitor.ts:1593](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1593) and [useLogMonitor.ts:1737](/N:/Coding%20(backup)/src/hooks/useLogMonitor.ts#L1737).
5. Review the auto-capture retry path in [autoCaptureCoordinator.cjs](/N:/Coding%20(backup)/electron/autoCaptureCoordinator.cjs).
6. Run the four focused test commands listed above.
7. If possible, manually validate:
   - match start detection
   - match end finalization with popup
   - preserved prospector loadout between matches
   - ship selection behavior in shared lobby scenarios
   - Crew Hub capture speed and retry reliability

## Bottom-Line Audit Framing

My view is:

- The implementation is directionally correct and materially better than the previous split-lifecycle setup.
- The most important bug surfaced during the work, and it was fixed before completion: late-created end-of-match drafts were inheriting the wrong start time.
- The main remaining question is not whether the new behavior is closer to the intended plan. It is. The real question is whether too much logic now lives inside `useLogMonitor` and whether the heuristics for empty loadout values and shared ship precedence are still more implicit than they should be.

If you are looking for the most likely places a hidden regression still exists, start with:

1. lifecycle ref/state synchronization
2. shared ship precedence
3. auto-capture retry state recovery
