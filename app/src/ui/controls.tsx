import { useId, useState, type ReactNode } from 'react'

/** Large, live-updating slider. Discrete scales pass `values` and the slider moves by index. */
export function Slider({
  label, value, onChange, min, max, step = 1, values, format, hint, accent, disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  /** Discrete values; the slider position is the index. */
  values?: number[]
  format: (v: number) => string
  hint?: ReactNode
  accent?: string
  disabled?: boolean
}) {
  const id = useId()
  const discrete = !!values
  const lo = discrete ? 0 : min ?? 0
  const hi = discrete ? values!.length - 1 : max ?? 100
  const nearest = discrete ? values!.reduce((bi, v, i) => (Math.abs(v - value) < Math.abs(values![bi] - value) ? i : bi), 0) : 0
  const pos = discrete ? nearest : value
  const pct = hi > lo ? ((pos - lo) / (hi - lo)) * 100 : 0
  return (
    <div className={`slider ${disabled ? 'disabled' : ''}`} style={accent ? ({ '--acc': accent } as React.CSSProperties) : undefined}>
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={lo}
        max={hi}
        step={discrete ? 1 : step}
        value={pos}
        disabled={disabled}
        aria-valuetext={format(value)}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => {
          const v = Number(e.target.value)
          onChange(discrete ? values![v] : v)
        }}
      />
      {hint && <div className="slider-hint">{hint}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, label, size }: {
  options: { id: T; label: ReactNode; disabled?: boolean; title?: string }[]
  value: T
  onChange: (v: T) => void
  label?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={`segmented ${size ?? 'md'}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={o.id === value}
          className={o.id === value ? 'on' : ''}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Collapsible section; closed by default. */
export function Disclosure({ title, children, defaultOpen = false, badge }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`disclosure ${open ? 'open' : ''}`}>
      <button className="disclosure-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        {badge}
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <div className="disclosure-body">{children}</div>}
    </div>
  )
}

/** Small inline icons (stroke, currentColor). */
export function Icon({ name, size = 18 }: { name: 'flame' | 'snow' | 'drop' | 'cube' | 'compare' | 'thermo' | 'layers' | 'check' | 'alert' | 'x' | 'spark' | 'info' | 'book' | 'target' | 'wind' | 'cut'; size?: number }) {
  const p = {
    flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 3 0-3.3-.5-5.8 1-8.5z" />,
    snow: <><path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18" /><path d="M9 3.5 12 6l3-2.5M9 20.5 12 18l3 2.5" /></>,
    drop: <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" />,
    cube: <><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="M3 7l9 5 9-5M12 12v10" /></>,
    compare: <><rect x="3" y="4" width="7.5" height="16" rx="2" /><rect x="13.5" y="4" width="7.5" height="16" rx="2" /></>,
    thermo: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" /><path d="M12 9v7" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.5" /></>,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
    book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    wind: <path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" />,
    cut: <><path d="M4 20 20 4" /><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /></>,
  }[name]
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {p}
    </svg>
  )
}
