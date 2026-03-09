const ONE_SECOND_MS = 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export const DEFAULT_EVENT_CONFIG = {
  sampleIntervalMs: 15 * ONE_SECOND_MS,
  baselineWindowSamples: 12,
  rangeWindowSamples: 3,
  fragmentEnterDelta: 25,
  fragmentEnterRange: 30,
  fragmentStartConfirmSamples: 2,
  fragmentCalmRange: 30,
  fragmentEndConfirmSamples: 3,
  mergeGapMs: FIFTEEN_MINUTES_MS,
  recentEventLimit: 500,
  recentEventDetailLimit: 50,
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

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

function cloneSample(sample) {
  return { ...sample };
}

function cloneFragment(fragment) {
  return { ...fragment };
}

function cloneSession(session) {
  if (!session) {
    return null;
  }

  return {
    ...session,
    samples: Array.isArray(session.samples) ? session.samples.map(cloneSample) : [],
    fragments: Array.isArray(session.fragments) ? session.fragments.map(cloneFragment) : [],
  };
}

function buildEmptySummary() {
  return {
    totalEventCount: 0,
    totalEventDurationMs: 0,
    totalExposureScore: 0,
  };
}

function buildEmptySignals() {
  return {
    fastSignal: null,
    baseline: null,
    range: 0,
    delta: 0,
    levelDelta: 0,
    isBurstHigh: false,
    isCalm: false,
    updatedAt: null,
    updatedAtIso: null,
  };
}

function createEventId(timestamp) {
  return `evt_${timestamp}`;
}

function createFragmentId(timestamp) {
  return `frag_${timestamp}`;
}

function calculateMedian(values) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function calculateRange(values) {
  if (!values.length) {
    return 0;
  }

  return Math.max(...values) - Math.min(...values);
}

function pushToWindow(windowValues, nextValue, maxSize) {
  const nextWindow = [...windowValues, nextValue];
  if (nextWindow.length > maxSize) {
    nextWindow.shift();
  }
  return nextWindow;
}

function filterSamplesByEndTime(samples, endTime = null) {
  if (endTime === null) {
    return samples;
  }

  return samples.filter((sample) => sample.timestamp <= endTime);
}

function summarizeSamples(samples, endTime = null) {
  const filteredSamples = filterSamplesByEndTime(samples, endTime);

  if (!filteredSamples.length) {
    return {
      startTime: null,
      startTimeIso: null,
      endTime: null,
      endTimeIso: null,
      durationMs: 0,
      sampleCount: 0,
      peakVoc: null,
      peakDelta: 0,
      avgVoc: null,
      avgDelta: 0,
      exposureScore: 0,
    };
  }

  const startTime = filteredSamples[0].timestamp;
  const effectiveEndTime = endTime ?? filteredSamples[filteredSamples.length - 1].timestamp;
  let vocSum = 0;
  let deltaSum = 0;
  let peakVoc = filteredSamples[0].voc;
  let peakDelta = Number(filteredSamples[0].levelDelta ?? filteredSamples[0].delta ?? 0);
  let exposureScore = 0;

  for (let index = 0; index < filteredSamples.length; index += 1) {
    const sample = filteredSamples[index];
    const sampleDelta = Number(sample.levelDelta ?? sample.delta ?? 0);

    vocSum += sample.voc;
    deltaSum += sampleDelta;
    peakVoc = Math.max(peakVoc, sample.voc);
    peakDelta = Math.max(peakDelta, sampleDelta);

    if (index > 0) {
      const previousSample = filteredSamples[index - 1];
      const previousDelta = Number(previousSample.levelDelta ?? previousSample.delta ?? 0);
      const dtMs = Math.max(0, sample.timestamp - previousSample.timestamp);
      exposureScore += Math.max(0, previousDelta) * (dtMs / ONE_SECOND_MS);
    }
  }

  return {
    startTime,
    startTimeIso: toIso(startTime),
    endTime: effectiveEndTime,
    endTimeIso: toIso(effectiveEndTime),
    durationMs: Math.max(0, effectiveEndTime - startTime),
    sampleCount: filteredSamples.length,
    peakVoc,
    peakDelta: round(peakDelta),
    avgVoc: round(vocSum / filteredSamples.length),
    avgDelta: round(deltaSum / filteredSamples.length),
    exposureScore: round(exposureScore, 3),
  };
}

function summarizeFragmentDurations(fragments) {
  return fragments.reduce((total, fragment) => total + Number(fragment.durationMs || 0), 0);
}

function buildFragmentRecord(fragment, status = 'completed', options = {}) {
  const endTime = options.endTime ?? fragment.endTime ?? null;
  const metrics = summarizeSamples(fragment.samples, endTime);

  return {
    id: fragment.id,
    sessionId: options.sessionId ?? fragment.sessionId ?? null,
    status,
    startTime: metrics.startTime,
    startTimeIso: metrics.startTimeIso,
    endTime: metrics.endTime,
    endTimeIso: metrics.endTimeIso,
    durationMs: metrics.durationMs,
    sampleCount: metrics.sampleCount,
    peakVoc: metrics.peakVoc,
    peakDelta: metrics.peakDelta,
    avgVoc: metrics.avgVoc,
    avgDelta: metrics.avgDelta,
    exposureScore: metrics.exposureScore,
    fragmentCount: 1,
    burstDurationMs: metrics.durationMs,
  };
}

function buildSessionSummary(session, status = 'completed', endTimeOverride = null) {
  const endTime = endTimeOverride ?? session.lastFragmentEndTime ?? null;
  const metrics = summarizeSamples(session.samples, endTime);

  return {
    id: session.id,
    status,
    startTime: metrics.startTime,
    startTimeIso: metrics.startTimeIso,
    endTime: metrics.endTime,
    endTimeIso: metrics.endTimeIso,
    durationMs: metrics.durationMs,
    sampleCount: metrics.sampleCount,
    peakVoc: metrics.peakVoc,
    peakDelta: metrics.peakDelta,
    avgVoc: metrics.avgVoc,
    avgDelta: metrics.avgDelta,
    exposureScore: metrics.exposureScore,
    fragmentCount: session.fragments.length,
    burstDurationMs: summarizeFragmentDurations(session.fragments),
    mergeDeadline: session.mergeDeadline ?? null,
    mergeDeadlineIso: toIso(session.mergeDeadline),
  };
}

function buildSessionDetail(session, status = 'completed', endTimeOverride = null) {
  const summary = buildSessionSummary(session, status, endTimeOverride);
  const filteredSamples = filterSamplesByEndTime(session.samples, summary.endTime);

  return {
    ...summary,
    samples: filteredSamples.map(cloneSample),
    fragments: session.fragments.map(cloneFragment),
  };
}

function upsertEventDetail(details, detail, limit) {
  const nextDetails = details.filter((item) => item.id !== detail.id);
  nextDetails.push(detail);
  return nextDetails.slice(-limit);
}

function buildInitialState(config) {
  return {
    config,
    summary: buildEmptySummary(),
    recentEvents: [],
    recentEventDetails: [],
    currentSession: null,
    activeFragment: null,
    pendingFragmentSamples: [],
    activeFragmentCalmCount: 0,
    activeFragmentCalmSince: null,
    baselineHistory: [],
    rangeWindow: [],
    lastProcessedAt: null,
    signals: buildEmptySignals(),
  };
}

function sanitizeSummary(summary) {
  return {
    totalEventCount: Number(summary?.totalEventCount || 0),
    totalEventDurationMs: Number(summary?.totalEventDurationMs || 0),
    totalExposureScore: Number(summary?.totalExposureScore || 0),
  };
}

function restoreSignals(state) {
  const lastSample = state.currentSession?.samples?.[state.currentSession.samples.length - 1]
    || state.activeFragment?.samples?.[state.activeFragment.samples.length - 1]
    || null;

  if (!lastSample) {
    state.signals = buildEmptySignals();
    return;
  }

  state.signals = {
    fastSignal: lastSample.fastSignal ?? lastSample.voc ?? null,
    baseline: lastSample.baseline ?? null,
    range: round(Number(lastSample.range ?? 0)),
    delta: round(Number(lastSample.delta ?? lastSample.levelDelta ?? 0)),
    levelDelta: round(Number(lastSample.levelDelta ?? lastSample.delta ?? 0)),
    isBurstHigh: Boolean(lastSample.isBurstHigh),
    isCalm: Boolean(lastSample.isCalm),
    updatedAt: lastSample.timestamp ?? null,
    updatedAtIso: toIso(lastSample.timestamp ?? null),
  };
  state.lastProcessedAt = lastSample.timestamp ?? null;
}

function createPendingSessionFromFragment(fragment, config) {
  const fragmentRecord = buildFragmentRecord(fragment, 'completed');

  return {
    id: createEventId(fragmentRecord.startTime),
    startTime: fragmentRecord.startTime,
    samples: fragment.samples.map(cloneSample),
    fragments: [{ ...fragmentRecord, status: 'completed' }],
    lastFragmentEndTime: fragmentRecord.endTime,
    mergeDeadline: Number(fragmentRecord.endTime || 0) + config.mergeGapMs,
  };
}

function applyPersistedState(state, persistedStore) {
  if (!persistedStore) {
    return state;
  }

  state.summary = sanitizeSummary(persistedStore.summary);
  state.recentEvents = Array.isArray(persistedStore.recentEvents)
    ? persistedStore.recentEvents.slice(-state.config.recentEventLimit)
    : [];
  state.recentEventDetails = Array.isArray(persistedStore.recentEventDetails)
    ? persistedStore.recentEventDetails.slice(-state.config.recentEventDetailLimit)
    : [];

  let restoredSession = cloneSession(persistedStore.currentSession);
  const restoredActiveFragment = persistedStore.activeFragment
    ? {
        ...persistedStore.activeFragment,
        samples: Array.isArray(persistedStore.activeFragment.samples)
          ? persistedStore.activeFragment.samples.map(cloneSample)
          : [],
      }
    : null;

  if (restoredActiveFragment?.samples?.length) {
    const fragmentEndTime = restoredActiveFragment.samples[restoredActiveFragment.samples.length - 1].timestamp;
    const pendingSession = createPendingSessionFromFragment(
      {
        id: restoredActiveFragment.id,
        sessionId: restoredSession?.id ?? null,
        samples: restoredActiveFragment.samples,
        endTime: fragmentEndTime,
      },
      state.config,
    );

    if (restoredSession) {
      restoredSession.samples = restoredSession.samples.length
        ? restoredSession.samples
        : pendingSession.samples;
      restoredSession.fragments = [...restoredSession.fragments, ...pendingSession.fragments];
      restoredSession.lastFragmentEndTime = pendingSession.lastFragmentEndTime;
      restoredSession.mergeDeadline = pendingSession.mergeDeadline;
    } else {
      restoredSession = pendingSession;
    }
  }

  if (restoredSession?.samples?.length && restoredSession.lastFragmentEndTime) {
    if (restoredSession.mergeDeadline !== null && restoredSession.mergeDeadline <= Date.now()) {
      const summary = buildSessionSummary(restoredSession, 'completed');
      const detail = buildSessionDetail(restoredSession, 'completed');
      state.recentEvents = [...state.recentEvents, summary].slice(-state.config.recentEventLimit);
      state.recentEventDetails = upsertEventDetail(
        state.recentEventDetails,
        detail,
        state.config.recentEventDetailLimit,
      );
      state.summary.totalEventCount += 1;
      state.summary.totalEventDurationMs += summary.durationMs;
      state.summary.totalExposureScore = round(
        state.summary.totalExposureScore + summary.exposureScore,
        3,
      );
    } else {
      state.currentSession = restoredSession;
    }
  }

  if (state.currentSession?.samples?.length) {
    state.baselineHistory = state.currentSession.samples
      .slice(-state.config.baselineWindowSamples)
      .map((sample) => Number(sample.voc));
    state.rangeWindow = state.currentSession.samples
      .slice(-state.config.rangeWindowSamples)
      .map((sample) => Number(sample.voc));
  }

  restoreSignals(state);
  return state;
}

export function getEventConfigFromEnv(env = process.env) {
  return {
    sampleIntervalMs: toNumber(env.EVENT_SAMPLE_INTERVAL_MS, DEFAULT_EVENT_CONFIG.sampleIntervalMs),
    baselineWindowSamples: toNumber(
      env.EVENT_BASELINE_WINDOW_SAMPLES,
      DEFAULT_EVENT_CONFIG.baselineWindowSamples,
    ),
    rangeWindowSamples: toNumber(
      env.EVENT_RANGE_WINDOW_SAMPLES,
      DEFAULT_EVENT_CONFIG.rangeWindowSamples,
    ),
    fragmentEnterDelta: toNumber(
      env.EVENT_FRAGMENT_ENTER_DELTA,
      DEFAULT_EVENT_CONFIG.fragmentEnterDelta,
    ),
    fragmentEnterRange: toNumber(
      env.EVENT_FRAGMENT_ENTER_RANGE,
      DEFAULT_EVENT_CONFIG.fragmentEnterRange,
    ),
    fragmentStartConfirmSamples: toNumber(
      env.EVENT_FRAGMENT_START_CONFIRM_SAMPLES,
      DEFAULT_EVENT_CONFIG.fragmentStartConfirmSamples,
    ),
    fragmentCalmRange: toNumber(
      env.EVENT_FRAGMENT_CALM_RANGE,
      DEFAULT_EVENT_CONFIG.fragmentCalmRange,
    ),
    fragmentEndConfirmSamples: toNumber(
      env.EVENT_FRAGMENT_END_CONFIRM_SAMPLES,
      DEFAULT_EVENT_CONFIG.fragmentEndConfirmSamples,
    ),
    mergeGapMs: toNumber(env.EVENT_MERGE_GAP_MS, DEFAULT_EVENT_CONFIG.mergeGapMs),
    recentEventLimit: toNumber(env.EVENT_RECENT_EVENT_LIMIT, DEFAULT_EVENT_CONFIG.recentEventLimit),
    recentEventDetailLimit: toNumber(
      env.EVENT_RECENT_EVENT_DETAIL_LIMIT,
      DEFAULT_EVENT_CONFIG.recentEventDetailLimit,
    ),
  };
}

export class EventDetector {
  constructor(config, persistedStore = null) {
    this.config = config;
    this.state = applyPersistedState(buildInitialState(config), persistedStore);
  }

  appendRecentEvent(summary, detail) {
    this.state.recentEvents = [
      ...this.state.recentEvents.filter((item) => item.id !== summary.id),
      summary,
    ].slice(-this.config.recentEventLimit);

    this.state.recentEventDetails = upsertEventDetail(
      this.state.recentEventDetails,
      detail,
      this.config.recentEventDetailLimit,
    );
  }

  resetPendingFragment() {
    this.state.pendingFragmentSamples = [];
  }

  resetActiveFragmentCalm() {
    this.state.activeFragmentCalmCount = 0;
    this.state.activeFragmentCalmSince = null;
  }

  getCurrentSessionDurationMs() {
    if (!this.state.currentSession) {
      return 0;
    }

    const endTime = this.state.activeFragment?.samples?.[this.state.activeFragment.samples.length - 1]?.timestamp
      ?? this.state.currentSession.lastFragmentEndTime
      ?? this.state.currentSession.startTime;

    return Math.max(0, Number(endTime || 0) - Number(this.state.currentSession.startTime || 0));
  }

  beginFragment() {
    if (!this.state.pendingFragmentSamples.length) {
      return null;
    }

    const fragmentSamples = this.state.pendingFragmentSamples.map(cloneSample);
    const startTime = fragmentSamples[0].timestamp;

    if (!this.state.currentSession) {
      this.state.currentSession = {
        id: createEventId(startTime),
        startTime,
        samples: fragmentSamples.map(cloneSample),
        fragments: [],
        lastFragmentEndTime: null,
        mergeDeadline: null,
      };
    } else {
      this.state.currentSession.mergeDeadline = null;
    }

    this.state.activeFragment = {
      id: createFragmentId(startTime),
      sessionId: this.state.currentSession.id,
      startTime,
      samples: fragmentSamples,
    };
    this.resetPendingFragment();
    this.resetActiveFragmentCalm();
    return this.getActiveEvent();
  }

  finishActiveFragment(endTime) {
    if (!this.state.activeFragment || !this.state.currentSession) {
      return null;
    }

    const fragmentRecord = buildFragmentRecord(
      {
        ...this.state.activeFragment,
        endTime,
      },
      'completed',
      {
        endTime,
        sessionId: this.state.currentSession.id,
      },
    );

    this.state.currentSession.fragments.push(fragmentRecord);
    this.state.currentSession.lastFragmentEndTime = fragmentRecord.endTime;
    this.state.currentSession.mergeDeadline = Number(fragmentRecord.endTime || 0) + this.config.mergeGapMs;
    this.state.activeFragment = null;
    this.resetActiveFragmentCalm();
    return fragmentRecord;
  }

  finalizeCurrentSession() {
    if (!this.state.currentSession || !this.state.currentSession.fragments.length) {
      this.state.currentSession = null;
      return null;
    }

    const summary = buildSessionSummary(this.state.currentSession, 'completed');
    const detail = buildSessionDetail(this.state.currentSession, 'completed');

    this.state.summary.totalEventCount += 1;
    this.state.summary.totalEventDurationMs += summary.durationMs;
    this.state.summary.totalExposureScore = round(
      this.state.summary.totalExposureScore + summary.exposureScore,
      3,
    );

    this.appendRecentEvent(summary, detail);
    this.state.currentSession = null;
    return summary;
  }

  flush(referenceTime = Date.now()) {
    if (
      this.state.currentSession
      && !this.state.activeFragment
      && this.state.currentSession.mergeDeadline !== null
      && referenceTime >= this.state.currentSession.mergeDeadline
    ) {
      return this.finalizeCurrentSession();
    }

    return null;
  }

  process(reading) {
    const timestamp = reading.realTimestamp || reading.receivedAt;
    const timestampIso = reading.realTimestampIso || toIso(timestamp);

    this.flush(timestamp);

    const baseline = this.state.baselineHistory.length
      ? calculateMedian(this.state.baselineHistory)
      : reading.voc;
    const nextRangeWindow = pushToWindow(
      this.state.rangeWindow,
      reading.voc,
      this.config.rangeWindowSamples,
    );
    const range = calculateRange(nextRangeWindow);
    const levelDelta = Number(reading.voc) - Number(baseline);
    const isBurstHigh = levelDelta >= this.config.fragmentEnterDelta
      && range >= this.config.fragmentEnterRange;
    const isCalm = range < this.config.fragmentCalmRange;

    this.state.signals = {
      fastSignal: round(reading.voc),
      baseline: round(baseline),
      range: round(range),
      delta: round(levelDelta),
      levelDelta: round(levelDelta),
      isBurstHigh,
      isCalm,
      updatedAt: timestamp,
      updatedAtIso: timestampIso,
    };

    const processedReading = {
      ...reading,
      timestamp,
      timestampIso,
      fastSignal: round(reading.voc),
      baseline: round(baseline),
      range: round(range),
      delta: round(levelDelta),
      levelDelta: round(levelDelta),
      isBurstHigh,
      isCalm,
    };

    if (this.state.currentSession) {
      this.state.currentSession.samples.push(cloneSample(processedReading));
    }

    if (this.state.activeFragment) {
      this.state.activeFragment.samples.push(cloneSample(processedReading));

      if (isCalm) {
        if (this.state.activeFragmentCalmCount === 0) {
          this.state.activeFragmentCalmSince = timestamp;
        }

        this.state.activeFragmentCalmCount += 1;
        if (this.state.activeFragmentCalmCount >= this.config.fragmentEndConfirmSamples) {
          this.finishActiveFragment(this.state.activeFragmentCalmSince);
        }
      } else {
        this.resetActiveFragmentCalm();
      }
    } else if (isBurstHigh) {
      this.state.pendingFragmentSamples = [
        ...this.state.pendingFragmentSamples,
        cloneSample(processedReading),
      ].slice(-this.config.fragmentStartConfirmSamples);

      if (this.state.pendingFragmentSamples.length >= this.config.fragmentStartConfirmSamples) {
        this.beginFragment();
      }
    } else {
      this.resetPendingFragment();
    }

    this.state.baselineHistory = pushToWindow(
      this.state.baselineHistory,
      reading.voc,
      this.config.baselineWindowSamples,
    );
    this.state.rangeWindow = nextRangeWindow;
    this.state.lastProcessedAt = timestamp;
    return processedReading;
  }

  getSignals() {
    return {
      ...this.state.signals,
      fastSignal: this.state.signals.fastSignal === null ? null : round(this.state.signals.fastSignal),
      baseline: this.state.signals.baseline === null ? null : round(this.state.signals.baseline),
      range: round(this.state.signals.range),
      delta: round(this.state.signals.delta),
      levelDelta: round(this.state.signals.levelDelta),
    };
  }

  getSummary() {
    return {
      ...sanitizeSummary(this.state.summary),
      activeEventCount: this.state.activeFragment ? 1 : 0,
      pendingMergeCount: this.state.currentSession && !this.state.activeFragment ? 1 : 0,
      recentEventCount: this.state.recentEvents.length,
      currentSessionDurationMs: this.getCurrentSessionDurationMs(),
    };
  }

  getActiveEvent() {
    if (!this.state.activeFragment) {
      return null;
    }

    const endTime = this.state.activeFragment.samples[this.state.activeFragment.samples.length - 1]?.timestamp
      ?? null;

    return buildFragmentRecord(this.state.activeFragment, 'active', {
      endTime,
      sessionId: this.state.currentSession?.id ?? null,
    });
  }

  getPendingMergeEvent() {
    if (!this.state.currentSession || this.state.activeFragment || !this.state.currentSession.fragments.length) {
      return null;
    }

    return buildSessionSummary(this.state.currentSession, 'pending_merge');
  }

  getCurrentSessionEvent() {
    if (
      !this.state.currentSession
      || (!this.state.currentSession.fragments.length && !this.state.activeFragment)
    ) {
      return null;
    }

    const status = this.state.activeFragment ? 'active_session' : 'pending_merge';
    const endTime = this.state.activeFragment?.samples?.[this.state.activeFragment.samples.length - 1]?.timestamp
      ?? this.state.currentSession.lastFragmentEndTime
      ?? null;

    return buildSessionSummary(this.state.currentSession, status, endTime);
  }

  getActiveEventDetail() {
    if (!this.state.activeFragment) {
      return null;
    }

    const endTime = this.state.activeFragment.samples[this.state.activeFragment.samples.length - 1]?.timestamp
      ?? null;
    const summary = buildFragmentRecord(this.state.activeFragment, 'active', {
      endTime,
      sessionId: this.state.currentSession?.id ?? null,
    });

    return {
      ...summary,
      samples: filterSamplesByEndTime(this.state.activeFragment.samples, endTime).map(cloneSample),
    };
  }

  getCurrentSessionDetail() {
    const currentSessionEvent = this.getCurrentSessionEvent();

    if (!currentSessionEvent) {
      return null;
    }

    return buildSessionDetail(this.state.currentSession, currentSessionEvent.status, currentSessionEvent.endTime);
  }

  getRecentEvents(limit = 50) {
    return this.state.recentEvents.slice(-limit).reverse();
  }

  getEventDetail(id) {
    if (!id) {
      return null;
    }

    if (this.state.activeFragment?.id === id) {
      return this.getActiveEventDetail();
    }

    if (this.state.currentSession?.id === id) {
      return this.getCurrentSessionDetail();
    }

    return this.state.recentEventDetails.find((detail) => detail.id === id) || null;
  }

  getPersistedState() {
    return {
      config: { ...this.config },
      summary: sanitizeSummary(this.state.summary),
      recentEvents: this.state.recentEvents,
      recentEventDetails: this.state.recentEventDetails,
      currentSession: cloneSession(this.state.currentSession),
      activeFragment: this.state.activeFragment
        ? {
            ...this.state.activeFragment,
            samples: this.state.activeFragment.samples.map(cloneSample),
          }
        : null,
      persistedAt: Date.now(),
      persistedAtIso: toIso(Date.now()),
    };
  }
}

export function createEventDetector(config, persistedStore = null) {
  return new EventDetector(config, persistedStore);
}

export function replayReadings(readings, config, persistedStore = null) {
  const detector = createEventDetector(config, persistedStore);
  const processedReadings = readings.map((reading) => detector.process(reading));

  return {
    detector,
    processedReadings,
    summary: detector.getSummary(),
    recentEvents: detector.getRecentEvents(config.recentEventLimit),
    activeEvent: detector.getActiveEvent(),
    pendingMergeEvent: detector.getPendingMergeEvent(),
  };
}
