// Small dependency-free charts for the Super Admin dashboard (plain SVG, responsive, with hover tooltips).
// Colours come from the site theme: crimson for the headline series, graphite for secondary marks.
import { useEffect, useRef, useState } from 'react'
const MUTED = 'var(--color-muted)'
const GRID = 'var(--color-line)'

const dayLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export const compactINR = (n) =>
  n >= 1e7 ? `₹${+(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${+(n / 1e3).toFixed(1)}K` : `₹${Math.round(n)}`

// Round the top of the axis up to a clean number (1, 2, 2.5, 5, 10 x 10^n) and return evenly spaced ticks.
function niceScale(max, tickCount = 4) {
  if (max <= 0) return { top: tickCount, ticks: Array.from({ length: tickCount + 1 }, (_, i) => i) }
  const rough = max / tickCount
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough)
  const top = step * tickCount
  return { top, ticks: Array.from({ length: tickCount + 1 }, (_, i) => i * step) }
}

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

// A rounded-top, square-bottom bar (4px radius at the data end only).
const barPath = (x, y, w, h, r = 4) => {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}

export function ChartCard({ title, subtitle, children, table }) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-white p-4 sm:p-5">
      <h3 className="font-sans text-sm font-semibold text-ink">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
      {table && (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer select-none hover:text-ink">View as table</summary>
          <div className="mt-2 max-h-56 overflow-auto rounded border border-line">{table}</div>
        </details>
      )}
    </section>
  )
}

// kind: 'area' (line + soft fill, for revenue over time) | 'bars' (counts per day)
export function TimeChart({ data, valueKey, kind, color, formatValue, axisFormat, ariaLabel, emptyText, height = 240 }) {
  const [wrapRef, width] = useWidth()
  const [hover, setHover] = useState(null)

  const small = width > 0 && width < 480
  const H = small ? Math.min(height, 200) : height
  const m = { top: 14, right: 14, bottom: 28, left: small ? 40 : 52 }
  const plotW = Math.max(width - m.left - m.right, 10)
  const plotH = H - m.top - m.bottom

  const values = data.map((d) => d[valueKey])
  const max = Math.max(0, ...values)
  const { top, ticks } = niceScale(max, 4)
  const empty = max === 0

  const n = data.length
  const xAt = (i) => (kind === 'bars' ? m.left + (plotW / n) * (i + 0.5) : m.left + (n === 1 ? plotW / 2 : (plotW / (n - 1)) * i))
  const yAt = (v) => m.top + plotH - (v / top) * plotH
  const slot = kind === 'bars' ? plotW / n : plotW / Math.max(n - 1, 1)
  const labelEvery = Math.max(1, Math.ceil(64 / slot))
  const barW = Math.max(2, Math.min(24, slot - 2))

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left - m.left
    const idx = kind === 'bars' ? Math.floor(x / slot) : Math.round(x / slot)
    setHover(Math.max(0, Math.min(n - 1, idx)))
  }

  const points = data.map((d, i) => `${xAt(i)},${yAt(d[valueKey])}`).join(' ')
  const hov = hover != null ? data[hover] : null
  const tipLeft = hover != null ? Math.min(Math.max(xAt(hover), 70), Math.max(width - 70, 70)) : 0

  return (
    <div ref={wrapRef} className="relative w-full min-w-0 select-none">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={ariaLabel} className="block max-w-full overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + plotW} y1={yAt(t)} y2={yAt(t)} stroke={GRID} strokeWidth="1" />
              <text x={m.left - 8} y={yAt(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={MUTED}>
                {axisFormat(t)}
              </text>
            </g>
          ))}

          {kind === 'area' && !empty && (
            <>
              <polygon points={`${xAt(0)},${yAt(0)} ${points} ${xAt(n - 1)},${yAt(0)}`} fill={color} opacity="0.1" />
              <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={xAt(n - 1)} cy={yAt(values[n - 1])} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
            </>
          )}

          {kind === 'bars' &&
            data.map((d, i) => {
              const h = (d[valueKey] / top) * plotH
              if (h <= 0) return null
              return <path key={d.date} d={barPath(xAt(i) - barW / 2, yAt(d[valueKey]), barW, h)} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />
            })}

          {data.map((d, i) =>
            // label every Nth day, counting back from the newest so the latest date is always shown
            (n - 1 - i) % labelEvery === 0 ? (
              <text key={d.date} x={xAt(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="11" fill={MUTED}>
                {dayLabel(d.date)}
              </text>
            ) : null,
          )}

          <line x1={m.left} x2={m.left + plotW} y1={yAt(0)} y2={yAt(0)} stroke="var(--color-line)" strokeWidth="1.5" />

          {hov && kind === 'area' && (
            <>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={m.top} y2={yAt(0)} stroke={MUTED} strokeWidth="1" />
              <circle cx={xAt(hover)} cy={yAt(hov[valueKey])} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
            </>
          )}

          {/* wide invisible target so hover/touch is easy */}
          <rect x={m.left} y={m.top} width={plotW} height={plotH + 10} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}

      {empty && width > 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted">{emptyText}</p>
      )}

      {hov && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md bg-ink px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: tipLeft, top: 0 }}
        >
          <p className="text-white/70">{dayLabel(hov.date)}</p>
          <p className="font-semibold">{formatValue(hov[valueKey])}</p>
        </div>
      )}
    </div>
  )
}

// Horizontal bars: one row per status, with the count at the tip of each bar.
export function StatusBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[8rem_1fr_3rem]">
          <span className={r.muted ? 'text-muted' : 'text-ink'}>{r.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-mist" aria-hidden="true">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(r.count / max) * 100}%`, minWidth: r.count > 0 ? '6px' : 0, background: r.accent ? 'var(--color-crimson)' : r.muted ? 'var(--color-muted)' : 'var(--color-graphite)' }}
            />
          </span>
          <span className="text-right font-semibold tabular-nums">{r.count}</span>
        </li>
      ))}
    </ul>
  )
}

export function DataTable({ columns, rows }) {
  return (
    <table className="w-full text-left">
      <thead className="sticky top-0 bg-mist text-[11px] uppercase tracking-wider">
        <tr>{columns.map((c) => <th key={c.key} className="px-3 py-2 font-semibold">{c.label}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => (
          <tr key={i}>{columns.map((c) => <td key={c.key} className="px-3 py-1.5 tabular-nums text-ink">{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

export { dayLabel }
