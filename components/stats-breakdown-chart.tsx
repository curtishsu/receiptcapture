"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import type { StatsBreakdownKind, StatsBreakdownSlice, StatsMetric } from "@/lib/types";

type StatsBreakdownChartProps = {
  breakdownKind: StatsBreakdownKind;
  metric: StatsMetric;
  onBreakdownKindChange: (value: StatsBreakdownKind) => void;
  slices: StatsBreakdownSlice[];
};

type PlottedSlice = StatsBreakdownSlice & {
  startAngle: number;
  endAngle: number;
  midAngle: number;
  percentage: number;
};

const SVG_SIZE = 320;
const TOOLTIP_GAP = 14;
const TOOLTIP_VIEWPORT_PADDING = 14;
const PIE_COLORS = [
  "#0f766e",
  "#d97706",
  "#1d4ed8",
  "#dc2626",
  "#65a30d",
  "#7c3aed",
  "#0891b2",
  "#be185d"
];

function formatMetricValue(metric: StatsMetric, value: number): string {
  if (metric === "dollars") {
    return `$${value.toFixed(2)}`;
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatPercentage(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angle: number): { x: number; y: number } {
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle)
  };
}

function describeSlicePath(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
  return [`M ${centerX} ${centerY}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`, "Z"].join(" ");
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

function getSliceLabelMode(label: string, percentage: number, radius: number): "full" | "percentage" | "none" {
  if (percentage < 4) {
    return "none";
  }

  const percentageLabel = formatPercentage(percentage);
  const fullLabelWidth = Math.max(estimateTextWidth(label), estimateTextWidth(percentageLabel));
  const percentageLabelWidth = estimateTextWidth(percentageLabel);
  const arcLength = (percentage / 100) * Math.PI * radius;

  if (percentage >= 11 && fullLabelWidth <= arcLength * 0.88) {
    return "full";
  }

  if (percentageLabelWidth <= arcLength * 0.76) {
    return "percentage";
  }

  return "none";
}

function getBreakdownLabel(kind: StatsBreakdownKind): string {
  if (kind === "item") {
    return "Food Item";
  }

  if (kind === "type") {
    return "Food Type";
  }

  return "Category";
}

export function StatsBreakdownChart({
  breakdownKind,
  metric,
  onBreakdownKindChange,
  slices
}: StatsBreakdownChartProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [activeSliceKey, setActiveSliceKey] = useState<string | null>(null);
  const [pinnedSliceKey, setPinnedSliceKey] = useState<string | null>(null);
  const [expandedSliceKey, setExpandedSliceKey] = useState<string | null>(null);
  const [tooltipWidth, setTooltipWidth] = useState(260);
  const [tooltipHeight, setTooltipHeight] = useState(180);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const node = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth) {
        setWidth(Math.round(nextWidth));
      }
    });

    observer.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width || 640));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(".stats-chart-tooltip") ||
        target?.closest(".stats-breakdown-legend-item") ||
        target?.closest(".stats-breakdown-select")
      ) {
        return;
      }

      setActiveSliceKey(null);
      setPinnedSliceKey(null);
      setExpandedSliceKey(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!tooltipRef.current) {
      return;
    }

    const bounds = tooltipRef.current.getBoundingClientRect();
    setTooltipWidth(Math.round(bounds.width));
    setTooltipHeight(Math.round(bounds.height));
  }, [activeSliceKey, pinnedSliceKey]);

  useEffect(() => {
    setActiveSliceKey(null);
    setPinnedSliceKey(null);
    setExpandedSliceKey(null);
  }, [breakdownKind, slices]);

  if (slices.length === 0) {
    return (
      <div className="stats-chart-card empty-state">
        Save receipts with categorized items in the selected date range to generate a breakdown.
      </div>
    );
  }

  const chartSize = Math.max(Math.min(width - 36, SVG_SIZE), 240);
  const center = chartSize / 2;
  const radius = Math.max(chartSize / 2 - 20, 86);
  const labelRadius = radius * 0.62;
  let currentAngle = -Math.PI / 2;

  const plottedSlices: PlottedSlice[] = slices.map((slice) => {
    const angle = (slice.percentage_of_total / 100) * Math.PI * 2;
    const plottedSlice = {
      ...slice,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      midAngle: currentAngle + angle / 2,
      percentage: slice.percentage_of_total
    };
    currentAngle += angle;
    return plottedSlice;
  });

  const activeSlice = (pinnedSliceKey ?? activeSliceKey)
    ? plottedSlices.find((slice) => slice.key === (pinnedSliceKey ?? activeSliceKey)) ?? null
    : null;
  const isExpanded = activeSlice ? expandedSliceKey === activeSlice.key : false;
  const visibleDetailRows = activeSlice
    ? isExpanded
      ? activeSlice.detail_rows
      : activeSlice.detail_rows.slice(0, 5)
    : [];
  const hasMoreDetailRows = activeSlice ? activeSlice.detail_rows.length > 5 : false;
  const activeAnchor = activeSlice ? polarToCartesian(center, center, radius * 0.72, activeSlice.midAngle) : { x: center, y: center };
  const availableTooltipWidth = Math.max(180, width - TOOLTIP_VIEWPORT_PADDING * 2);
  const containerHeight = containerRef.current?.getBoundingClientRect().height ?? Math.max(chartSize + 120, 420);
  const shellTop = shellRef.current?.offsetTop ?? 0;
  const effectiveTooltipWidth = Math.min(tooltipWidth, availableTooltipWidth);
  const anchorX = activeAnchor.x;
  const anchorY = shellTop + activeAnchor.y;
  const tooltipLeft = Math.min(
    Math.max(anchorX - effectiveTooltipWidth / 2, TOOLTIP_VIEWPORT_PADDING),
    Math.max(TOOLTIP_VIEWPORT_PADDING, width - effectiveTooltipWidth - TOOLTIP_VIEWPORT_PADDING)
  );
  const preferredTop = anchorY - tooltipHeight - TOOLTIP_GAP;
  const fallbackTop = anchorY + TOOLTIP_GAP;
  const maxTooltipTop = Math.max(TOOLTIP_VIEWPORT_PADDING, containerHeight - tooltipHeight - TOOLTIP_VIEWPORT_PADDING);
  const preferredPlacementTop = preferredTop >= TOOLTIP_VIEWPORT_PADDING ? preferredTop : fallbackTop;
  const tooltipTop = activeSlice
    ? Math.min(Math.max(TOOLTIP_VIEWPORT_PADDING, preferredPlacementTop), maxTooltipTop)
    : TOOLTIP_VIEWPORT_PADDING;
  const tooltipStyle = {
    left: `${tooltipLeft}px`,
    top: `${tooltipTop}px`,
    maxWidth: `${availableTooltipWidth}px`,
    maxHeight: `${Math.max(140, containerHeight - TOOLTIP_VIEWPORT_PADDING * 2)}px`,
    ["--tooltip-arrow-left" as any]: `${anchorX - tooltipLeft}px`
  } as CSSProperties;

  return (
    <div className="stats-chart-card stats-breakdown-card" ref={containerRef}>
      <div className="stats-chart-meta">
        <div className="stats-chart-heading">
          <div className="stats-chart-title-row">
            <h3 className="section-title">Breakdown</h3>
            <select
              className="field stats-bucket-select stats-breakdown-select"
              onChange={(event) => onBreakdownKindChange(event.target.value as StatsBreakdownKind)}
              value={breakdownKind}
            >
              <option value="item">Food Item</option>
              <option value="type">Food Type</option>
              <option value="category">Category</option>
            </select>
          </div>
        </div>
      </div>
      <div className="stats-chart-shell stats-breakdown-shell" ref={shellRef}>
        <svg
          aria-label={`Food purchase breakdown by ${getBreakdownLabel(breakdownKind).toLowerCase()}`}
          className="stats-chart stats-breakdown-svg"
          height={chartSize}
          viewBox={`0 0 ${chartSize} ${chartSize}`}
          width="100%"
        >
          <g
            onMouseLeave={() => {
              if (!pinnedSliceKey) {
                setActiveSliceKey(null);
              }
            }}
          >
            {plottedSlices.map((slice, index) => {
              const color = PIE_COLORS[index % PIE_COLORS.length];
              const isActive = activeSlice?.key === slice.key;
              const labelPoint = polarToCartesian(center, center, labelRadius, slice.midAngle);
              const labelMode = getSliceLabelMode(slice.label, slice.percentage, labelRadius);

              return (
                <g key={slice.key}>
                  <path
                    className={`stats-breakdown-slice${isActive ? " active" : ""}`}
                    d={describeSlicePath(center, center, radius, slice.startAngle, slice.endAngle)}
                    fill={color}
                    onMouseEnter={() => {
                      if (!pinnedSliceKey) {
                        setActiveSliceKey(slice.key);
                      }
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setActiveSliceKey(slice.key);
                      setExpandedSliceKey(null);
                      setPinnedSliceKey(slice.key);
                    }}
                  />
                  {labelMode !== "none" ? (
                    <text className="stats-breakdown-label" textAnchor="middle" x={labelPoint.x} y={labelPoint.y}>
                      {labelMode === "full" ? (
                        <>
                          <tspan x={labelPoint.x} dy="-0.25em">
                            {slice.label}
                          </tspan>
                          <tspan x={labelPoint.x} dy="1.2em">
                            {formatPercentage(slice.percentage)}
                          </tspan>
                        </>
                      ) : (
                        <tspan x={labelPoint.x} dy="0.35em">
                          {formatPercentage(slice.percentage)}
                        </tspan>
                      )}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {activeSlice ? (
        <div
          className="stats-chart-tooltip stats-breakdown-tooltip"
          ref={tooltipRef}
          style={tooltipStyle}
        >
          <strong>{activeSlice.label}</strong>
          <div className="stats-breakdown-tooltip-summary">
            <span>{formatMetricValue(metric, activeSlice.amount)}</span>
            <span>{formatPercentage(activeSlice.percentage_of_total)}</span>
          </div>
          {activeSlice.is_others && activeSlice.detail_rows.length > 0 ? (
            <>
              <div className="stats-chart-tooltip-table-head">
                <span>{getBreakdownLabel(breakdownKind)}</span>
                <span>%</span>
              </div>
              <div className="stats-chart-tooltip-rows">
                {visibleDetailRows.map((row) => (
                  <div className="stats-chart-tooltip-row" key={row.label}>
                    <span className="stats-chart-tooltip-item">
                      <span className="stats-chart-tooltip-item-name">{row.label}</span>
                    </span>
                    <span className="stats-chart-tooltip-value">{formatPercentage(row.percentage_of_total)}</span>
                  </div>
                ))}
              </div>
              {hasMoreDetailRows ? (
                <button
                  className="stats-chart-tooltip-toggle"
                  onClick={() => setExpandedSliceKey(isExpanded ? null : activeSlice.key)}
                  type="button"
                >
                  {isExpanded ? "Show less" : `See more (${activeSlice.detail_rows.length - 5})`}
                </button>
              ) : null}
            </>
          ) : breakdownKind !== "item" && activeSlice.detail_rows.length > 0 ? (
            <>
              <div className="stats-chart-tooltip-table-head">
                <span>Food Items</span>
                <span>% of Slice</span>
              </div>
              <div className="stats-chart-tooltip-rows">
                {visibleDetailRows.map((row) => (
                  <div className="stats-chart-tooltip-row" key={row.label}>
                    <span className="stats-chart-tooltip-item">
                      <span className="stats-chart-tooltip-item-name">{row.label}</span>
                    </span>
                    <span className="stats-chart-tooltip-value">{formatPercentage(row.percentage_of_slice)}</span>
                  </div>
                ))}
              </div>
              {hasMoreDetailRows ? (
                <button
                  className="stats-chart-tooltip-toggle"
                  onClick={() => setExpandedSliceKey(isExpanded ? null : activeSlice.key)}
                  type="button"
                >
                  {isExpanded ? "Show less" : `See more (${activeSlice.detail_rows.length - 5})`}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      <div className="stats-breakdown-legend" role="list" aria-label="Breakdown legend">
        {plottedSlices.map((slice, index) => {
          const isActive = activeSlice?.key === slice.key;
          return (
            <button
              className={`stats-breakdown-legend-item${isActive ? " active" : ""}`}
              key={slice.key}
              onClick={() => {
                setActiveSliceKey(slice.key);
                setExpandedSliceKey(null);
                setPinnedSliceKey(slice.key);
              }}
              role="listitem"
              type="button"
            >
              <span
                aria-hidden="true"
                className="stats-breakdown-legend-swatch"
                style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
              />
              <span className="stats-breakdown-legend-label">{slice.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
