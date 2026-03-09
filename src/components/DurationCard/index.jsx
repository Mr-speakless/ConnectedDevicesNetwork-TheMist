import { useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@developer-hub/liquid-glass';
import { formatDurationMs } from '../../lib/airQuality';
import styles from './styles.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMELINE_MS = 7 * DAY_MS;
const SLIDER_STEPS = 1000;

function formatWindowLabel(timestamp) {
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

function formatDayLabel(timestamp) {
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function slicePointsToTimeline(points) {
  if (!points.length) {
    return {
      points: [],
      start: null,
      end: null,
      totalSpanMs: 0,
    };
  }

  const end = points[points.length - 1].timestamp;
  const start = Math.max(points[0].timestamp, end - MAX_TIMELINE_MS);
  const slicedPoints = points.filter((point) => point.timestamp >= start && point.timestamp <= end);

  return {
    points: slicedPoints,
    start,
    end,
    totalSpanMs: Math.max(end - start, 0),
  };
}

function buildDayMarkers(windowStart, windowEnd, width, padding) {
  if (windowStart === null || windowEnd === null || windowEnd <= windowStart) {
    return [];
  }

  const markers = [];
  const innerWidth = width - padding * 2;
  const startDate = new Date(windowStart);
  const nextMidnight = new Date(startDate);
  nextMidnight.setHours(24, 0, 0, 0);

  for (let markerTime = nextMidnight.getTime(); markerTime < windowEnd; markerTime += DAY_MS) {
    const progress = (markerTime - windowStart) / (windowEnd - windowStart);
    markers.push({
      label: formatDayLabel(markerTime),
      x: padding + innerWidth * progress,
    });
  }

  return markers;
}

function buildRibbonPoints(points, width, padding, windowStart, windowEnd) {
  if (!points.length) {
    return [];
  }

  const innerWidth = width - padding * 2;
  const values = points.map((point) => point.voc);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(maxValue - minValue, 1);
  const timeSpan = Math.max(windowEnd - windowStart, 1);
  const useIndexFallback = !Number.isFinite(timeSpan) || timeSpan <= 0;

  return points.map((point, index) => ({
    ...point,
    x: useIndexFallback
      ? padding + (innerWidth * index) / Math.max(points.length - 1, 1)
      : padding + (innerWidth * (point.timestamp - windowStart)) / timeSpan,
    normalized: (point.voc - minValue) / valueRange,
  }));
}

function buildRibbonPath(points, centerY, minThickness, thicknessRange) {
  if (!points.length) {
    return '';
  }

  const topPath = points
    .map((point, index) => {
      const thickness = minThickness + point.normalized * thicknessRange;
      const y = centerY - thickness;
      return `${index === 0 ? 'M' : 'L'} ${point.x} ${y}`;
    })
    .join(' ');

  const bottomPath = points
    .slice()
    .reverse()
    .map((point) => {
      const thickness = minThickness + point.normalized * thicknessRange;
      const y = centerY + thickness;
      return `L ${point.x} ${y}`;
    })
    .join(' ');

  return `${topPath} ${bottomPath} Z`;
}

export default function DurationCard({ data }) {
  const chartWidth = 560;
  const chartHeight = 190;
  const chartPadding = 22;
  const centerY = chartHeight / 2;
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [windowOffsetRatio, setWindowOffsetRatio] = useState(1);

  const timeline = useMemo(() => slicePointsToTimeline(data.points), [data.points]);
  const visibleSpanMs = timeline.totalSpanMs > 0 ? Math.min(timeline.totalSpanMs, DAY_MS) : 0;
  const maxOffsetMs = Math.max(timeline.totalSpanMs - visibleSpanMs, 0);
  const visibleOffsetMs = maxOffsetMs * windowOffsetRatio;
  const visibleStart = timeline.start === null ? null : timeline.start + visibleOffsetMs;
  const visibleEnd = visibleStart === null
    ? null
    : visibleStart + (visibleSpanMs || 0);
  const visiblePoints = useMemo(() => {
    if (visibleStart === null || visibleEnd === null) {
      return [];
    }

    return timeline.points.filter((point) => point.timestamp >= visibleStart && point.timestamp <= visibleEnd);
  }, [timeline.points, visibleEnd, visibleStart]);

  const chartPoints = useMemo(
    () => buildRibbonPoints(
      visiblePoints,
      chartWidth,
      chartPadding,
      visibleStart ?? timeline.start ?? 0,
      visibleEnd ?? timeline.end ?? 0,
    ),
    [timeline.end, timeline.start, visibleEnd, visiblePoints, visibleStart],
  );
  const dayMarkers = useMemo(
    () => buildDayMarkers(visibleStart, visibleEnd, chartWidth, chartPadding),
    [visibleEnd, visibleStart],
  );
  const showTimelineSlider = maxOffsetMs > 0;

  const outerPath = buildRibbonPath(chartPoints, centerY, 9, 34);
  const midPath = buildRibbonPath(chartPoints, centerY, 7, 26);
  const innerPath = buildRibbonPath(chartPoints, centerY, 5, 18);
  const activePoint = hoveredIndex === null ? null : chartPoints[hoveredIndex] || null;

  useEffect(() => {
    setHoveredIndex(null);
  }, [visibleStart, visibleEnd, chartPoints.length]);

  useEffect(() => {
    setWindowOffsetRatio((previousRatio) => {
      if (!showTimelineSlider) {
        return 1;
      }

      return clamp(previousRatio, 0, 1);
    });
  }, [showTimelineSlider, maxOffsetMs]);

  const handlePointerMove = (event) => {
    if (!chartPoints.length) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * chartWidth;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    chartPoints.forEach((point, index) => {
      const distance = Math.abs(point.x - relativeX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setHoveredIndex(nearestIndex);
  };

  return (
    <GlassCard blurAmount={0.08} cornerRadius={20} className={styles.durationCard}>
      <div className={styles.content} data-node-id="85:47">
        <div className={styles.headerBlock} data-node-id="85:48">
          <div className={styles.latestVoc} data-node-id="85:50">
            VOC: {data.latestLabel}
          </div>
          <div className={styles.metaRow} data-node-id="85:51">
            <div className={styles.metaLabel} data-node-id="85:53">
              Duration Time: {formatDurationMs(data.totalEventDurationMs)}
            </div>
            <div className={styles.metaLabel} data-node-id="85:55">
              Cooking Time: {data.totalEventCount}
            </div>
          </div>
        </div>

        <div className={styles.chartShell} data-node-id="85:56">
          <svg
            className={styles.chart}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <defs>
              <linearGradient id="durationRibbonOuter" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#94846a" stopOpacity="0.72" />
                <stop offset="50%" stopColor="#a78a58" stopOpacity="0.88" />
                <stop offset="100%" stopColor="#a78243" stopOpacity="0.72" />
              </linearGradient>
              <linearGradient id="durationRibbonMid" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#e1d7c9" stopOpacity="0.72" />
                <stop offset="50%" stopColor="#ebb13f" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#e0b04b" stopOpacity="0.76" />
              </linearGradient>
              <linearGradient id="durationRibbonInner" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f2ebe3" stopOpacity="0.82" />
                <stop offset="50%" stopColor="#f4c15a" stopOpacity="0.94" />
                <stop offset="100%" stopColor="#f8c04a" stopOpacity="0.82" />
              </linearGradient>
            </defs>

            {outerPath ? <path d={outerPath} fill="url(#durationRibbonOuter)" /> : null}
            {midPath ? <path d={midPath} fill="url(#durationRibbonMid)" /> : null}
            {innerPath ? <path d={innerPath} fill="url(#durationRibbonInner)" /> : null}

            {activePoint ? (
              <>
                <line
                  x1={activePoint.x}
                  y1="18"
                  x2={activePoint.x}
                  y2={chartHeight - 18}
                  className={styles.hoverLineSvg}
                />
                <circle
                  cx={activePoint.x}
                  cy={centerY}
                  r="4.5"
                  className={styles.hoverDotSvg}
                />
              </>
            ) : null}
          </svg>

          {dayMarkers.map((marker) => {
            return (
              <div
                key={`${marker.label}-${marker.x}`}
                className={styles.marker}
                style={{ left: `${(marker.x / chartWidth) * 100}%` }}
              >
                <div className={styles.markerLine} />
                <div className={styles.markerLabel}>{marker.label}</div>
              </div>
            );
          })}

          <div
            className={styles.connectionBadge}
            data-online={data.connected}
            data-pending={data.isPending}
          >
            {data.isPending
              ? 'Pending data...'
              : data.connected
                ? 'MQTT live'
                : 'Waiting for MQTT'}
          </div>

          {activePoint ? (
            <div
              className={styles.tooltip}
              style={{
                left: `${(activePoint.x / chartWidth) * 100}%`,
                top: '14px',
              }}
            >
              <div className={styles.tooltipTime}>{activePoint.tooltipTime}</div>
              <div className={styles.tooltipValue}>VOC {activePoint.voc}</div>
            </div>
          ) : null}

          {!data.points.length ? (
            <div className={styles.emptyState}>
              Waiting for live VOC data from the Node MQTT server.
            </div>
          ) : null}
        </div>

        {showTimelineSlider && visibleStart !== null && visibleEnd !== null ? (
          <div className={styles.timelineControls}>
            <div className={styles.timelineSummary}>
              <span>Window</span>
              <span>{formatWindowLabel(visibleStart)} - {formatWindowLabel(visibleEnd)}</span>
            </div>
            <input
              className={styles.timelineSlider}
              type="range"
              min="0"
              max={SLIDER_STEPS}
              step="1"
              value={Math.round(windowOffsetRatio * SLIDER_STEPS)}
              aria-label="Browse timeline window"
              onChange={(event) => {
                const nextRatio = Number(event.target.value) / SLIDER_STEPS;
                setWindowOffsetRatio(clamp(nextRatio, 0, 1));
              }}
            />
            <div className={styles.timelineEnds}>
              <span>{formatDayLabel(timeline.start)}</span>
              <span>{formatDayLabel(timeline.end)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}
