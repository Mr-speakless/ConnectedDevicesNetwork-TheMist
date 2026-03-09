import http from 'node:http';
import { URL } from 'node:url';
import mqtt from 'mqtt';
import {
  createEventDetector,
  DEFAULT_EVENT_CONFIG,
  getEventConfigFromEnv,
} from './server/eventDetection.js';
import {
  DEFAULT_CLEAN_CONFIG,
  acknowledgeClean,
  buildCleanState,
  getCleanConfigFromEnv,
  getInitialCleanState,
} from './server/cleanState.js';
import {
  getEventStorePath,
  readEventStore,
  writeEventStore,
} from './server/eventStore.js';

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://tigoe.net:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'TheMist';
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'conndev';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'b4s1l!';

const PORT = Number(process.env.PORT || 3001);
const DEFAULT_CHART_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_BUFFER_SIZE = 100000;
const DEFAULT_MAX_CHART_POINTS = 1440;
const WINDOW_MS = Number(process.env.CHART_WINDOW_MS || DEFAULT_CHART_WINDOW_MS);
const MAX_BUFFER_SIZE = Number(process.env.MAX_BUFFER_SIZE || DEFAULT_MAX_BUFFER_SIZE);
const MAX_CHART_POINTS = Number(process.env.MAX_CHART_POINTS || DEFAULT_MAX_CHART_POINTS);
const ACTIVE_EVENT_PERSIST_INTERVAL_MS = 5000;
const EVENT_CONFIG = {
  ...DEFAULT_EVENT_CONFIG,
  ...getEventConfigFromEnv(process.env),
};
const CLEAN_CONFIG = {
  ...DEFAULT_CLEAN_CONFIG,
  ...getCleanConfigFromEnv(process.env),
};
const EVENT_STORE_PATH = getEventStorePath(process.env);

function sanitizePersistedReading(reading) {
  if (!reading || typeof reading !== 'object') {
    return null;
  }

  const receivedAt = Number(reading.receivedAt ?? reading.timestamp);
  const voc = Number(reading.voc);
  const temperature = Number(reading.temperature);
  const humidity = Number(reading.humidity);
  const deviceTime = Number(reading.deviceTime);
  const realTimestamp = Number(reading.realTimestamp ?? receivedAt);

  if (
    !Number.isFinite(receivedAt)
    || !Number.isFinite(voc)
    || !Number.isFinite(temperature)
    || !Number.isFinite(humidity)
    || !Number.isFinite(deviceTime)
    || !Number.isFinite(realTimestamp)
  ) {
    return null;
  }

  return {
    voc,
    temperature,
    humidity,
    deviceTime,
    receivedAt,
    realTimestamp,
    realTimestampIso: reading.realTimestampIso || new Date(realTimestamp).toISOString(),
    timestamp: Number.isFinite(Number(reading.timestamp)) ? Number(reading.timestamp) : receivedAt,
    timestampIso: reading.timestampIso || new Date(receivedAt).toISOString(),
    fastSignal: Number.isFinite(Number(reading.fastSignal)) ? Number(reading.fastSignal) : undefined,
    baseline: Number.isFinite(Number(reading.baseline)) ? Number(reading.baseline) : undefined,
    delta: Number.isFinite(Number(reading.delta)) ? Number(reading.delta) : undefined,
    levelDelta: Number.isFinite(Number(reading.levelDelta)) ? Number(reading.levelDelta) : undefined,
    range: Number.isFinite(Number(reading.range)) ? Number(reading.range) : undefined,
    isBurstHigh: Boolean(reading.isBurstHigh),
    isCalm: Boolean(reading.isCalm),
  };
}

function restorePersistedReadings(store) {
  if (!Array.isArray(store?.readings)) {
    return [];
  }

  return store.readings
    .map(sanitizePersistedReading)
    .filter(Boolean)
    .sort((left, right) => left.receivedAt - right.receivedAt)
    .slice(-MAX_BUFFER_SIZE);
}

const persistedStore = readEventStore(EVENT_STORE_PATH);
const readings = restorePersistedReadings(persistedStore);
let mqttConnected = false;
let lastMessageAt = Number(
  persistedStore?.lastMessageAt
    ?? readings[readings.length - 1]?.receivedAt
    ?? null,
) || null;
let lastEventPersistAt = 0;
const eventDetector = createEventDetector(EVENT_CONFIG, persistedStore);
let persistedCleanState = persistedStore?.cleanState || getInitialCleanState();

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function pruneReadings() {
  const cutoff = Date.now() - WINDOW_MS;

  while (readings.length > MAX_BUFFER_SIZE) {
    readings.shift();
  }

  while (readings.length > 0 && readings[0].receivedAt < cutoff && readings.length > MAX_CHART_POINTS) {
    readings.shift();
  }
}

