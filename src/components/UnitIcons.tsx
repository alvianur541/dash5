interface IconProps { size?: number; className?: string }

const svgProps = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export function ExcavatorIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <rect x="2" y="16.5" width="12" height="4.5" rx="2.25" />
      <path d="M4 16.5V12h3l1-3h4v7.5" />
      <path d="M12 12l4.5-7 5 6.5" />
      <path d="M21.5 11.5c0 2.5-1.5 4-4 4" />
    </svg>
  );
}

export function WheelLoaderIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="5.5" cy="18" r="3" />
      <circle cx="14" cy="18" r="3" />
      <path d="M2.5 14.5V11H5V5h5l1 6h3.5v3.5" />
      <path d="M8.5 18h2.5" />
      <path d="M14.5 11l3.5 2.5" />
      <path d="M17.5 10.5h4l-1 6h-3z" />
    </svg>
  );
}
