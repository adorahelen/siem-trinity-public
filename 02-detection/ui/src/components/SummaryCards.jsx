const CARD_DATA = [
  { key: 'total',    label: '전체 경보',     color: '#58a6ff', bg: 'rgba(88,166,255,0.08)' },
  { key: 'critical', label: 'Critical+Danger', color: '#f85149', bg: 'rgba(248,81,73,0.08)' },
  { key: 'high',     label: 'High',          color: '#d29922', bg: 'rgba(210,153,34,0.08)' },
  { key: 'medium',   label: 'Medium',        color: '#1f6feb', bg: 'rgba(31,111,235,0.08)' },
]

function getCount(summary, key) {
  if (!summary) return '—'
  if (key === 'total') return summary.total ?? 0
  const v = summary.by_verdict || {}
  if (key === 'critical') return (v.Critical || 0) + (v.Danger || 0)
  if (key === 'high')     return v.High || 0
  if (key === 'medium')   return v.Medium || 0
  return 0
}

export default function SummaryCards({ summary }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '12px',
      padding: '20px 0 0',
    }}>
      {CARD_DATA.map(({ key, label, color, bg }) => (
        <div key={key} style={{
          background: '#161b22',
          border: `1px solid #30363d`,
          borderTop: `2px solid ${color}`,
          borderRadius: '8px',
          padding: '16px 20px',
          background: bg,
        }}>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '8px' }}>{label}</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color, letterSpacing: '-0.02em' }}>
            {getCount(summary, key)}
          </div>
          <div style={{ fontSize: '10px', color: '#484f58', marginTop: '6px' }}>
            {summary?.date || '오늘'}
          </div>
        </div>
      ))}
    </div>
  )
}