function getCleanState() {
  syncEventDetector(Date.now());
  return buildCleanState(
    eventDetector.getSummary(),
    eventDetector.getCurrentSessionDurationMs(),
    persistedCleanState,
    CLEAN_CONFIG,
  );
}

function buildPersistedState() {
  return {
    ...eventDetector.getPersistedState(),
    cleanState: persistedCleanState,
    lastMessageAt,
    lastMessageAtIso: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
    readings: readings.map((reading) => ({
      voc: reading.voc,
      temperature: reading.temperature,
      humidity: reading.humidity,
      deviceTime: reading.deviceTime,
      receivedAt: reading.receivedAt,
      realTimestamp: reading.realTimestamp,
      realTimestampIso: reading.realTimestampIso,
      timestamp: reading.timestamp,
      timestampIso: reading.timestampIso,
      fastSignal: reading.fastSignal,
      baseline: reading.baseline,
      delta: reading.delta,
      levelDelta: reading.levelDelta,
      range: reading.range,
      isBurstHigh: reading.isBurstHigh,
      isCalm: reading.isCalm,
    })),
  };
}

function persistEventState(force = false) {
  const now = Date.now();
  if (!force && now - lastEventPersistAt < ACTIVE_EVENT_PERSIST_INTERVAL_MS) {
    return;
  }

  writeEventStore(EVENT_STORE_PATH, buildPersistedState());
  lastEventPersistAt = now;
}

function syncEventDetector(referenceTime = Date.now()) {
  const finalizedEvent = eventDetector.flush(referenceTime);

  if (finalizedEvent) {
    persistEventState(true);
  }

  return finalizedEvent;
}

function parseReading(message) {
  const payload = JSON.parse(message.toString());
  const voc = Number(payload.voc);
  const temperature = Number(payload.temperature);
  const humidity = Number(payload.humidity);
  const deviceTime = Number(payload.time);
  const receivedAt = Date.now();

  if ([voc, temperature, humidity, deviceTime].some(Number.isNaN)) {
    return null;
  }

  return {
    voc,
    temperature,
    humidity,
    deviceTime,
    receivedAt,
    realTimestamp: receivedAt,
    realTimestampIso: new Date(receivedAt).toISOString(),
  };
}

function buildChartPoints(windowReadings) {
  if (windowReadings.length <= MAX_CHART_POINTS) {
    return windowReadings;
  }

  const bucketSize = Math.ceil(windowReadings.length / MAX_CHART_POINTS);
  const sampled = [];

  for (let index = 0; index < windowReadings.length; index += bucketSize) {
    sampled.push(windowReadings[index]);
  }

  const lastReading = windowReadings[windowReadings.length - 1];
  if (sampled[sampled.length - 1] !== lastReading) {
    sampled[sampled.length - 1] = lastReading;
  }

  return sampled;
}

function mapPoint(reading) {
  return {
    timestamp: reading.timestamp ?? reading.receivedAt,
    timestampIso: reading.timestampIso ?? new Date(reading.timestamp ?? reading.receivedAt).toISOString(),
    realTimestamp: reading.realTimestamp,
    realTimestampIso: reading.realTimestampIso,
    voc: reading.voc,
    temperature: reading.temperature,
    humidity: reading.humidity,
    fastSignal: reading.fastSignal,
    baseline: reading.baseline,
    delta: reading.delta,
  };
}

function mapEventDetail(detail) {
  if (!detail) {
    return null;
  }

  return {
    ...detail,
    samples: Array.isArray(detail.samples) ? detail.samples.map(mapPoint) : [],
  };
}

function formatDashboardResponse() {
  syncEventDetector(Date.now());
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const windowReadings = readings.filter((reading) => reading.receivedAt >= cutoff);
  const chartReadings = buildChartPoints(windowReadings);
  const latest = windowReadings[windowReadings.length - 1] || null;
  const signals = eventDetector.getSignals();
  const eventSummary = eventDetector.getSummary();
  const activeEvent = eventDetector.getActiveEvent();
  const currentSession = eventDetector.getCurrentSessionEvent();
  const pendingMergeEvent = eventDetector.getPendingMergeEvent();
  const cleanState = getCleanState();
  const averageVoc = windowReadings.length
    ? Math.round(windowReadings.reduce((sum, reading) => sum + reading.voc, 0) / windowReadings.length)
    : null;
  const peakVoc = windowReadings.length
    ? Math.max(...windowReadings.map((reading) => reading.voc))
    : null;

  return {
    connected: mqttConnected,
    topic: MQTT_TOPIC,
    windowMs: WINDOW_MS,
    lastMessageAt,
    lastMessageAtIso: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
    signals,
    eventConfig: EVENT_CONFIG,
    eventSummary,
    cleanState,
    activeEvent,
    currentSession,
    pendingMergeEvent,
    latest: latest
      ? {
          voc: latest.voc,
          temperature: latest.temperature,
          humidity: latest.humidity,
          deviceTime: latest.deviceTime,
          receivedAt: latest.receivedAt,
          realTimestamp: latest.realTimestamp,
          realTimestampIso: latest.realTimestampIso,
          fastSignal: latest.fastSignal,
          baseline: latest.baseline,
          delta: latest.delta,
        }
      : null,
    stats: {
      averageVoc,
      peakVoc,
      sampleCount: windowReadings.length,
    },
    points: chartReadings.map(mapPoint),
  };
}

