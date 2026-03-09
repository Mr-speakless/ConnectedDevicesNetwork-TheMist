import { useMemo, useState } from 'react';
import { GlassCard } from '@developer-hub/liquid-glass';
import styles from './styles.module.css';

const Y_AXIS_MIN = 0;
const Y_AXIS_MAX = 500;
const Y_AXIS_STEP = 100;
const Y_AXIS_VALUES = Array.from(
  { length: (Y_AXIS_MAX - Y_AXIS_MIN) / Y_AXIS_STEP + 1 },
  (_, index) => Y_AXIS_MAX - index * Y_AXIS_STEP,
);

function getYPosition(value, height, padding) {
  const chartHeight = height - padding.top - padding.bottom;
  const normalized = (value - Y_AXIS_MIN) / (Y_AXIS_MAX - Y_AXIS_MIN);
  return height - padding.bottom - normalized * chartHeight;
}

function buildChartPoints(samples, width, height, padding) {
  if (!samples.length) {
    return [];
  }

  const innerWidth = width - padding.left - padding.right;

  return samples.map((sample, index) => {
    const x = padding.left + (innerWidth * index) / Math.max(samples.length - 1, 1);
    const clampedVoc = Math.max(Y_AXIS_MIN, Math.min(Y_AXIS_MAX, sample.voc));
    const y = getYPosition(clampedVoc, height, padding);

    return {
      ...sample,
      x,
      y,
    };
  });
}

function buildLinePath(points) {
  if (!points.length) {
    return '';
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function buildAreaPath(points, height, paddingBottom) {
  if (!points.length) {
    return '';
  }

  const linePath = buildLinePath(points);
  const startX = points[0].x;
  const endX = points[points.length - 1].x;
  const bottomY = height - paddingBottom;

  return `${linePath} L ${endX} ${bottomY} L ${startX} ${bottomY} Z`;
}

export default function AvgCard({ data }) {
  const chartWidth = 320;
  const chartHeight = 132;
  const padding = { top: 10, right: 22, bottom: 16, left: 12 };
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const gridLines = Y_AXIS_VALUES.map((value) => ({
    value,
    y: getYPosition(value, chartHeight, padding),
  }));

  const chartPoints = useMemo(
    () => buildChartPoints(data.selectedEvent?.samples || [], chartWidth, chartHeight, padding),
    [data.selectedEvent],
  );

  const linePath = buildLinePath(chartPoints);
  const areaPath = buildAreaPath(chartPoints, chartHeight, padding.bottom);
  const activePoint = hoveredIndex === null ? null : chartPoints[hoveredIndex] || null;

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
    <GlassCard blurAmount={0.08} cornerRadius={20} className={styles.avgCard}>
      <div className={styles.content} data-node-id="85:67">
        <div className={styles.header} data-node-id="85:68">
          <div className={styles.title} data-node-id="85:70">
            AVG: {data.selectedEvent?.avgVoc ?? '--'}
          </div>
          <div className={styles.dateBlock} data-node-id="85:72">
            <div>{data.selectedEvent?.dateBlock?.dayLabel || '--/--'}</div>
            <div>{data.selectedEvent?.dateBlock?.timeLabel || '--:--'}</div>
          </div>
        </div>

        <div className={styles.chartPanel} data-node-id="85:73">
          {data.isPending ? (
            <div className={styles.pendingBadge}>Pending data...</div>
          ) : null}
          {data.hasEvents ? (
            <>
              <svg
                className={styles.chart}
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                onMouseMove={handlePointerMove}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <defs>
                  <linearGradient id="avgAreaFill" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#b28a44" stopOpacity="0.78" />
                    <stop offset="50%" stopColor="#d4d0c9" stopOpacity="0.92" />
                    <stop offset="100%" stopColor="#d1a048" stopOpacity="0.84" />
                  </linearGradient>
                  <linearGradient id="avgLineStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#cfa25c" />
                    <stop offset="50%" stopColor="#f1ede7" />
                    <stop offset="100%" stopColor="#e2ac4b" />
                  </linearGradient>
                </defs>

                {gridLines.map((gridLine) => (
                  <line
                    key={gridLine.value}
                    className={styles.gridLineSvg}
                    x1={padding.left}
                    y1={gridLine.y}
                    x2={chartWidth - padding.right}
                    y2={gridLine.y}
                  />
                ))}

                {areaPath ? <path d={areaPath} fill="url(#avgAreaFill)" /> : null}
                {linePath ? (
                  <path
                    d={linePath}
                    className={styles.linePath}
                    stroke="url(#avgLineStroke)"
                  />
                ) : null}

                {activePoint ? (
                  <>
                    <line
                      className={styles.crosshairSvg}
                      x1={activePoint.x}
                      y1={padding.top}
                      x2={activePoint.x}
                      y2={chartHeight - padding.bottom}
                    />
                    <line
                      className={styles.crosshairSvg}
                      x1={padding.left}
                      y1={activePoint.y}
                      x2={chartWidth - padding.right}
                      y2={activePoint.y}
                    />
                    <circle
                      className={styles.crosshairDotSvg}
                      cx={activePoint.x}
                      cy={activePoint.y}
                      r="5"
                    />
                  </>
                ) : null}
              </svg>

              <div className={styles.axisLabels}>
                {gridLines.map((gridLine) => (
                  <span
                    key={gridLine.value}
                    className={styles.axisLabel}
                    style={{ top: `${(gridLine.y / chartHeight) * 100}%` }}
                  >
                    {gridLine.value}
                  </span>
                ))}
              </div>

              {activePoint ? (
                <div
                  className={styles.tooltip}
                  style={{
                    left: `${(activePoint.x / chartWidth) * 100}%`,
                    top: `${(activePoint.y / chartHeight) * 100}%`,
                  }}
                >
                  <div className={styles.tooltipValue}>{activePoint.voc}</div>
                  <div className={styles.tooltipTime}>{activePoint.tooltipTime}</div>
                </div>
              ) : null}

              {data.canGoNext ? (
                <button
                  className={`${styles.navButton} ${styles.navLeft}`}
                  onClick={data.onNext}
                  type="button"
                >
                  {'<'}
                </button>
              ) : null}

              {data.canGoPrevious ? (
                <button
                  className={`${styles.navButton} ${styles.navRight}`}
                  onClick={data.onPrevious}
                  type="button"
                >
                  {'>'}
                </button>
              ) : null}
            </>
          ) : (
            <div className={styles.emptyState}>No cooking events available yet.</div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
