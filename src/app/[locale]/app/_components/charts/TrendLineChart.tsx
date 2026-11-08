type DataPoint = {
  label: string;
  value: number;
};

type TrendLineChartProps = {
  data: DataPoint[];
  color?: string;
  height?: number;
  valueFormatter?: (val: number) => string;
  emptyLabel?: string;
  ariaLabel?: string;
};

export function TrendLineChart({
  data,
  color = "var(--chart-1, #4f6bf5)",
  height = 180,
  valueFormatter = (v) => v.toString(),
  emptyLabel = "No trend data available",
  ariaLabel = "Trend line chart",
}: TrendLineChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="app-chart-empty"
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          fontSize: "0.875rem",
        }}
      >
        <span>{emptyLabel}</span>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(...values, 10);
  const valRange = maxVal - minVal || 1;

  const width = 500;
  const paddingX = 40;
  const paddingTop = 25;
  const paddingBottom = 35;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingTop - paddingBottom;

  const points = data.map((d, index) => {
    const x = paddingX + (index / Math.max(1, data.length - 1)) * innerWidth;
    const y = paddingTop + innerHeight - ((d.value - minVal) / valRange) * innerHeight;
    return { x, y, label: d.label, value: d.value };
  });

  const pathD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, "");

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${paddingTop + innerHeight} L ${points[0].x} ${paddingTop + innerHeight} Z`
    : "";

  const gridLines = [0, 0.5, 1].map((pct) => {
    const y = paddingTop + innerHeight * (1 - pct);
    const val = minVal + valRange * pct;
    return { y, label: valueFormatter(Math.round(val)) };
  });

  return (
    <div className="app-trend-chart-container" style={{ width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={`chart-grad-${height}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((line, i) => (
          <g key={i}>
            <line
              x1={paddingX}
              y1={line.y}
              x2={width - paddingX}
              y2={line.y}
              stroke="var(--border, #e5e5df)"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text
              x={paddingX - 8}
              y={line.y + 4}
              textAnchor="end"
              fill="var(--muted)"
              fontSize="10"
              fontFamily="var(--font-ui)"
            >
              {line.label}
            </text>
          </g>
        ))}

        {/* Area fill */}
        {areaD && <path d={areaD} fill={`url(#chart-grad-${height})`} />}

        {/* Line */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Dots & Labels */}
        {points.map((pt, i) => (
          <g key={i}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r="4"
              fill="var(--surface, #ffffff)"
              stroke={color}
              strokeWidth="2"
            />
            <text
              x={pt.x}
              y={height - 10}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize="11"
              fontFamily="var(--font-ui)"
            >
              {pt.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