function acknowledgeCleanAction() {
  syncEventDetector(Date.now());
  const summary = eventDetector.getSummary();
  const currentDurationMs = Number(summary.totalEventDurationMs || 0)
    + Number(eventDetector.getCurrentSessionDurationMs() || 0);
  persistedCleanState = acknowledgeClean(currentDurationMs);
  persistEventState(true);
  return getCleanState();
}

const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
});

mqttClient.on('connect', () => {
  mqttConnected = true;
  console.log(`Connected to MQTT broker at ${MQTT_BROKER_URL}`);
  mqttClient.subscribe(MQTT_TOPIC, (error) => {
    if (error) {
      console.error(`Failed to subscribe to ${MQTT_TOPIC}:`, error.message);
      return;
    }

    console.log(`Subscribed to topic ${MQTT_TOPIC}`);
  });
});

mqttClient.on('reconnect', () => {
  mqttConnected = false;
  console.log('Reconnecting to MQTT broker...');
});

mqttClient.on('close', () => {
  mqttConnected = false;
  console.log('MQTT connection closed');
});

mqttClient.on('error', (error) => {
  mqttConnected = false;
  console.error('MQTT error:', error.message);
});

mqttClient.on('message', (_topic, message) => {
  try {
    const rawReading = parseReading(message);

    if (!rawReading) {
      return;
    }

    const previousActiveEvent = eventDetector.getActiveEvent();
    const previousPendingMergeEvent = eventDetector.getPendingMergeEvent();
    const previousTotalEventCount = eventDetector.getSummary().totalEventCount;
    const reading = eventDetector.process(rawReading);
    const nextActiveEvent = eventDetector.getActiveEvent();
    const nextPendingMergeEvent = eventDetector.getPendingMergeEvent();
    const nextTotalEventCount = eventDetector.getSummary().totalEventCount;

    readings.push(reading);
    lastMessageAt = reading.receivedAt;
    pruneReadings();

    if (
      previousTotalEventCount !== nextTotalEventCount
      || previousActiveEvent?.id !== nextActiveEvent?.id
      || previousPendingMergeEvent?.id !== nextPendingMergeEvent?.id
    ) {
      persistEventState(true);
    } else {
      persistEventState(false);
    }
  } catch (error) {
    console.error('Invalid MQTT message:', message.toString(), error.message);
  }
});

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'OPTIONS') {
    setCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/air-quality') {
    sendJson(response, 200, formatDashboardResponse());
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    syncEventDetector(Date.now());
    sendJson(response, 200, {
      ok: true,
      connected: mqttConnected,
      lastMessageAt,
      lastMessageAtIso: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
      bufferedReadings: readings.length,
      eventStorePath: EVENT_STORE_PATH,
      eventSummary: eventDetector.getSummary(),
      currentSession: eventDetector.getCurrentSessionEvent(),
      pendingMergeEvent: eventDetector.getPendingMergeEvent(),
      cleanState: getCleanState(),
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/events') {
    syncEventDetector(Date.now());
    const requestedLimit = Number(requestUrl.searchParams.get('limit') || 20);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 20;

    sendJson(response, 200, {
      summary: eventDetector.getSummary(),
      activeEvent: eventDetector.getActiveEvent(),
      currentSession: eventDetector.getCurrentSessionEvent(),
      pendingMergeEvent: eventDetector.getPendingMergeEvent(),
      cleanState: getCleanState(),
      recentEvents: eventDetector.getRecentEvents(limit),
      config: {
        event: EVENT_CONFIG,
        clean: CLEAN_CONFIG,
      },
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/api/events/')) {
    syncEventDetector(Date.now());
    const eventId = decodeURIComponent(requestUrl.pathname.replace('/api/events/', ''));
    const detail = mapEventDetail(eventDetector.getEventDetail(eventId));

    if (!detail) {
      sendJson(response, 404, { error: 'Event not found' });
      return;
    }

    sendJson(response, 200, {
      event: detail,
      activeEvent: eventDetector.getActiveEvent(),
      currentSession: eventDetector.getCurrentSessionEvent(),
      pendingMergeEvent: eventDetector.getPendingMergeEvent(),
      summary: eventDetector.getSummary(),
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/clean') {
    const cleanState = acknowledgeCleanAction();

    sendJson(response, 200, {
      ok: true,
      cleanState,
      eventSummary: eventDetector.getSummary(),
    });
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  pruneReadings();
  persistEventState(true);
  console.log(`Air quality API listening on http://localhost:${PORT}`);
});
