/**
 * Watt Systems branding: the product mark (favicon.svg — a pipe in section with
 * the Watt bolt, in the family's white frame and navy tile) and the credit line.
 */
export const BRAND = { product: 'Insulation Library', company: 'Watt Systems', author: 'Colton Watt' }

export function ProductMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="ws-mark">
      <rect width="100" height="100" rx="22" fill="#fff" />
      <rect x="10" y="10" width="80" height="80" rx="14" fill="#0F2340" />
      <circle cx="50" cy="50" r="29" fill="#E6EBF0" />
      <circle cx="50" cy="50" r="25.5" fill="#F2B52A" />
      <circle cx="50" cy="50" r="12" fill="#E6EBF0" />
      <circle cx="50" cy="50" r="9" fill="#0F2340" />
      <path transform="translate(47.2 41) scale(0.7)" d="M 6.2 0 L -3.6 12.6 L 1.6 12.6 L -0.8 25 L 9 12.4 L 3.8 12.4 Z" fill="#F97316" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

/** "Insulation Library by Watt Systems": the eyebrow over a panel. */
export function BrandLine() {
  return (
    <span className="brand ws-brand">
      <ProductMark size={18} /> {BRAND.product} <span className="ws-by">by {BRAND.company}</span>
    </span>
  )
}

/** The credit at the foot of a panel. */
export function BrandFooter() {
  return (
    <footer className="ws-foot">
      <ProductMark size={16} />
      <span><b>{BRAND.product}</b> by {BRAND.company}</span>
      <span className="ws-credit">Created by {BRAND.author}</span>
    </footer>
  )
}
