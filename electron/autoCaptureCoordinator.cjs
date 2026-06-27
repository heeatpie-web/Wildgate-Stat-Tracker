const fs = require('fs');

const AUTO_CAPTURE_CAPTURE_TIMEOUT_MS = 20000;

const STEP_DEFINITIONS = Object.freeze({
  openMap: { number: 1, label: 'Open Tactical Map' },
  captureMap: { number: 2, label: 'Tactical Map (Primary View)' },
  closeMap: { number: 3, label: 'Close Tactical Map' },
  openCrewHub: { number: 4, label: 'Navigate to Crew Hub' },
  moveCrewHubRight: { number: 5, label: 'Navigate to Crew Hub Panel (Right)' },
  captureCrewHubA: { number: 6, label: 'Crew Hub Panel A' },
  moveCrewHubEnd: { number: 7, label: 'Navigate to Crew Hub Panel End' },
  captureCrewHubB: { number: 8, label: 'Crew Hub Panel B' },
  exit: { number: 9, label: 'Exit' },
});

const AUTO_CAPTURE_WAIT_PROFILES = Object.freeze({
  fast: Object.freeze({
    tacticalMapOpenMs: 70,
    tacticalMapCloseMs: 10,
    heldMapOpenMs: 80,
    heldMapCloseMs: 20,
    escMenuOpenMs: 25,
    crewHubOpenMs: 60,
    crewHubPanelStepMs: 20,
    crewHubPanelEndMs: 20,
    exitMs: 10,
  }),
});

const DEFAULT_GAME_SETTINGS_CANDIDATES = Object.freeze([
  process.env.WILDGATE_GAME_SETTINGS_PATH,
  process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}\\Nebula\\Saved\\Config\\WindowsClient\\Input.ini`
    : '',
  process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}\\Nebula\\Saved\\Config\\WindowsClient\\GameUserSettings.ini`
    : '',
].filter(Boolean));

const TACTICAL_MAP_BIND_PATTERNS = Object.freeze([
  /ActionMappings=\([^\r\n)]*ActionName="?([^"\r\n)]*Tactical[^"\r\n)]*Map[^"\r\n)]*)"?.*?\bKey=([^,\r\n)]+)/i,
  /ActionMappings=\([^\r\n)]*ActionName="?([^"\r\n)]*Map[^"\r\n)]*)"?.*?\bKey=([^,\r\n)]+)/i,
  /(?:TacticalMap|ToggleTacticalMap|OpenTacticalMap|OpenMap|MapKey)\s*=\s*("?)([^\r\n"]+)\1/i,
  /Tactical[^"\r\n]*Map[^\r\n]*?(?:PrimaryKey|Key)\s*[:=]\s*"?([A-Za-z0-9_:+-]+)"?/i,
]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampWaitMultiplier(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0.5, Math.min(3, numeric));
}

