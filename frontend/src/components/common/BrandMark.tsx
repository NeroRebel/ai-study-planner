/** Open pages with a small bookmark: a compact mark for the study workspace. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M14 7.5C10.8 5.5 7.4 5.1 3.5 5.6v15.1c3.9-.5 7.3-.1 10.5 1.9 3.2-2 6.6-2.4 10.5-1.9V5.6c-3.9-.5-7.3-.1-10.5 1.9Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
    <path d="M14 7.5v15.1M8 10v5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    <path d="M19 9v4l1.5-1 1.5 1V8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
