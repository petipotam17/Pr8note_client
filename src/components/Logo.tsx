import { useId } from 'react'

export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  const gradientId = `pr8-logo-${useId().replace(/:/g, '')}`
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="0.55" stopColor="#6d5efc" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill={`url(#${gradientId})`} />
      <path
        fillRule="evenodd"
        d="M21 16h13.2c7.9 0 13 4.4 13 11.2s-5.1 11.3-13 11.3H28.4V48H21V16Zm7 6.4v9.7h5.6c3.5 0 5.7-1.9 5.7-4.9s-2.2-4.8-5.7-4.8H28Z"
        fill="#fff"
      />
      <circle cx="47" cy="47" r="3.6" fill="#c9ff66" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`} aria-label="Pr8note">
      Pr<span>8</span>note
    </span>
  )
}
