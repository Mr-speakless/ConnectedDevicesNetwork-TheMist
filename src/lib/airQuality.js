const DEFAULT_API_BASE_URL = 'http://localhost:3001';

export const FALLBACK_DASHBOARD_DATA = {
  connected: false,
  lastMessageAt: null,
  latest: null,
  eventSummary: {
    totalEventCount: 0,
    totalEventDurationMs: 0,
    totalExposureScore: 0,
  },
  cleanState: {
    lastCleanedAt: null,
    cleanDurationMs: 0,
    cleanStatus: 'Okay',
    thresholds: {
      needCleanMs: 30 * 60 * 1000,
      cleanNowMs: 60 * 60 * 1000,
    },
  },
  currentSession: null,
  activeEvent: null,
  points: [],
};

export const FALLBACK_EVENTS_DATA = {
  recentEvents: [],
  currentSession: null,
  activeEvent: null,
};

function getApiBaseUrl() {
  return import.meta.env.VITE_AIR_API_BASE_URL || DEFAULT_API_BASE_URL;
}

function formatClockLabel(timestamp) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatTooltipTime(timestamp) {
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatDateBlock(timestamp) {
  if (timestamp === null || timestamp === undefined) {
    return { dayLabel: '--/--', timeLabel: '--:--' };
  }

  return {
    dayLabel: new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp)),
    timeLabel: new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(timestamp)),
  };
}

export function formatDurationMs(durationMs) {
  if (!durationMs) {
    return '0h 00min';
  }

  const totalMinutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
}

function buildTimeTags(points) {
  if (points.length === 0) {
    return ['--:--', '--:--', '--:--'];
  }

  const startTimestamp = points[0].timestamp;
  const endTimestamp = points[points.length - 1].timestamp;
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
  });
  const useDateLabel = dayFormatter.format(new Date(startTimestamp)) !== dayFormatter.format(new Date(endTimestamp));
  const markerIndexes = [
    0,
    Math.floor((points.length - 1) / 2),
    points.length - 1,
  ];

  return markerIndexes.map((index) => {
    const point = points[index];
    if (!point) {
      return '--:--';
    }

    return useDateLabel
      ? dayFormatter.format(new Date(point.timestamp))
      : formatClockLabel(point.timestamp);
  });
}

function buildDayMarkers(points) {
  if (points.length < 2) {
    return [];
  }

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
  });
  const markers = [];

  for (let index = 1; index < points.length; index += 1) {
    const previousDay = dayFormatter.format(new Date(points[index - 1].timestamp));
    const currentDay = dayFormatter.format(new Date(points[index].timestamp));

    if (previousDay !== currentDay) {
      markers.push({
        index,
        label: currentDay,
      });
    }
  }

  return markers;
}

function mapPoint(point) {
  const timestamp = point.realTimestamp || point.timestamp;
  return {
    ...point,
    timestamp,
    tooltipTime: formatTooltipTime(timestamp),
  };
}

function mapEventSummary(event) {
  if (!event) {
    return null;
  }

  return {
    ...event,
    durationLabel: formatDurationMs(event.durationMs),
    dateBlock: formatDateBlock(event.startTime),
  };
}

export function buildEventOptions(currentSession, recentEvents) {
  const options = [];

  if (currentSession) {
    options.push(currentSession);
  }

  recentEvents.forEach((event) => {
    if (!options.some((option) => option.id === event.id)) {
      options.push(event);
    }
  });

  return options;
}

export function mapLiveDashboard(apiData) {
  const safeData = apiData || FALLBACK_DASHBOARD_DATA;
  const points = Array.isArray(safeData.points) ? safeData.points.map(mapPoint) : [];

  return {
    connected: Boolean(safeData.connected),
    lastMessageAt: safeData.lastMessageAt ?? null,
    latestVoc: safeData.latest?.voc ?? null,
    latestLabel: safeData.latest?.voc ?? '--',
    eventSummary: {
      totalEventCount: Number(safeData.eventSummary?.totalEventCount || 0),
      totalEventDurationMs: Number(safeData.eventSummary?.totalEventDurationMs || 0),
      totalExposureScore: Number(safeData.eventSummary?.totalExposureScore || 0),
    },
    cleanState: {
      lastCleanedAt: safeData.cleanState?.lastCleanedAt ?? null,
      cleanDurationMs: Number(safeData.cleanState?.cleanDurationMs || 0),
      cleanStatus: safeData.cleanState?.cleanStatus || 'Okay',
      thresholds: safeData.cleanState?.thresholds || FALLBACK_DASHBOARD_DATA.cleanState.thresholds,
    },
    currentSession: mapEventSummary(safeData.currentSession),
    activeEvent: mapEventSummary(safeData.activeEvent),
    points,
    timeTags: buildTimeTags(points),
    dayMarkers: buildDayMarkers(points),
  };
}

export function mapRecentEvents(apiData) {
  const safeData = apiData || FALLBACK_EVENTS_DATA;
  return {
    currentSession: mapEventSummary(safeData.currentSession),
    activeEvent: mapEventSummary(safeData.activeEvent),
    recentEvents: Array.isArray(safeData.recentEvents)
      ? safeData.recentEvents.map(mapEventSummary)
      : [],
  };
}

export function mapEventDetail(apiData) {
  const event = apiData?.event;
  if (!event) {
    return null;
  }

  return {
    ...mapEventSummary(event),
    samples: Array.isArray(event.samples) ? event.samples.map(mapPoint) : [],
  };
}

export async function fetchAirQualityData(signal) {
  const response = await fetch(`${getApiBaseUrl()}/api/air-quality`, { signal });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchRecentEvents(signal, limit = 20) {
  const response = await fetch(`${getApiBaseUrl()}/api/events?limit=${limit}`, { signal });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchEventDetail(eventId, signal) {
  const response = await fetch(`${getApiBaseUrl()}/api/events/${encodeURIComponent(eventId)}`, { signal });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function postCleanAcknowledgement() {
  const response = await fetch(`${getApiBaseUrl()}/api/clean`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}
