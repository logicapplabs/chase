export function formatWhen(at: Date, now: Date): string {
  if (at.getTime() - now.getTime() <= 30_000) return 'now'
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((day(at) - day(now)) / 86_400_000)
  if (dayDiff === 0) return time
  if (dayDiff === 1) return `tomorrow ${time}`
  if (dayDiff > 1 && dayDiff < 7) {
    return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`
  }
  return `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromDateInput(value: string, hour: number): string | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, hour, 0, 0, 0).toISOString()
}
