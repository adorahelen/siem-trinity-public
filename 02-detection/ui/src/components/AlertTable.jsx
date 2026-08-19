function formatMessage(a) {
  const msg = a.message || ''
  // 빈 IP를 "IP미상"으로 치환
  return msg
    .replace(/ → :/g, ' → IP미상:')
    .replace(/^  → /g, 'IP미상 → ')
    .replace(/\(IP미상\)/g, '')
    || JSON.stringify(a)
}

const DETECTOR_LABELS = {
  beacon_detector:       '비콘',
  dga_detector:         'DGA',
  flow_anomaly_detector: '흐름이상',
  ip_risk_scorer:       'IP위험도',
}
const VERDICT_COLORS = {
  Critical: '#f85149',
  Danger:   '#db61a2',
  High:     '#d29922',
  Medium:   '#1f6feb',
  Low:      '#238636',
}
const DETECTOR_COLORS = {
  beacon_detector:       '#58a6ff',
  dga_detector:         '#bc8cff',
  flow_anomaly_detector: '#3fb950',
  ip_risk_scorer:       '#d29922',
}

const SELECT_STYLE = {
  background: '#21262d',
  color: '#c9d1d9',
  border: '1px solid #30363d',
  borderRadius: '6px',
  padding: '5px 10px',
  fontSize: '12px',
  cursor: 'pointer',
  outline: 'none',
}
const BTN_STYLE = (disabled) => ({
  background: disabled ? '#161b22' : '#21262d',
  color: disabled ? '#484f58' : '#c9d1d9',
  border: '1px solid #30363d',
  borderRadius: '6px',
  padding: '4px 12px',
  fontSize: '12px',
  cursor: disabled ? 'not-allowed' : 'pointer',
})

function VerdictBadge({ verdict }) {
  const color = VERDICT_COLORS[verdict] || '#8b949e'
  return (
    <span style={{
      fontSize: '10px',
      fontWeight: 'bold',
      padding: '2px 6px',
      borderRadius: '4px',
      border: `1px solid ${color}`,
      color,
      background: `${color}18`,
      whiteSpace: 'nowrap',
    }}>
      {verdict}
    </span>
  )
}

function DetectorBadge({ detector }) {
  const color = DETECTOR_COLORS[detector] || '#8b949e'
  const label = DETECTOR_LABELS[detector] || detector
  return (
    <span style={{
      fontSize: '10px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: `${color}18`,
      color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

export default function AlertTable({
  alerts, total,
  filterDetector, filterVerdict,
  page, onFilterDetector, onFilterVerdict, onPage,
  onRowClick,
}) {
  const totalPages = Math.ceil(total / 50)

  return (
    <div style={{
      marginTop: '16px',
      background: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* 헤더 + 필터 */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
      }}>
        <span style={{ color: '#8b949e', fontSize: '12px', marginRight: '4px' }}>경보 목록</span>

        <select
          value={filterDetector}
          onChange={(e) => onFilterDetector(e.target.value)}
          style={SELECT_STYLE}
        >
          <option value="">전체 탐지기</option>
          <option value="beacon_detector">비콘</option>
          <option value="dga_detector">DGA</option>
          <option value="flow_anomaly_detector">흐름이상</option>
          <option value="ip_risk_scorer">IP위험도</option>
        </select>

        <select
          value={filterVerdict}
          onChange={(e) => onFilterVerdict(e.target.value)}
          style={SELECT_STYLE}
        >
          <option value="">전체 심각도</option>
          <option value="Critical">Critical</option>
          <option value="Danger">Danger</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <span style={{ marginLeft: 'auto', color: '#484f58', fontSize: '11px' }}>
          {total}건 / 페이지 {page}/{totalPages || 1}
        </span>
      </div>

      {/* 테이블 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0d1117' }}>
              {['시각', '탐지기', '심각도', '내용'].map((h) => (
                <th key={h} style={{
                  padding: '8px 14px',
                  textAlign: 'left',
                  color: '#484f58',
                  fontSize: '11px',
                  fontWeight: 'normal',
                  borderBottom: '1px solid #21262d',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#484f58' }}>
                  경보 없음
                </td>
              </tr>
            ) : alerts.map((a, i) => (
              <tr key={i}
                onClick={() => onRowClick?.(a)}
                style={{
                  borderBottom: '1px solid #21262d',
                  borderLeft: `3px solid ${VERDICT_COLORS[a.verdict] || 'transparent'}`,
                  cursor: onRowClick ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = '#21262d' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ padding: '8px 14px', color: '#8b949e', whiteSpace: 'nowrap' }}>
                  {(a.timestamp || '').substring(0, 19)}
                </td>
                <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                  <DetectorBadge detector={a.detector} />
                </td>
                <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                  <VerdictBadge verdict={a.verdict} />
                </td>
                <td style={{
                  padding: '8px 14px',
                  color: '#c9d1d9',
                  maxWidth: '600px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '12px',
                }}>
                  {formatMessage(a)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid #21262d',
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          alignItems: 'center',
        }}>
          <button style={BTN_STYLE(page === 1)} disabled={page === 1} onClick={() => onPage(page - 1)}>
            ← 이전
          </button>
          <span style={{ color: '#8b949e', fontSize: '12px' }}>{page} / {totalPages}</span>
          <button style={BTN_STYLE(page >= totalPages)} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            다음 →
          </button>
        </div>
      )}
    </div>
  )
}