function withTimeout(promiseFactory, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const finish = (callback) => (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback(value);
    };

    timer = setTimeout(() => {
      finish(reject)(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve()
      .then(promiseFactory)
      .then(finish(resolve))
      .catch(finish(reject));
  });
}

function normalizeKeybindToSendKeys(rawValue) {
  const raw = String(rawValue || '')
    .trim()
    .replace(/^EKeys::/i, '')
    .replace(/^["']|["']$/g, '');
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, '').toLowerCase();
  if (!compact) return null;
  if (compact.includes('mouse') || compact.includes('gamepad')) return null;

  const eventCodeArrowMap = {
    arrowup: '{UP}',
    arrowdown: '{DOWN}',
    arrowleft: '{LEFT}',
    arrowright: '{RIGHT}',
  };
  if (Object.prototype.hasOwnProperty.call(eventCodeArrowMap, compact)) {
    return eventCodeArrowMap[compact];
  }
  if (/^key[a-z]$/i.test(raw)) {
    return raw.slice(-1).toLowerCase();
  }
  if (/^digit\d$/i.test(raw)) {
    return raw.slice(-1);
  }
  if (/^numpad\d$/i.test(raw)) {
    return raw.slice(-1);
  }

  if (/^[a-z0-9]$/i.test(raw)) {
    return raw.length === 1 ? raw.toLowerCase() : raw;
  }
  if (/^f\d{1,2}$/i.test(raw)) {
    return `{${raw.toUpperCase()}}`;
  }

  const specialMap = {
    tab: '{TAB}',
    escape: '{ESC}',
    esc: '{ESC}',
    space: ' ',
    spacebar: ' ',
    enter: '{ENTER}',
    return: '{ENTER}',
    up: '{UP}',
    uparrow: '{UP}',
    down: '{DOWN}',
    downarrow: '{DOWN}',
    left: '{LEFT}',
    leftarrow: '{LEFT}',
    right: '{RIGHT}',
    rightarrow: '{RIGHT}',
    end: '{END}',
    home: '{HOME}',
    pgup: '{PGUP}',
    pageup: '{PGUP}',
    pgdn: '{PGDN}',
    pagedown: '{PGDN}',
    insert: '{INSERT}',
    ins: '{INSERT}',
    delete: '{DEL}',
    del: '{DEL}',
    backspace: '{BS}',
  };

  return specialMap[compact] || null;
}

function extractTacticalMapKeybindFromText(fileText) {
  const text = String(fileText || '');
  if (!text.trim()) return null;

  for (const pattern of TACTICAL_MAP_BIND_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const candidate = match[2] || match[1];
    const normalized = normalizeKeybindToSendKeys(candidate);
    if (normalized) {
      return {
        raw: String(candidate).trim(),
        sendKeys: normalized,
      };
    }
  }

  return null;
}

async function lookupTacticalMapKeybind(options = {}) {
  const candidates = Array.isArray(options.candidates) && options.candidates.length > 0
    ? options.candidates
    : DEFAULT_GAME_SETTINGS_CANDIDATES;

  for (const candidate of candidates) {
    try {
      if (!candidate || !fs.existsSync(candidate)) continue;
      const contents = await fs.promises.readFile(candidate, 'utf8');
      const resolved = extractTacticalMapKeybindFromText(contents);
      if (resolved) {
        return {
          ...resolved,
          sourcePath: candidate,
        };
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function buildFailedPayload(message, step, detail) {
  return {
    phase: 'failed',
    message,
    stepNumber: step?.number || null,
    stepLabel: step?.label || null,
    detail: detail || null,
  };
}

function getRequestedTacticalMapKeybind(request = {}) {
  const hasAutoCaptureKey = Object.prototype.hasOwnProperty.call(request, 'autoCaptureTacticalMapKey');
  const hasLegacyKey = Object.prototype.hasOwnProperty.call(request, 'tacticalMapKeybind');
  const rawValue = hasAutoCaptureKey
    ? request.autoCaptureTacticalMapKey
    : request.tacticalMapKeybind;

  const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
  return {
    provided: (hasAutoCaptureKey || hasLegacyKey) && raw !== '',
    raw,
  };
}

function logAutoCaptureStep(step, detail) {
  if (!step) return;
  const suffix = detail ? ` ${detail}` : '';
  console.log(`[AutoCapture] Step ${step.number}/9 ${step.label}${suffix}`);
}

function createAutoCaptureCoordinator({
  notify,
  runWithHeldKeySequence = null,
  sendKeySequence,
  sendMenuKeySequence = null,
  sendGamepadSequence = null,
  prepareGamepadSequence = null,
  captureAndProcess,
  lookupMapKeybind = lookupTacticalMapKeybind,
  delayFn = delay,
  beforeSequence = null,
  afterSequence = null,
}) {
  let inProgress = false;

  const scaleWait = (baseMs, multiplier) => Math.max(0, Math.round(baseMs * clampWaitMultiplier(multiplier)));

  const runSequence = async ({
    matchId,
    activeUser = null,
    sendKeypresses = true,
    gamepadModeEnabled = false,
    macroSequenceConfig = null,
    waitMultiplier = 0.5,
    ocrMode = 'local',
    ocrRegions = null,
    runtimeOptions = {},
    tacticalMapKeybind,
    holdTacticalMapKey = false,
    retryCrewHubOnMismatch = true,
  }) => {
    const useGamepad = gamepadModeEnabled && typeof sendGamepadSequence === 'function';
    console.log(
      `[AutoCapture] Sequence starting matchId=${matchId} tacticalMapKeybind=${tacticalMapKeybind?.raw || 'unknown'} `
      + `sendKeys=${tacticalMapKeybind?.sendKeys || 'unknown'} sendKeypresses=${sendKeypresses} gamepad=${useGamepad} waitMultiplier=${waitMultiplier}`
    );

    if (useGamepad && typeof prepareGamepadSequence === 'function') {
      const prepareResult = await prepareGamepadSequence();
      if (!prepareResult?.success) {
        throw new Error(`Virtual controller: ${prepareResult?.error || 'connect failed'}`);
      }
    }

    const sendStepKeys = async (step, sequence, { useMenuSender = false } = {}) => {
      if (!sendKeypresses) return;

      // Menu navigation is sent through the virtual controller in gamepad mode.
      // This keeps the game on controller prompts for START/A/B/D-pad menu input.
      // Tactical map keypresses still use the configured keyboard binding.
      const isMenuToggle = /^\{ESC\}$/i.test(String(sequence || '').trim())
        || /^\{Escape\}$/i.test(String(sequence || '').trim());

      if (useGamepad && useMenuSender) {
        logAutoCaptureStep(step, isMenuToggle ? '(gamepad-menu)' : '(gamepad)');
        const result = await sendGamepadSequence(step, sequence, macroSequenceConfig);
        if (!result?.success) {
          const reason = result?.error || 'gamepad input failed';
          throw new Error(`${step.label}: ${reason}`);
        }
        return;
      }

      logAutoCaptureStep(step, '(keypress)');
      const sender = useMenuSender && typeof sendMenuKeySequence === 'function'
        ? sendMenuKeySequence
        : sendKeySequence;
      const result = await sender(sequence, step.label);
      if (!result?.success) {
        const reason = result?.error || 'keypress failed';
        throw new Error(`${step.label}: ${reason}`);
      }
    };

    const waitStep = async (baseMs) => {
      const scaled = scaleWait(baseMs, waitMultiplier);
      if (scaled > 0) {
        await delayFn(scaled);
      }
    };

    const emitCommittedCaptureProgress = (captures = []) => {
      captures.forEach((capture) => {
        notify({
          phase: 'capture-progress',
          captureIndex: capture.captureIndex,
          totalCaptures: 3,
          matchId,
          filePath: capture.filePath,
          filename: capture.filename,
          screenshotType: capture.screenshotType,
          expectedScreenshotType: capture.expectedScreenshotType || null,
          mismatch: Boolean(capture.mismatch),
          retried: Boolean(capture.retried),
          durationMs: typeof capture.durationMs === 'number' ? capture.durationMs : null,
        });
      });
    };

    const cleanupAttemptCaptures = async (captures = []) => {
      await Promise.all((captures || []).map(async (capture) => {
        const filePath = typeof capture?.filePath === 'string' ? capture.filePath.trim() : '';
        if (!filePath) return;
        try {
          await fs.promises.unlink(filePath);
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            console.warn(`[AutoCapture] Failed to clean up uncommitted artifact ${filePath}: ${error?.message || error}`);
          }
        }
      }));
    };

    const captureStep = async (step, captureIndex, attemptCaptures, screenshotTypeHint = null, { isRetry = false } = {}) => {
      logAutoCaptureStep(step, isRetry ? '(retry-capture)' : '(capture)');
      // Fire sound immediately so the user hears it when the capture begins,
      // not after the PNG encode + file save completes.
      notify({ phase: 'capture-started', captureIndex, totalCaptures: 3, matchId, isRetry });
      const captureStartedAt = Date.now();
      const result = await withTimeout(() => captureAndProcess({
        matchId,
        activeUser,
        ocrMode,
        ocrRegions,
        runtimeOptions,
        screenshotTypeHint,
      }), AUTO_CAPTURE_CAPTURE_TIMEOUT_MS, step.label);
      const captureDurationMs = Date.now() - captureStartedAt;

      if (!result?.success || !result.filePath) {
        const reason = result?.error || 'capture failed';
        throw new Error(`${step.label}: ${reason}`);
      }

      const detectedTypeRaw = String(result?.ocrData?.screenshotType || result?.screenshotType || '').trim();
      const expectedType = screenshotTypeHint ? String(screenshotTypeHint).trim() : null;
      // A mismatch requires positive evidence of a *different* screen. We
      // intentionally do NOT treat empty/unknown detections as mismatches —
      // those happen on fast-frame captures with no readable text and would
      // produce noisy retries.
      const mismatch = Boolean(
        expectedType
        && detectedTypeRaw
        && detectedTypeRaw !== 'unknown'
        && detectedTypeRaw !== expectedType
      );

      const captureMeta = {
        captureIndex,
        filePath: result.filePath,
        filename: result.filename || null,
        screenshotType: detectedTypeRaw || expectedType || null,
        detectedScreenshotType: detectedTypeRaw || null,
        expectedScreenshotType: expectedType,
        mismatch,
        isRetry,
        durationMs: captureDurationMs,
      };
      attemptCaptures.push(captureMeta);

      if (mismatch) {
        console.warn(
          `[AutoCapture] ${step.label}: expected ${expectedType} but detected ${detectedTypeRaw}`
          + ` (capture #${captureIndex}${isRetry ? ', retry' : ''}, ${captureDurationMs}ms)`
        );
        notify({
          phase: 'capture-mismatch',
          captureIndex,
          totalCaptures: 3,
          matchId,
          expectedType,
          detectedType: detectedTypeRaw,
          stepLabel: step.label,
          filePath: result.filePath,
          durationMs: captureDurationMs,
          isRetry,
        });
      }

      return captureMeta;
    };

    // When the first crew hub capture comes back as a non-crew_hub screen, the
    // SPACE keypress that should have opened Crew Hub likely landed on the
    // wrong menu item. Best-effort recovery: back out fully, re-open the pause
    // menu, re-select Crew Hub, and re-navigate to panel A. One attempt only —
    // if recovery also fails we keep the original capture and continue so the
    // macro never gates on screen-type detection.
    const runCrewHubRecoverySequence = async (waitProfile) => {
      if (!sendKeypresses) return;
      // Two ESCs to reliably collapse whatever menu/dialog we landed on back
      // to plain gameplay, plus a third to re-open the pause menu.
      await sendStepKeys(STEP_DEFINITIONS.openCrewHub, '{ESC}', { useMenuSender: true });
      await waitStep(waitProfile.escMenuOpenMs);
      await sendStepKeys(STEP_DEFINITIONS.openCrewHub, '{ESC}', { useMenuSender: true });
      await waitStep(waitProfile.escMenuOpenMs);
      await sendStepKeys(STEP_DEFINITIONS.openCrewHub, '{ESC}', { useMenuSender: true });
      await waitStep(waitProfile.escMenuOpenMs);
      await sendStepKeys(STEP_DEFINITIONS.openCrewHub, '{UP}{UP}{UP}{UP}{SPACE}', { useMenuSender: true });
      await waitStep(waitProfile.crewHubOpenMs);
      await sendStepKeys(STEP_DEFINITIONS.moveCrewHubRight, '{RIGHT}{RIGHT}', { useMenuSender: true });
      await waitStep(waitProfile.crewHubPanelStepMs);
    };

    const removeCaptureArtifact = async (filePath) => {
      const trimmed = typeof filePath === 'string' ? filePath.trim() : '';
      if (!trimmed) return;
      try {
        await fs.promises.unlink(trimmed);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          console.warn(`[AutoCapture] Failed to remove mismatched capture ${trimmed}: ${error?.message || error}`);
        }
      }
    };

    const runAttempt = async (waitProfile) => {
      const attemptCaptures = [];
      try {
        const captureTacticalMapStep = async () => {
          if (!sendKeypresses) {
            await captureStep(STEP_DEFINITIONS.captureMap, 1, attemptCaptures, 'tactical_map');
            return;
          }

          if (holdTacticalMapKey && typeof runWithHeldKeySequence === 'function') {
            logAutoCaptureStep(STEP_DEFINITIONS.openMap, '(hold)');
            const heldResult = await runWithHeldKeySequence(
              tacticalMapKeybind.sendKeys,
              STEP_DEFINITIONS.openMap.label,
              async () => {
                await waitStep(waitProfile.heldMapOpenMs);
                await captureStep(STEP_DEFINITIONS.captureMap, 1, attemptCaptures, 'tactical_map');
              }
            );
            if (!heldResult?.success) {
              throw new Error(heldResult?.error || `${STEP_DEFINITIONS.captureMap.label}: hold-capture failed`);
            }
            await waitStep(waitProfile.heldMapCloseMs);
            return;
          }

          // Toggle mode: tap to open, capture, tap to close.
          await sendStepKeys(STEP_DEFINITIONS.openMap, tacticalMapKeybind.sendKeys);
          await waitStep(waitProfile.tacticalMapOpenMs);
          await captureStep(STEP_DEFINITIONS.captureMap, 1, attemptCaptures, 'tactical_map');
          await sendStepKeys(STEP_DEFINITIONS.closeMap, tacticalMapKeybind.sendKeys);
          await waitStep(waitProfile.tacticalMapCloseMs);
        };

        await captureTacticalMapStep();

        await sendStepKeys(STEP_DEFINITIONS.openCrewHub, '{ESC}', { useMenuSender: true });
        await waitStep(waitProfile.escMenuOpenMs);
        await sendStepKeys(STEP_DEFINITIONS.openCrewHub, '{UP}{UP}{UP}{UP}{SPACE}', { useMenuSender: true });
        await waitStep(waitProfile.crewHubOpenMs);

        await sendStepKeys(STEP_DEFINITIONS.moveCrewHubRight, '{RIGHT}{RIGHT}', { useMenuSender: true });
        await waitStep(waitProfile.crewHubPanelStepMs);

        const crewHubACapture = await captureStep(STEP_DEFINITIONS.captureCrewHubA, 2, attemptCaptures, 'crew_hub');

        if (crewHubACapture.mismatch && retryCrewHubOnMismatch && sendKeypresses) {
          // Drop the bad capture from the attempt list and remove the artifact;
          // the recovery sequence + retry below will replace it (or, if retry
          // also mismatches, we accept the failure and keep going).
          const badIndex = attemptCaptures.indexOf(crewHubACapture);
          if (badIndex >= 0) attemptCaptures.splice(badIndex, 1);
          await removeCaptureArtifact(crewHubACapture.filePath);

          await runCrewHubRecoverySequence(waitProfile);

          const retryCapture = await captureStep(
            STEP_DEFINITIONS.captureCrewHubA,
            2,
            attemptCaptures,
            'crew_hub',
            { isRetry: true }
          );
          retryCapture.retried = true;
        }

        await sendStepKeys(STEP_DEFINITIONS.moveCrewHubEnd, '{DOWN}', { useMenuSender: true });
        await waitStep(waitProfile.crewHubPanelEndMs);

        await captureStep(STEP_DEFINITIONS.captureCrewHubB, 3, attemptCaptures, 'crew_hub');

        await sendStepKeys(STEP_DEFINITIONS.exit, '{ESC}', { useMenuSender: true });
        await waitStep(waitProfile.exitMs);

        return attemptCaptures;
      } catch (error) {
        if (error && typeof error === 'object') {
          error.attemptCaptures = attemptCaptures;
        }
        throw error;
      }
    };

    const getAttemptCapturesFromError = (error) => (
      Array.isArray(error?.attemptCaptures)
        ? error.attemptCaptures
        : []
    );

    try {
      const acceptedCaptures = await runAttempt(AUTO_CAPTURE_WAIT_PROFILES.fast);
      emitCommittedCaptureProgress(acceptedCaptures);
    } catch (error) {
      await cleanupAttemptCaptures(getAttemptCapturesFromError(error));
      throw error;
    }
  };

  const tryEscapeCleanup = async (payload) => {
    if (!payload?.sendKeypresses) return;
    try {
      if (payload.gamepadModeEnabled && typeof sendGamepadSequence === 'function') {
        await sendGamepadSequence(STEP_DEFINITIONS.exit, '{ESC}', payload.macroSequenceConfig);
        return;
      }
      await sendKeySequence('{ESC}', 'Auto-Capture cleanup');
    } catch {
      // Cleanup is best-effort.
    }
  };

  return {
    isBusy() {
      return inProgress;
    },
    async start(request = {}) {
      if (inProgress) {
        return { started: false, ignored: true, reason: 'in-progress' };
      }

      const lifecycleActive = request.lifecycleActive === true;
      const matchId = Number(request.matchId || 0);
      if (!lifecycleActive || !Number.isInteger(matchId) || matchId <= 0) {
        notify(buildFailedPayload('F10 Auto-Capture: No active match in progress.'));
        return { started: false, reason: 'no-active-match' };
      }

      const sendKeypresses = request.autoCaptureSendKeypresses !== false;
      const holdTacticalMapKey = sendKeypresses && request.holdTacticalMapKey === true;

      let tacticalMapKeybind = null;
      if (sendKeypresses) {
        const requestedTacticalMapKeybind = getRequestedTacticalMapKeybind(request);
        const requestedMapKeybindRaw = requestedTacticalMapKeybind.raw;
        if (requestedMapKeybindRaw) {
          const requestedMapKeybindNormalized = normalizeKeybindToSendKeys(requestedMapKeybindRaw);
          if (requestedMapKeybindNormalized) {
            tacticalMapKeybind = {
              raw: requestedMapKeybindRaw,
              sendKeys: requestedMapKeybindNormalized,
              source: 'settings',
            };
          } else {
            const message = `Unsupported tactical map key configured: "${requestedMapKeybindRaw}"`;
            notify(buildFailedPayload(message));
            return { started: false, reason: 'invalid-tactical-map-key' };
          }
        }

        if (!tacticalMapKeybind?.sendKeys) {
          tacticalMapKeybind = await lookupMapKeybind?.({ request, sendKeypresses });
        }
        if (!tacticalMapKeybind?.sendKeys) {
          notify(buildFailedPayload('No tactical map key configured. Set it in Settings.'));
          return { started: false, reason: 'missing-tactical-map-key' };
        }
      }

      const payload = {
        matchId,
        activeUser: typeof request.activeUser === 'string' && request.activeUser.trim()
          ? request.activeUser.trim()
          : null,
        sendKeypresses,
        gamepadModeEnabled: sendKeypresses && request.gamepadModeEnabled === true,
        waitMultiplier: clampWaitMultiplier(request.autoCaptureWaitMultiplier),
        ocrMode: typeof request.ocrMode === 'string' && request.ocrMode.trim()
          ? request.ocrMode.trim()
          : 'local',
        ocrRegions: request.ocrRegions && typeof request.ocrRegions === 'object'
          ? request.ocrRegions
          : null,
        runtimeOptions: request.runtimeOptions && typeof request.runtimeOptions === 'object'
          ? request.runtimeOptions
          : {},
        tacticalMapKeybind,
        holdTacticalMapKey,
        macroSequenceConfig: request.macroSequenceConfig && typeof request.macroSequenceConfig === 'object'
          ? request.macroSequenceConfig
          : null,
        retryCrewHubOnMismatch: request.retryCrewHubOnMismatch !== false,
      };

      inProgress = true;
      notify({
        phase: 'started',
        matchId,
        totalCaptures: 3,
      });

      void (async () => {
        try {
          if (typeof beforeSequence === 'function') {
            await beforeSequence(payload);
          }
          await runSequence(payload);
          notify({
            phase: 'completed',
            matchId,
            totalCaptures: 3,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          const step = Object.values(STEP_DEFINITIONS).find((candidate) => message.includes(candidate.label))
            || null;
          await tryEscapeCleanup(payload);
          notify(buildFailedPayload(
            step
              ? `Auto-Capture failed at Step ${step.number} — ${step.label}`
              : 'Auto-Capture failed.',
            step,
            message
          ));
        } finally {
          if (typeof afterSequence === 'function') {
            try {
              await afterSequence(payload);
            } catch (cleanupError) {
              console.warn('[AutoCapture] Sequence cleanup failed:', cleanupError?.message || cleanupError);
            }
          }
          inProgress = false;
        }
      })();

      return {
        started: true,
        matchId,
        tacticalMapKeybind: tacticalMapKeybind?.raw || null,
      };
    },
    __test__: {
      get inProgress() {
        return inProgress;
      },
    },
  };
}

module.exports = {
  AUTO_CAPTURE_CAPTURE_TIMEOUT_MS,
  STEP_DEFINITIONS,
  createAutoCaptureCoordinator,
  extractTacticalMapKeybindFromText,
  lookupTacticalMapKeybind,
  normalizeKeybindToSendKeys,
};
