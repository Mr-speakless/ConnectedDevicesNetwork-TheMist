const ONE_MINUTE_MS = 60 * 1000;

export const DEFAULT_CLEAN_CONFIG = {
  needCleanMs: 30 * ONE_MINUTE_MS,
  cleanNowMs: 60 * ONE_MINUTE_MS,
};

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(timestamp) {
  return timestamp === null || timestamp === undefined
    ? null
    : new Date(timestamp).toISOString();
}

export function getCleanConfigFromEnv(env = process.env) {
  return {
    needCleanMs: toNumber(env.CLEAN_NEED_MS, DEFAULT_CLEAN_CONFIG.needCleanMs),
    cleanNowMs: toNumber(env.CLEAN_NOW_MS, DEFAULT_CLEAN_CONFIG.cleanNowMs),
  };
}

export function getInitialCleanState() {
  return {
    lastCleanedAt: null,
    lastCleanedAtIso: null,
    baselineEventDurationMs: 0,
  };
}

export function acknowledgeClean(currentDurationMs, timestamp = Date.now()) {
  return {
    lastCleanedAt: timestamp,
    lastCleanedAtIso: toIso(timestamp),
    baselineEventDurationMs: Math.max(0, Number(currentDurationMs || 0)),
  };
}

export function buildCleanState(summary, activeEventOrDuration, persistedCleanState, config) {
  const safeConfig = config || DEFAULT_CLEAN_CONFIG;
  const baselineEventDurationMs = Number(persistedCleanState?.baselineEventDurationMs || 0);
  const totalEventDurationMs = Number(summary?.totalEventDurationMs || 0);
  const activeDurationMs = typeof activeEventOrDuration === 'number'
    ? Number(activeEventOrDuration || 0)
    : Number(activeEventOrDuration?.durationMs || 0);
  const cumulativeDurationMs = totalEventDurationMs + activeDurationMs;
  const cleanDurationMs = Math.max(0, cumulativeDurationMs - baselineEventDurationMs);

  let cleanStatus = 'Okay';
  if (cleanDurationMs >= safeConfig.cleanNowMs) {
    cleanStatus = 'Clean now';
  } else if (cleanDurationMs >= safeConfig.needCleanMs) {
    cleanStatus = 'Need clean';
  }

  return {
    lastCleanedAt: persistedCleanState?.lastCleanedAt ?? null,
    lastCleanedAtIso: persistedCleanState?.lastCleanedAtIso ?? toIso(persistedCleanState?.lastCleanedAt),
    baselineEventDurationMs,
    cleanDurationMs,
    cleanStatus,
    thresholds: {
      needCleanMs: safeConfig.needCleanMs,
      cleanNowMs: safeConfig.cleanNowMs,
    },
  };
}
