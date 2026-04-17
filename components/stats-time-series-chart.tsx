"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import type { StatsDateBucket, StatsMetric, StatsSeriesPoint } from "@/lib/types";

type StatsTimeSeriesChartProps = {
  dateBucket: StatsDateBucket;
  metric: StatsMetric;
  onDateBucketChange: (value: StatsDateBucket) => void;
  points: StatsSeriesPoint[];
  unitLabel: string | null;
  unitTooltip: string | null;
};

type PlottedBar = StatsSeriesPoint & {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
};

const SVG_HEIGHT = 260;
const PADDING = { top: 20, right: 18, bottom: 34, left: 18 };
const HIT_AREA_X_PADDING = 28;
const HIT_AREA_Y_PADDING = 18;
const TOOLTIP_VIEWPORT_PADDING = 14;
const MOBILE_TOOLTIP_VIEWPORT_PADDING = 20;
const MOBILE_TOOLTIP_MAX_WIDTH = 360;
const TOOLTIP_ANCHOR_GAP = 12;
const TOOLTIP_ARROW_HALF_WIDTH = 8;

function formatMetricValue(metric: StatsMetric, value: number): string {
  if (metric === "dollars") {
    return `$${value.toFixed(2)}`;
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function estimateTextWidth(value: string): number {
  if (typeof document === "undefined") {
    return value.length * 7;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return value.length * 7;
  }

  context.font = "700 12px system-ui";
  return context.measureText(value).width;
}

function getMedianValue(points: StatsSeriesPoint[]): number {
  const sorted = points.map((point) => point.value).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function getLabeledKeys(points: PlottedBar[], metric: StatsMetric): Set<string> {
  const median = getMedianValue(points);
  const selected: Array<{ left: number; right: number }> = [];
  const chartLeft = PADDING.left;
  const chartRight = Math.max(...points.map((point) => point.x + point.width), chartLeft);

  return new Set(
    points
      .map((point) => {
        const label = formatMetricValue(metric, point.value);
        const labelWidth = estimateTextWidth(label) + 6;
        const center = point.x + point.width / 2;
        return {
          bucketKey: point.bucket_key,
          center,
          labelWidth,
          left: center - labelWidth / 2,
          right: center + labelWidth / 2,
          priority: Math.abs(point.value - median),
          value: point.value,
          index: point.index,
          fits: center - labelWidth / 2 >= chartLeft && center + labelWidth / 2 <= chartRight
        };
      })
      .filter((point) => point.fits)
      .sort((a, b) => b.priority - a.priority || b.value - a.value || b.index - a.index)
      .filter((candidate) => {
        const overlaps = selected.some((existing) => candidate.left < existing.right + 6 && candidate.right > existing.left - 6);
        if (overlaps) {
          return false;
        }

        selected.push({ left: candidate.left, right: candidate.right });
        return true;
      })
      .map((point) => point.bucketKey)
  );
}

function getVisibleTickKeys(points: PlottedBar[], chartWidth: number): Set<string> {
  if (points.length <= 1) {
    return new Set(points.map((point) => point.bucket_key));
  }

  const usableWidth = Math.max(chartWidth - PADDING.left - PADDING.right, 1);
  const targetTickCount = Math.max(2, Math.floor(usableWidth / 44));
  const step = Math.max(1, Math.ceil(points.length / targetTickCount));
  const visibleKeys = new Set<string>();

  points.forEach((point, index) => {
    if (index === 0 || index === points.length - 1 || index % step === 0) {
      visibleKeys.add(point.bucket_key);
    }
  });

  return visibleKeys;
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
  const shellRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [activeBucketKey, setActiveBucketKey] = useState<string | null>(null);
  const [expandedBucketKey, setExpandedBucketKey] = useState<string | null>(null);
  const [isTooltipPinned, setIsTooltipPinned] = useState(false);
  const [tooltipWidth, setTooltipWidth] = useState(320);
  const [tooltipHeight, setTooltipHeight] = useState(220);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const node = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth) {
        const roundedWidth = Math.round(nextWidth);
        setWidth((current) => (current === roundedWidth ? current : roundedWidth));
      }
    });

    observer.observe(node);
    const initialWidth = Math.round(node.getBoundingClientRect().width || 640);
    setWidth((current) => (current === initialWidth ? current : initialWidth));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (!tooltipRef.current?.contains(event.target as Node)) {
        setActiveBucketKey(null);
        setExpandedBucketKey(null);
        setIsTooltipPinned(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!tooltipRef.current) {
      return;
    }

    const node = tooltipRef.current;
    const updateSize = (): void => {
      const bounds = node.getBoundingClientRect();
      const nextWidth = Math.round(bounds.width);
      const nextHeight = Math.round(bounds.height);
      if (nextWidth) {
        setTooltipWidth((current) => (current === nextWidth ? current : nextWidth));
      }

      if (nextHeight) {
        setTooltipHeight((current) => (current === nextHeight ? current : nextHeight));
      }
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeBucketKey, expandedBucketKey]);

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
  const barGap = points.length > 1 ? Math.min(12, Math.max(2, innerWidth * 0.03)) : 0;
  const barWidth = Math.max((innerWidth - barGap * Math.max(points.length - 1, 0)) / points.length, 4);

  const plottedBars = points.map((point, index) => {
    const height = (point.value / maxValue) * innerHeight;
    const x = PADDING.left + index * (barWidth + barGap);
    const y = zeroY - height;
    return { ...point, x, y, width: barWidth, height, index };
  });

  const labeledKeys = getLabeledKeys(plottedBars, metric);
  const visibleTickKeys = getVisibleTickKeys(plottedBars, chartWidth);
  const activePoint = activeBucketKey ? plottedBars.find((point) => point.bucket_key === activeBucketKey) ?? null : null;
  const isExpanded = activePoint ? expandedBucketKey === activePoint.bucket_key : false;
  const visibleTooltipRows = activePoint ? (isExpanded ? activePoint.tooltip_rows : activePoint.tooltip_rows.slice(0, 5)) : [];
  const hasMoreRows = activePoint ? activePoint.tooltip_rows.length > 5 : false;
  const tooltipAnchorX = activePoint ? activePoint.x + activePoint.width / 2 : 0;
  const tooltipAnchorY = activePoint ? Math.min(Math.max(activePoint.y, 18), zeroY - 18) : Math.min(Math.max(PADDING.top, 18), zeroY - 18);
  const viewportWidth = typeof window === "undefined" ? chartWidth : window.innerWidth;
  const isMobileViewport = viewportWidth <= 640;
  const tooltipViewportPadding = isMobileViewport ? MOBILE_TOOLTIP_VIEWPORT_PADDING : TOOLTIP_VIEWPORT_PADDING;
  const mobileTooltipWidth = Math.min(MOBILE_TOOLTIP_MAX_WIDTH, Math.max(280, chartWidth - tooltipViewportPadding * 2));
  const effectiveTooltipWidth = isMobileViewport ? mobileTooltipWidth : tooltipWidth;
  const minTooltipLeft = tooltipViewportPadding;
  const maxTooltipLeft = Math.max(tooltipViewportPadding, chartWidth - tooltipViewportPadding - effectiveTooltipWidth);
  const preferredCenteredLeft = tooltipAnchorX - effectiveTooltipWidth / 2;
  const tooltipLeft = activePoint
    ? Math.min(Math.max(preferredCenteredLeft, minTooltipLeft), maxTooltipLeft)
    : tooltipViewportPadding;
  const minTooltipTop = tooltipViewportPadding;
  const shellHeight = shellRef.current?.getBoundingClientRect().height ?? SVG_HEIGHT;
  const maxTooltipTop = Math.max(tooltipViewportPadding, shellHeight - tooltipViewportPadding - tooltipHeight);
  const preferredTooltipTop = tooltipAnchorY - tooltipHeight - TOOLTIP_ANCHOR_GAP;
  const fallbackTooltipTop = tooltipAnchorY + TOOLTIP_ANCHOR_GAP;
  const tooltipPlacement = preferredTooltipTop >= minTooltipTop || fallbackTooltipTop > maxTooltipTop ? "above" : "below";
  const tooltipTop = activePoint
    ? Math.min(Math.max(tooltipPlacement === "above" ? preferredTooltipTop : fallbackTooltipTop, minTooltipTop), maxTooltipTop)
    : tooltipViewportPadding;
  const tooltipArrowLeft = activePoint
    ? Math.min(
        Math.max(tooltipAnchorX - tooltipLeft, TOOLTIP_ARROW_HALF_WIDTH + 10),
        effectiveTooltipWidth - TOOLTIP_ARROW_HALF_WIDTH - 10
      )
    : effectiveTooltipWidth / 2;
  const tooltipStyle = {
    left: `${tooltipLeft}px`,
      top: `${tooltipTop}px`,
      width: isMobileViewport ? `${mobileTooltipWidth}px` : undefined,
      ["--tooltip-arrow-left" as any]: `${tooltipArrowLeft}px`
  } as CSSProperties;

  function handleBarClick(point: PlottedBar): void {
    if (activeBucketKey === point.bucket_key && isTooltipPinned) {
      setActiveBucketKey(null);
      setExpandedBucketKey(null);
      setIsTooltipPinned(false);
      return;
    }

    setActiveBucketKey(point.bucket_key);
    setExpandedBucketKey(null);
    setIsTooltipPinned(true);
  }

  return (
    <div className="stats-chart-card" ref={containerRef}>
      <div className="stats-chart-meta">
        <div className="stats-chart-heading">
          <div className="stats-chart-title-row">
            <h3 className="section-title">Trends</h3>
            <select className="field stats-bucket-select" value={dateBucket} onChange={(event) => onDateBucketChange(event.target.value as StatsDateBucket)}>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
        </div>
      </div>
      <div className="stats-chart-shell" ref={shellRef}>
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
                height={Math.max(point.height + HIT_AREA_Y_PADDING * 2, 36)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  handleBarClick(point);
                }}
                onMouseEnter={() => {
                  if (!isTooltipPinned) {
                    setActiveBucketKey(point.bucket_key);
                    setExpandedBucketKey(null);
                  }
                }}
                rx="8"
                ry="8"
                width={point.width + HIT_AREA_X_PADDING * 2}
                x={Math.max(point.x - HIT_AREA_X_PADDING, PADDING.left)}
                y={Math.max(point.y - HIT_AREA_Y_PADDING, PADDING.top)}
              />
              {labeledKeys.has(point.bucket_key) ? (
                <text className="stats-chart-label" textAnchor="middle" x={point.x + point.width / 2} y={Math.max(point.y - 12, 12)}>
                  {formatMetricValue(metric, point.value)}
                </text>
              ) : null}
              {visibleTickKeys.has(point.bucket_key) ? (
                <text className="stats-chart-tick" textAnchor="middle" x={point.x + point.width / 2} y={SVG_HEIGHT - 12}>
                  {point.bucket_label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
        {activePoint ? (
          <div
            className={`stats-chart-tooltip ${tooltipPlacement === "below" ? "below" : "above"}`}
            onClick={() => setIsTooltipPinned(true)}
            ref={tooltipRef}
            style={tooltipStyle}
          >
            <span aria-hidden="true" className="stats-chart-tooltip-arrow" />
            <strong>{`${activePoint.bucket_label} (${formatMetricValue(metric, activePoint.value)})`}</strong>
            <div className={`stats-chart-tooltip-rows ${isExpanded ? "expanded" : ""}`}>
              {visibleTooltipRows.map((row) => (
                <div className="stats-chart-tooltip-row" key={row.item_name}>
                  <span className="stats-chart-tooltip-item">
                    <span className="stats-chart-tooltip-item-name">{row.item_name}</span>
                    <span className="stats-chart-tooltip-item-amount">{row.total_amount_display}</span>
                  </span>
                  <span className="stats-chart-tooltip-value">{formatMetricValue("dollars", row.dollars)}</span>
                </div>
              ))}
            </div>
            {hasMoreRows ? (
              <button
                className="stats-chart-tooltip-toggle"
                onClick={() => setExpandedBucketKey(isExpanded ? null : activePoint.bucket_key)}
                type="button"
              >
                {isExpanded ? "Show less" : `See more (${activePoint.tooltip_rows.length - 5})`}
              </button>
            ) : null}
            {activePoint.has_multiple_units ? <em className="stats-chart-tooltip-note">Multiple units</em> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
