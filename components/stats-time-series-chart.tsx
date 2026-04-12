"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import type { StatsDateBucket, StatsMetric, StatsSeriesPoint } from "@/lib/types";

type StatsTimeSeriesChartProps = {
  dateBucket: StatsDateBucket;
  metric: StatsMetric;
  onDateBucketChange: (value: StatsDateBucket) => void;
  points: StatsSeriesPoint[];
  unitLabel: string | null;
  unitTooltip: string | null;
};

type HoveredPoint = {
  x: number;
  y: number;
  point: StatsSeriesPoint;
};

const SVG_HEIGHT = 260;
const PADDING = { top: 20, right: 18, bottom: 34, left: 18 };

function formatMetricValue(metric: StatsMetric, value: number): string {
  if (metric === "dollars") {
    return `$${value.toFixed(2)}`;
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

export function StatsTimeSeriesChart({
  dateBucket,
  metric,
  onDateBucketChange,
  points,
  unitLabel,
  unitTooltip
}: StatsTimeSeriesChartProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const node = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth) {
        setWidth(nextWidth);
      }
    });

    observer.observe(node);
    setWidth(node.getBoundingClientRect().width || 640);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) {
    return (
      <div className="stats-chart-card empty-state">
        Save receipts in the selected date range to chart food purchases over time.
      </div>
    );
  }

  const chartWidth = Math.max(width, 280);
  const innerWidth = Math.max(chartWidth - PADDING.left - PADDING.right, 1);
  const innerHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const zeroY = PADDING.top + innerHeight;
  const barGap = points.length > 1 ? Math.min(18, innerWidth * 0.05) : 0;
  const barWidth = Math.max((innerWidth - barGap * Math.max(points.length - 1, 0)) / points.length, 18);

  const plottedBars = points.map((point, index) => {
    const height = (point.value / maxValue) * innerHeight;
    const x = PADDING.left + index * (barWidth + barGap);
    const y = zeroY - height;
    return { ...point, x, y, width: barWidth, height };
  });

  const highestPoint = plottedBars.reduce((current, point) => (point.value >= current.value ? point : current), plottedBars[0]);
  const mostRecentPoint = plottedBars[plottedBars.length - 1];
  const labeledKeys = new Set([highestPoint.bucket_key, mostRecentPoint.bucket_key]);

  return (
    <div className="stats-chart-card" ref={containerRef}>
      <div className="stats-chart-meta">
        <div className="stats-chart-heading">
          <div className="stats-chart-title-row">
            <h3 className="section-title">Trends</h3>
            <select className="field stats-bucket-select" value={dateBucket} onChange={(event) => onDateBucketChange(event.target.value as StatsDateBucket)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
        </div>
      </div>
      <div className="stats-chart-shell">
        <div className="stats-chart-axis-unit">
          <span className="pill subtle" title={unitTooltip ?? undefined}>
            {metric === "dollars" ? "Dollars" : metric === "total_amount" ? `Total Amount${unitLabel ? ` • ${unitLabel}` : ""}` : "Quantity"}
          </span>
        </div>
        <svg aria-label="Food purchase time series" className="stats-chart" height={SVG_HEIGHT} viewBox={`0 0 ${chartWidth} ${SVG_HEIGHT}`} width="100%">
          <line className="stats-chart-axis" x1={PADDING.left} x2={chartWidth - PADDING.right} y1={SVG_HEIGHT - PADDING.bottom} y2={SVG_HEIGHT - PADDING.bottom} />
          <line className="stats-chart-axis" x1={PADDING.left} x2={PADDING.left} y1={PADDING.top} y2={SVG_HEIGHT - PADDING.bottom} />
          {plottedBars.map((point) => (
            <g key={point.bucket_key}>
              <rect
                className="stats-chart-bar"
                height={point.height}
                rx="8"
                ry="8"
                width={point.width}
                x={point.x}
                y={point.y}
              />
              <rect
                className="stats-chart-point-hit"
                height={Math.max(point.height, 20)}
                onClick={() => setHoveredPoint({ x: point.x + point.width / 2, y: point.y, point })}
                onMouseEnter={() => setHoveredPoint({ x: point.x + point.width / 2, y: point.y, point })}
                onMouseLeave={() => setHoveredPoint((current) => (current?.point.bucket_key === point.bucket_key ? null : current))}
                rx="8"
                ry="8"
                width={point.width}
                x={point.x}
                y={Math.min(point.y, zeroY - 20)}
              />
              {labeledKeys.has(point.bucket_key) ? (
                <text className="stats-chart-label" textAnchor="middle" x={point.x + point.width / 2} y={Math.max(point.y - 12, 12)}>
                  {formatMetricValue(metric, point.value)}
                </text>
              ) : null}
              <text className="stats-chart-tick" textAnchor="middle" x={point.x + point.width / 2} y={SVG_HEIGHT - 12}>
                {point.bucket_label}
              </text>
            </g>
          ))}
        </svg>
        {hoveredPoint ? (
          <div
            className="stats-chart-tooltip"
            style={{
              left: `${Math.min(Math.max((hoveredPoint.x / chartWidth) * 100, 8), 92)}%`,
              top: `${Math.min(Math.max((hoveredPoint.y / SVG_HEIGHT) * 100, 10), 72)}%`
            }}
          >
            <strong>{hoveredPoint.point.bucket_label}</strong>
            <span>{formatMetricValue(metric, hoveredPoint.point.value)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
