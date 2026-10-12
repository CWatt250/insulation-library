/** Energy-code choice as wrapping chips (five options don't fit a phone-width segmented bar). */
export function CodeChips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="chips code-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === value} className={o.id === value ? 'on' : ''} title={o.hint} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}
