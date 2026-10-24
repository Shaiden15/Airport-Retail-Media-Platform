// Lightweight SVG charts: no chart library, theme colours via currentColor and CSS variables

export function BarChart({ data, height = 160, format = (v: number) => String(v), label }: { data: { label: string; value: number; highlight?: boolean }[]; height?: number; format?: (v: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const width = Math.max(300, data.length * 28);
  const bar = width / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 ${width} ${height + 24}`} className="h-auto w-full" role="img" aria-label={label}>
      {data.map((d, i) => {
        const h = (d.value / max) * height;
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={i * bar + 3} y={height - h} width={bar - 6} height={h} rx={3} className={d.highlight ? 'fill-[var(--dc-accent)]' : 'fill-[var(--dc-primary)]'} opacity={d.highlight ? 1 : 0.8}>
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
            <text x={i * bar + bar / 2} y={height + 16} textAnchor="middle" className="fill-[var(--dc-muted)] text-[10px]">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function AreaChart({ points, height = 140, label, format = (v: number) => String(v) }: { points: { label: string; value: number }[]; height?: number; label: string; format?: (v: number) => string }) {
  const width = 600;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = width / Math.max(1, points.length - 1);
  const xy = points.map((p, i) => [i * step, height - (p.value / max) * (height - 10)] as const);
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height + 22}`} className="h-auto w-full" role="img" aria-label={label}>
      <path d={area} className="fill-[var(--dc-primary)]" opacity={0.18} />
      <path d={line} className="stroke-[var(--dc-primary)]" fill="none" strokeWidth={2.5} />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} className="fill-[var(--dc-primary)]">
          <title>{`${points.at(i)?.label ?? ''}: ${format(points.at(i)?.value ?? 0)}`}</title>
        </circle>
      ))}
      {points.map((p, i) =>
        i % Math.ceil(points.length / 7) === 0 ? (
          <text key={p.label + i} x={i * step} y={height + 16} textAnchor={i === 0 ? 'start' : 'middle'} className="fill-[var(--dc-muted)] text-[11px]">
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

// Grid of cells shaded by value; used for the segment heatmap and the inventory calendar
export function HeatGrid({ rows, columns, cell, label }: { rows: { key: string; label: string }[]; columns: string[]; cell: (row: number, col: number) => { value: number; text?: string; tone?: string; title: string }; label: string }) {
  return (
    <div className="overflow-x-auto" role="table" aria-label={label}>
      <div className="inline-grid min-w-full gap-px" style={{ gridTemplateColumns: `10rem repeat(${columns.length}, minmax(1.9rem, 1fr))` }}>
        <div />
        {columns.map((c) => (
          <div key={c} className="px-0.5 text-center text-[10px] text-muted">
            {c}
          </div>
        ))}
        {rows.map((r, ri) => (
          <div key={r.key} className="contents" role="row">
            <div className="truncate pr-2 text-xs" title={r.label}>
              {r.label}
            </div>
            {columns.map((c, ci) => {
              const v = cell(ri, ci);
              return (
                <div key={c} className={`h-6 rounded-sm text-center text-[9px] leading-6 ${v.tone ?? ''}`} style={v.tone ? undefined : { backgroundColor: `color-mix(in srgb, var(--dc-primary) ${Math.round(v.value * 100)}%, transparent)` }} title={v.title}>
                  {v.text}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShareBars({ shares, labels }: { shares: { key: string; value: number }[]; labels?: (k: string) => string }) {
  return (
    <div className="space-y-1.5">
      {shares.map((s) => (
        <div key={s.key} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-2 text-sm">
          <span className="truncate text-muted">{labels ? labels(s.key) : s.key}</span>
          <span className="h-2 rounded-full bg-muted/15">
            <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.round(s.value * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums">{Math.round(s.value * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
