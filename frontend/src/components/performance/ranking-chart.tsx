"use client";

import Chart from "chart.js/auto";
import { useEffect, useRef } from "react";

/**
 * Company-wide ranking column chart (TOTAL PERFORMANCE SCORE per employee).
 * Rendered alongside Audit Tables 1 and 2 for the roles that may see them.
 */
export function RankingChart({
  labels,
  values,
  className,
}: {
  labels: string[];
  values: number[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const key = JSON.stringify({ labels, values });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const parsed = JSON.parse(key) as { labels: string[]; values: number[] };
    const chart = new Chart(context, {
      type: "bar",
      data: {
        labels: parsed.labels,
        datasets: [
          {
            label: "TOTAL PERFORMANCE SCORE",
            data: parsed.values,
            backgroundColor: parsed.values.map((value) =>
              value < 0 ? "#da1e28" : "#0f62fe",
            ),
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
