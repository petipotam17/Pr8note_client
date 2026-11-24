import type { AccentId, Settings } from '../types'

export const ACCENTS: Record<AccentId, { name: string; from: string; to: string; glow: string }> = {
  violet: { name: 'Violet', from: '#8b7bff', to: '#22d3ee', glow: 'rgba(139, 123, 255, 0.35)' },
  cyan: { name: 'Cyan', from: '#22d3ee', to: '#6d5efc', glow: 'rgba(34, 211, 238, 0.28)' },
  emerald: { name: 'Émeraude', from: '#34d399', to: '#22d3ee', glow: 'rgba(52, 211, 153, 0.28)' },
  sunset: { name: 'Sunset', from: '#ff7a59', to: '#ffb86b', glow: 'rgba(255, 122, 89, 0.3)' },
  rose: { name: 'Rose', from: '#f472b6', to: '#a78bfa', glow: 'rgba(244, 114, 182, 0.28)' },
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'violet',
  density: 'comfortable',
  motion: true,
  sidebarCollapsed: false,
}

export function applyTheme(settings: Settings): void {
  const root = document.documentElement
  root.dataset.theme = settings.theme
  root.dataset.density = settings.density
  root.dataset.motion = settings.motion ? 'on' : 'off'

  const accent = ACCENTS[settings.accent]
  root.style.setProperty('--accent', accent.from)
  root.style.setProperty('--accent-2', accent.to)
  root.style.setProperty('--accent-glow', accent.glow)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', settings.theme === 'dark' ? '#08090f' : '#f4f5fa')
}
