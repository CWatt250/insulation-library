/**
 * Watt Systems branding: the product mark (the Watt Systems tile and bolt over
 * a pipe in section, as favicon.svg) and the credit line.
 */
export const BRAND = { product: 'Insulation Library', company: 'Watt Systems', author: 'Colton Watt' }

export function ProductMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="ws-mark">
      <defs>
        <linearGradient id="ws-bolt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F97316" />
          <stop offset="1" stopColor="#EA580C" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" fill="#0F2340" />
      <circle cx="16" cy="16" r="12.2" fill="#c9ccd0" />
      <circle cx="16" cy="16" r="11" fill="#e9c552" />
      <circle cx="16" cy="16" r="5.6" fill="#3a3d42" />
      <circle cx="16" cy="16" r="4.4" fill="#0F2340" />
      <path d="M19.4 3.4 L8.9 16.9 L14.4 16.9 L12 28.6 L22.4 15.1 L16.9 15.1 Z" fill="url(#ws-bolt)" stroke="#fff" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  )
}

/** "Insulation Library by Watt Systems": the eyebrow over a panel. */
export function BrandLine() {
  return (
    <span className="brand ws-brand">
      <ProductMark size={16} /> {BRAND.product} <span className="ws-by">by {BRAND.company}</span>
    </span>
  )
}

/** The credit at the foot of a panel. */
export function BrandFooter() {
  return (
    <footer className="ws-foot">
      <ProductMark size={14} />
      <span><b>{BRAND.product}</b> by {BRAND.company}</span>
      <span className="ws-credit">Created by {BRAND.author}</span>
    </footer>
  )
}
