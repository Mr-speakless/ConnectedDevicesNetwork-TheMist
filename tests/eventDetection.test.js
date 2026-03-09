import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEventDetector, DEFAULT_EVENT_CONFIG } from '../server/eventDetection.js';
import { acknowledgeClean, buildCleanState, DEFAULT_CLEAN_CONFIG } from '../server/cleanState.js';
import { readEventStore, writeEventStore } from '../server/eventStore.js';

const STEP_MS = DEFAULT_EVENT_CONFIG.sampleIntervalMs;
const FIXTURE_PATH = new URL('./log0223Evening.json', import.meta.url);

function createReading(voc, timestamp, overrides = {}) {
  return {
    voc,
    temperature: 25,
    humidity: 50,
    deviceTime: timestamp,
    receivedAt: timestamp,
    realTimestamp: timestamp,
    realTimestampIso: new Date(timestamp).toISOString(),
    ...overrides,
  };
}

function createSequence(values, startMs = 0, stepMs = STEP_MS) {
  return values.map((voc, index) => createReading(voc, startMs + index * stepMs));
}

function feedReadings(detector, readings) {
  readings.forEach((reading) => {
    detector.process(reading);
  });
}

function loadFixtureReadings() {
  return fs
    .readFileSync(FIXTURE_PATH, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((item) => createReading(item.voc, Number(item.time), {
      temperature: Number(item.temperature),
      humidity: Number(item.humidity),
      deviceTime: Number(item.time),
    }));
}

function buildBurstPattern(startMs, gapSamples = 20) {
  const prelude = createSequence(new Array(12).fill(40), startMs);
  const fragment = createSequence([80, 120, 100, 90, 70, 60, 55, 50, 49], prelude[prelude.length - 1].timestamp + STEP_MS);
  const gapStart = fragment[fragment.length - 1].timestamp + STEP_MS;
  const gap = createSequence(new Array(gapSamples).fill(45), gapStart);
  return [...prelude, ...fragment, ...gap];
}

test('merges the 0223 evening cooking fragments into one completed session', () => {
  const detector = createEventDetector(DEFAULT_EVENT_CONFIG);
  const readings = loadFixtureReadings();

  feedReadings(detector, readings);
  detector.flush(readings[readings.length - 1].timestamp + DEFAULT_EVENT_CONFIG.mergeGapMs + STEP_MS);

  const recentEvents = detector.getRecentEvents(10);
  assert.equal(recentEvents.length, 1);

  const mergedEvent = recentEvents[0];
  assert.equal(mergedEvent.startTime, 783444);
  assert.equal(mergedEvent.endTime, 1527495);
  assert.equal(mergedEvent.fragmentCount, 4);

  const detail = detector.getEventDetail(mergedEvent.id);
  assert.ok(detail);
  assert.equal(detail.fragments.length, 4);
  assert.ok(detail.fragments.every((fragment) => fragment.startTime < 2_000_000));
});

test('merges two burst fragments into one event when the gap is shorter than 15 minutes', () => {
  const detector = createEventDetector(DEFAULT_EVENT_CONFIG);
  const firstPattern = buildBurstPattern(0, 20);
  const secondStart = firstPattern[firstPattern.length - 1].timestamp + STEP_MS;
  const secondFragment = createSequence([82, 124, 104, 92, 72, 60, 54, 51, 50], secondStart);
  const readings = [...firstPattern, ...secondFragment];

  feedReadings(detector, readings);
  detector.flush(readings[readings.length - 1].timestamp + DEFAULT_EVENT_CONFIG.mergeGapMs + STEP_MS);

  const recentEvents = detector.getRecentEvents(10);
  assert.equal(recentEvents.length, 1);
  assert.equal(recentEvents[0].fragmentCount, 2);
});

test('splits two burst fragments into separate events when the gap is longer than 15 minutes', () => {
  const detector = createEventDetector(DEFAULT_EVENT_CONFIG);
  const firstPattern = buildBurstPattern(0, 70);
  const secondStart = firstPattern[firstPattern.length - 1].timestamp + STEP_MS;
  const secondFragment = createSequence([82, 124, 104, 92, 72, 60, 54, 51, 50], secondStart);
  const readings = [...firstPattern, ...secondFragment];

  feedReadings(detector, readings);
  detector.flush(readings[readings.length - 1].timestamp + DEFAULT_EVENT_CONFIG.mergeGapMs + STEP_MS);

  const recentEvents = detector.getRecentEvents(10);
  assert.equal(recentEvents.length, 2);
});

test('keeps a finished session in pending_merge before the 15 minute window expires', () => {
  const detector = createEventDetector(DEFAULT_EVENT_CONFIG);
  const readings = buildBurstPattern(0, 5);

  feedReadings(detector, readings);

  assert.ok(detector.getPendingMergeEvent());
  assert.equal(detector.getRecentEvents(10).length, 0);

  detector.flush(readings[readings.length - 1].timestamp + DEFAULT_EVENT_CONFIG.mergeGapMs + STEP_MS);

  assert.equal(detector.getPendingMergeEvent(), null);
  assert.equal(detector.getRecentEvents(10).length, 1);
});

test('restores a pending_merge session from persisted state and finalizes it after the merge window', () => {
  const origin = Date.now() - 60 * 1000;
  const detector = createEventDetector(DEFAULT_EVENT_CONFIG);
  const readings = buildBurstPattern(origin, 5);

  feedReadings(detector, readings);
  const persisted = detector.getPersistedState();

  const restored = createEventDetector(DEFAULT_EVENT_CONFIG, persisted);
  assert.ok(restored.getPendingMergeEvent());

  restored.flush(readings[readings.length - 1].timestamp + DEFAULT_EVENT_CONFIG.mergeGapMs + STEP_MS);

  assert.equal(restored.getPendingMergeEvent(), null);
  assert.equal(restored.getRecentEvents(10).length, 1);
});

test('builds clean state from completed duration and current in-progress duration', () => {
  const summary = {
    totalEventCount: 2,
    totalEventDurationMs: 55 * 60 * 1000,
    totalExposureScore: 0,
  };
  const persistedCleanState = acknowledgeClean(20 * 60 * 1000, 1_000);

  const cleanState = buildCleanState(summary, 35 * 60 * 1000, persistedCleanState, DEFAULT_CLEAN_CONFIG);

  assert.equal(cleanState.cleanDurationMs, 70 * 60 * 1000);
  assert.equal(cleanState.cleanStatus, 'Clean now');
});

test('writes and reads the persisted event store JSON with pending merge state', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-store-test-'));
  const filepath = path.join(tempDir, 'event-store.json');
  const payload = {
    summary: { totalEventCount: 3, totalEventDurationMs: 12000, totalExposureScore: 42.5 },
    recentEvents: [{ id: 'evt_1', status: 'completed' }],
    recentEventDetails: [{ id: 'evt_1', samples: [{ voc: 100 }] }],
    cleanState: { lastCleanedAt: 1000, baselineEventDurationMs: 5000 },
    currentSession: {
      id: 'evt_2',
      startTime: 2000,
      samples: [{ timestamp: 2000, voc: 120 }],
      fragments: [{ id: 'frag_2', startTime: 2000, endTime: 3000, durationMs: 1000 }],
      lastFragmentEndTime: 3000,
      mergeDeadline: 903000,
    },
    activeFragment: null,
  };

  writeEventStore(filepath, payload);
  const restored = readEventStore(filepath);

  assert.deepEqual(restored, payload);
});
