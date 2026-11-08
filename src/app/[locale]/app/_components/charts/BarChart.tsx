import type { ReactNode } from "react";

type BarItem = {
  id: string;
  label: string;
  value: number;
  color?: string;
  supportingText?: ReactNode;
};

type BarChartProps = {
  items: BarItem[];
  valueFormatter?: (val: number) => string;
  maxValue?: number;
  emptyLabel?: string;
  ariaLabel?: string;
};

export function BarChart({
  items,
  valueFormatter = (v) => v.toString(),
  maxValue,
  emptyLabel = "No data available",
  ariaLabel = "Horizontal bar chart",
}: BarChartProps) {
  if (items.length === 0) {
    return (
      <div
        className="app-chart-empty"
        style={{
          padding: "24px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: "0.875rem",
        }}
      >
        <span>{emptyLabel}</span>
      </div>
    );
  }

  const computedMax = maxValue ?? Math.max(...items.map((i) => i.value), 1);

  return (
    <div
      className="app-bar-chart"
      role="group"
      aria-label={ariaLabel}
      style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}
    >
      {items.map((item) => {
        const percent = Math.min(100, Math.max(0, Math.round((item.value / computedMax) * 100)));
        const barColor = item.color || "var(--chart-1, #4f6bf5)";

        return (
          <div key={item.id} className="app-bar-row" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.875rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: barColor,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
                <span style={{ fontWeight: 500, color: "var(--ink)" }}>{item.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {item.supportingText ? (
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{item.supportingText}</span>
                ) : null}
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{valueFormatter(item.value)}</span>
              </div>
            </div>

            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "var(--surface-sunken, #e5e5df)",
                borderRadius: "var(--radius-pill, 999px)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  backgroundColor: barColor,
                  borderRadius: "var(--radius-pill, 999px)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
