import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_EVENT_CONFIG,
  getEventConfigFromEnv,
  replayReadings,
} from '../server/eventDetection.js';

function parseTimestamp(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function parseInputFile(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8').trim();

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function normalizeReadings(data) {
  const source = Array.isArray(data)
    ? data
    : Array.isArray(data?.readings)
      ? data.readings
      : Array.isArray(data?.points)
        ? data.points
        : [];

  return source
    .map((item, index) => {
      const normalizedItem = typeof item === 'number' ? { voc: item } : item;
      const fallbackTime = index * DEFAULT_EVENT_CONFIG.sampleIntervalMs;
      const realTimestamp = parseTimestamp(
        normalizedItem.realTimestamp
          ?? normalizedItem.receivedAt
          ?? normalizedItem.timestamp
          ?? normalizedItem.realTimestampIso
          ?? normalizedItem.time,
        fallbackTime,
      );

      return {
        voc: Number(normalizedItem.voc),
        temperature: Number(normalizedItem.temperature ?? 0),
        humidity: Number(normalizedItem.humidity ?? 0),
        deviceTime: Number(normalizedItem.time ?? normalizedItem.deviceTime ?? fallbackTime),
        receivedAt: realTimestamp,
        realTimestamp,
        realTimestampIso: new Date(realTimestamp).toISOString(),
      };
    })
    .filter((item) => Number.isFinite(item.voc))
    .sort((left, right) => left.realTimestamp - right.realTimestamp);
}

function finalizeReplay(detector, readings, config) {
  if (!readings.length) {
    return {
      summary: detector.getSummary(),
      activeEvent: detector.getActiveEvent(),
      pendingMergeEvent: detector.getPendingMergeEvent(),
      recentEvents: detector.getRecentEvents(config.recentEventLimit),
    };
  }

  const finalTimestamp = readings[readings.length - 1].realTimestamp
    + config.mergeGapMs
    + config.sampleIntervalMs;
  detector.flush(finalTimestamp);

  return {
    summary: detector.getSummary(),
    activeEvent: detector.getActiveEvent(),
    pendingMergeEvent: detector.getPendingMergeEvent(),
    recentEvents: detector.getRecentEvents(config.recentEventLimit),
  };
}

function compareParameterCombos(readings, baseConfig) {
  const combos = [
    { ...baseConfig, fragmentEnterDelta: 22 },
    { ...baseConfig, fragmentEnterDelta: 25 },
    { ...baseConfig, fragmentEnterDelta: 28 },
    { ...baseConfig, fragmentEnterRange: 24 },
    { ...baseConfig, fragmentEnterRange: 30 },
    { ...baseConfig, fragmentEnterRange: 36 },
    { ...baseConfig, mergeGapMs: 10 * 60 * 1000 },
    { ...baseConfig, mergeGapMs: 15 * 60 * 1000 },
    { ...baseConfig, mergeGapMs: 20 * 60 * 1000 },
  ];

  return combos.map((config) => {
    const result = replayReadings(readings, config);
    const finalized = finalizeReplay(result.detector, readings, config);
    return {
      fragmentEnterDelta: config.fragmentEnterDelta,
      fragmentEnterRange: config.fragmentEnterRange,
      fragmentStartConfirmSamples: config.fragmentStartConfirmSamples,
      fragmentCalmRange: config.fragmentCalmRange,
      fragmentEndConfirmSamples: config.fragmentEndConfirmSamples,
      mergeGapMs: config.mergeGapMs,
      totalEventCount: finalized.summary.totalEventCount,
      totalEventDurationMs: finalized.summary.totalEventDurationMs,
      totalExposureScore: finalized.summary.totalExposureScore,
      pendingMergeEvent: finalized.pendingMergeEvent,
      recentEvents: finalized.recentEvents,
    };
  });
}

const [, , inputPath, compareFlag] = process.argv;

if (!inputPath) {
  console.error('Usage: node scripts/replay-events.js <json-file> [--compare]');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), inputPath);
const data = parseInputFile(resolvedPath);
const readings = normalizeReadings(data);
const config = {
  ...DEFAULT_EVENT_CONFIG,
  ...getEventConfigFromEnv(process.env),
};

const result = replayReadings(readings, config);
const finalizedResult = finalizeReplay(result.detector, readings, config);

console.log(JSON.stringify({
  source: resolvedPath,
  sampleCount: readings.length,
  config,
  summary: finalizedResult.summary,
  activeEvent: finalizedResult.activeEvent,
  pendingMergeEvent: finalizedResult.pendingMergeEvent,
  recentEvents: finalizedResult.recentEvents,
  parameterComparisons: compareFlag === '--compare'
    ? compareParameterCombos(readings, config)
    : [],
}, null, 2));
