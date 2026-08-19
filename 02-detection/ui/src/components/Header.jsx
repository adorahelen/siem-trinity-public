const S = {
  header: {
    background: '#010409',
    borderBottom: '1px solid #30363d',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  left: { display: 'flex', alignItems: 'center', gap: '20px' },
  title: { color: '#58a6ff', fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.05em' },
  badge: (running) => ({
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '12px',
    background: running ? 'rgba(63,185,80,0.15)' : 'rgba(48,54,61,0.8)',
    color: running ? '#3fb950' : '#8b949e',
    border: `1px solid ${running ? '#238636' : '#30363d'}`,
    animation: running ? 'pulse 1.5s ease-in-out infinite' : 'none',
  }),
  meta: { fontSize: '11px', color: '#8b949e', display: 'flex', gap: '16px', alignItems: 'center' },
  metaItem: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  metaLabel: { color: '#484f58', fontSize: '10px' },
  metaValue: { color: '#8b949e' },
  select: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '5px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    outline: 'none',
  },
  btn: (disabled) => ({
    background: disabled ? '#21262d' : '#238636',
    color: disabled ? '#484f58' : '#fff',
    border: `1px solid ${disabled ? '#30363d' : '#2ea043'}`,
    borderRadius: '6px',
    padding: '5px 14px',
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  error: {
    fontSize: '11px',
    color: '#f85149',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}

function fmt(iso) {
  if (!iso) return '—'
  return iso.replace('T', ' ').substring(0, 16)
}

export default function Header({
  summary, isRunning, error, onRun,
  historyDates, selectedDate, onDateChange,
}) {
  const status = summary?.status || {}
  const isToday = !selectedDate

  return (
    <>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      <header style={S.header}>
        <div style={S.left}>
          <span style={S.title}>⬡ SIEM AI Detector</span>
          <span style={S.badge(isRunning && isToday)}>
            {isRunning && isToday ? '● 실행 중' : '○ 대기'}
          </span>
          {error && <span style={S.error} title={error}>⚠ {error}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* 날짜 선택 */}
          <select
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            style={S.select}
          >
            <option value="">오늘</option>
            {historyDates.map(({ date, count }) => (
              <option key={date} value={date}>
                {date} ({count}건)
              </option>
            ))}
          </select>

          <div style={S.meta}>
            <div style={S.metaItem}>
              <span style={S.metaLabel}>마지막 실행</span>
              <span style={S.metaValue}>{fmt(status.last_run)}</span>
            </div>
            <div style={S.metaItem}>
              <span style={S.metaLabel}>다음 실행 (30분)</span>
              <span style={S.metaValue}>{fmt(status.next_run)}</span>
            </div>
          </div>

          <button
            style={S.btn(isRunning)}
            onClick={onRun}
            disabled={isRunning}
          >
            {isRunning ? '실행 중…' : '지금 실행'}
          </button>
        </div>
      </header>
    </>
  )
}
