const pad2 = (value: number) => String(value).padStart(2, '0')

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Local YYYY-MM-DD for a day offset from today. */
export function dateAt(offsetDays: number, base = new Date()): string {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  date.setDate(date.getDate() + offsetDays)
  return isoDate(date)
}

/** ISO timestamp N hours in the past — used for demo messages. */
export function hoursAgo(hours: number, base = new Date()): string {
  return new Date(base.getTime() - hours * 3_600_000).toISOString()
}

export function parseDate(iso: string): Date {
  if (iso.includes('T')) return new Date(iso)
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function startOfToday(base = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate())
}

/** Monday at 00:00 of the week containing `base`. */
export function startOfWeek(base = new Date()): Date {
  const date = startOfToday(base)
  const shift = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - shift)
  return date
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function weekdayIndex(date = new Date()): number {
  return (date.getDay() + 6) % 7
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return minutes ? `${hours} h ${pad2(minutes)}` : `${hours} h`
}

export function formatLongDate(date = new Date()): string {
  return capitalize(date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))
}

export function formatDateShort(iso: string): string {
  return parseDate(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string): string {
  return parseDate(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTimeAgo(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - parseDate(iso).getTime()) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} j`
  return formatDateShort(iso)
}

export function daysUntil(iso: string, base = new Date()): number {
  const today = startOfToday(base).getTime()
  const target = startOfToday(parseDate(iso)).getTime()
  return Math.round((target - today) / 86_400_000)
}

export function relativeDue(iso: string): string {
  const diff = daysUntil(iso)
  if (diff === 0) return 'Aujourd’hui'
  if (diff === 1) return 'Demain'
  if (diff === -1) return 'Hier'
  if (diff < -1) return `En retard de ${Math.abs(diff)} j`
  if (diff <= 6) return capitalize(parseDate(iso).toLocaleDateString('fr-FR', { weekday: 'long' }))
  return formatDateShort(iso)
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function formatGrade(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits })
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
