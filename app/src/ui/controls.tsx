import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

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

const plain = (v: number, digits: number) => v.toLocaleString('en-US', { maximumFractionDigits: digits })

/**
 * A typed number with its unit beside it ("$ 14.00 /MMBtu"). The phone keypad
 * opens; commas and $ are ignored; out-of-range entries are held to min/max.
 */
export function NumberField({
  label, value, onChange, min = 0, max = Infinity, digits = 2, fixed, prefix, unit, hint, big,
}: {
  label: ReactNode
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  /** Most decimals kept. */
  digits?: number
  /** Always show this many decimals when not editing (prices). */
  fixed?: number
  prefix?: string
  unit?: string
  hint?: ReactNode
  big?: boolean
}) {
  const id = useId()
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? (fixed !== undefined ? value.toLocaleString('en-US', { minimumFractionDigits: fixed, maximumFractionDigits: fixed }) : plain(value, digits))
  return (
    <div className={`numfield ${big ? 'big' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="nf-box">
        {prefix && <span className="nf-affix">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={shown}
          onFocus={(e) => { setText(String(+value.toFixed(digits))); requestAnimationFrame(() => e.target.select()) }}
          onBlur={() => setText(null)}
          onChange={(e) => {
            setText(e.target.value)
            const v = parseFloat(e.target.value.replace(/[,$\s]/g, ''))
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
          }}
        />
        {unit && <span className="nf-affix">{unit}</span>}
      </div>
      {hint && <div className="nf-hint">{hint}</div>}
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
export type IconName = 'flame' | 'snow' | 'drop' | 'cube' | 'compare' | 'thermo' | 'layers' | 'check' | 'alert' | 'x' | 'spark' | 'info' | 'book' | 'target' | 'wind' | 'cut' | 'link' | 'pipe' | 'help' | 'map' | 'reset' | 'dots' | 'eye'

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
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
    pipe: <><rect x="2.5" y="9" width="19" height="6" rx="1.5" /><path d="M6.5 6.5v11M17.5 6.5v11" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17.2v.3" /></>,
    map: <><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" /><path d="M9 4v13.5M15 6.5V20" /></>,
    link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
    reset: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>,
    dots: <><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></>,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  }[name]
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {p}
    </svg>
  )
}

export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  /** A toggle (check) or one of a set (radio); omitted for a plain action. */
  kind?: 'check' | 'radio'
  checked?: boolean
  disabled?: boolean
  /** Small second line, e.g. why the item is unavailable. */
  hint?: string
  onSelect: () => void
}

/** A labelled button that opens a list of labelled actions above it (the phone toolbar). */
export function MenuButton({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`tool ${open ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="dots" size={16} /> <span>{label}</span>
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={label}>
          {items.map((it) => (
            <button
              key={it.id}
              role={it.kind === 'check' ? 'menuitemcheckbox' : it.kind === 'radio' ? 'menuitemradio' : 'menuitem'}
              aria-checked={it.kind ? !!it.checked : undefined}
              className={it.checked ? 'on' : ''}
              disabled={it.disabled}
              onClick={() => {
                it.onSelect()
                setOpen(false)
              }}
            >
              {it.icon && <Icon name={it.icon} size={17} />}
              <span className="menu-label">
                {it.label}
                {it.hint && <small>{it.hint}</small>}
              </span>
              {it.kind && <span className="menu-check">{it.checked && <Icon name="check" size={15} />}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
