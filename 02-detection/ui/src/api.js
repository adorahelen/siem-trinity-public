const BASE = '/api'

export async function fetchSummary(date) {
  const q = date ? `?date=${date}` : ''
  const r = await fetch(`${BASE}/summary${q}`)
  if (!r.ok) throw new Error(`summary: ${r.status}`)
  return r.json()
}

export async function fetchAlerts({ date, detector, verdict, page = 1, limit = 50 } = {}) {
  const p = new URLSearchParams()
  if (date) p.set('date', date)
  if (detector) p.set('detector', detector)
  if (verdict) p.set('verdict', verdict)
  p.set('page', page)
  p.set('limit', limit)
  const r = await fetch(`${BASE}/alerts?${p}`)
  if (!r.ok) throw new Error(`alerts: ${r.status}`)
  return r.json()
}

export async function fetchStatus() {
  const r = await fetch(`${BASE}/status`)
  if (!r.ok) throw new Error(`status: ${r.status}`)
  return r.json()
}

export async function triggerRun() {
  const r = await fetch(`${BASE}/run`, { method: 'POST' })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.detail || `run: ${r.status}`)
  }
  return r.json()
}

export async function fetchHistory() {
  const r = await fetch(`${BASE}/history`)
  if (!r.ok) throw new Error(`history: ${r.status}`)
  return r.json()
}

export async function fetchCompare(date1, date2) {
  const p = new URLSearchParams({ date1 })
  if (date2) p.set('date2', date2)
  const r = await fetch(`${BASE}/compare?${p}`)
  if (!r.ok) throw new Error(`compare: ${r.status}`)
  return r.json()
}
