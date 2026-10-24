"use client";

import Chart from "chart.js/auto";
import { useEffect, useRef } from "react";

export interface ChartSegment {
  label: string;
  value: number;
  color: string;
}

/** Chart.js doughnut for the personal KPI score composition. */
export function DonutChart({
  segments,
  className,
}: {
  segments: ChartSegment[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const key = JSON.stringify(segments);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const data = JSON.parse(key) as ChartSegment[];
    const chart = new Chart(context, {
      type: "doughnut",
      data: {
        labels: data.map((segment) => segment.label),
        datasets: [
          {
            data: data.map((segment) => Math.abs(segment.value)),
            backgroundColor: data.map((segment) => segment.color),
            borderColor: "#ffffff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              font: { family: "IBM Plex Sans", size: 11 },
            },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [key]);

  return <canvas ref={canvasRef} className={className} />;
}
