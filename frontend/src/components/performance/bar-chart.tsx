"use client";

import Chart from "chart.js/auto";
import { useEffect, useRef } from "react";

/** One bar series, localized before it reaches the chart. */
export interface BarSeries {
  /** The dataset label shown in the tooltip and the exported legend. */
  label: string;
  /** One value per bar, in the same order as `labels`. */
  values: number[];
}

/**
 * The Carbon-styled Chart.js column chart shared by the performance charts.
 *
 * It carries the styling the performance charts have always shared — IBM Plex
 * Sans 11px ticks, a hairline y-grid, no x-grid, no legend — so a new chart
 * does not restate the options block, and it takes its series label from the
 * caller so a hardcoded English string cannot leak into a localized screen.
 */
export function BarChart({
  labels,
  series,
  colorNegative = false,
  className,
}: {
  labels: string[];
  series: BarSeries;
  /** Paint negative values in the danger red rather than the accent. */
  colorNegative?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const key = JSON.stringify({ labels, series, colorNegative });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const parsed = JSON.parse(key) as {
      labels: string[];
      series: BarSeries;
      colorNegative: boolean;
    };
    const chart = new Chart(context, {
      type: "bar",
      data: {
        labels: parsed.labels,
        datasets: [
          {
            label: parsed.series.label,
            data: parsed.series.values,
            backgroundColor: parsed.colorNegative
              ? parsed.series.values.map((value) =>
                  value < 0 ? "#da1e28" : "#0f62fe",
                )
              : "#0f62fe",
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: "IBM Plex Sans", size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: "#e0e0e0" },
            ticks: { font: { family: "IBM Plex Sans", size: 11 } },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [key]);

  return <canvas ref={canvasRef} className={className} />;
}
