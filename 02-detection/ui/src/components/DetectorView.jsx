import { useState, useEffect } from 'react'
import { fetchAlerts } from '../api.js'
import AlertModal from './AlertModal.jsx'

const VERDICT_COLORS = {
  Critical: '#f85149', Danger: '#db61a2', High: '#d29922',
  Medium: '#1f6feb', Low: '#238636',
}

function VerdictBadge({ verdict }) {
  const color = VERDICT_COLORS[verdict] || '#8b949e'
  return (
    <span style={{
      fontSize: '10px', fontWeight: 'bold', padding: '2px 6px',
      borderRadius: '4px', border: `1px solid ${color}`,
      color, background: `${color}18`, whiteSpace: 'nowrap',
    }}>
      {verdict}
    </span>
  )
}

// ── 비콘 탐지기 뷰 ─────────────────────────────────────────────
function BeaconTable({ alerts, onRowClick }) {
  if (alerts.length === 0) return <Empty />
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#0d1117' }}>
          {['시각', '심각도', '출발 IP', '목적지 IP', '연결수', '평균간격(초)', 'CoV', '점수'].map(h => (
            <th key={h} style={TH}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {alerts.map((a, i) => (
          <tr key={i} onClick={() => onRowClick(a)}
            style={{ borderBottom: '1px solid #21262d', borderLeft: `3px solid ${VERDICT_COLORS[a.verdict] || 'transparent'}`, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#21262d' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <td style={TD}>{(a.timestamp || '').substring(0, 19)}</td>
            <td style={TD}><VerdictBadge verdict={a.verdict} /></td>
            <td style={{ ...TD, fontFamily: 'monospace', color: '#58a6ff' }}>{a.src_ip || '—'}</td>
            <td style={{ ...TD, fontFamily: 'monospace', color: '#f85149' }}>{a.dst_ip || '—'}</td>
            <td style={{ ...TD, textAlign: 'right' }}>{a.connection_count ?? '—'}</td>
            <td style={{ ...TD, textAlign: 'right' }}>{a.mean_interval ?? '—'}</td>
            <td style={{ ...TD, textAlign: 'right', color: a.cov < 0.1 ? '#f85149' : a.cov < 0.3 ? '#d29922' : '#c9d1d9' }}>
              {a.cov ?? '—'}
            </td>
            <td style={{ ...TD, textAlign: 'right', fontWeight: 'bold', color: scoreColor(a.score) }}>{a.score ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── DGA 탐지기 뷰 ──────────────────────────────────────────────
function DGATable({ alerts, onRowClick }) {
  if (alerts.length === 0) return <Empty />
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#0d1117' }}>
          {['시각', '심각도', '의심 도메인', '엔트로피', '신뢰도', '쿼리수', 'NXDOMAIN', '탐지 근거'].map(h => (
            <th key={h} style={TH}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {alerts.map((a, i) => (
          <tr key={i} onClick={() => onRowClick(a)}
            style={{ borderBottom: '1px solid #21262d', borderLeft: `3px solid ${VERDICT_COLORS[a.verdict] || 'transparent'}`, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#21262d' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <td style={TD}>{(a.timestamp || '').substring(0, 19)}</td>
            <td style={TD}><VerdictBadge verdict={a.verdict} /></td>
            <td style={{ ...TD, fontFamily: 'monospace', color: '#bc8cff', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.domain || '—'}
            </td>
            <td style={{ ...TD, textAlign: 'right', color: (a.entropy || 0) >= 3.5 ? '#f85149' : '#c9d1d9' }}>
              {a.entropy ?? '—'}
            </td>
            <td style={{ ...TD, textAlign: 'right' }}>
              {a.confidence != null ? `${(a.confidence * 100).toFixed(0)}%` : '—'}
            </td>
            <td style={{ ...TD, textAlign: 'right' }}>{a.query_count ?? '—'}</td>
            <td style={{ ...TD, textAlign: 'right', color: (a.nxdomain_count || 0) > 0 ? '#d29922' : '#8b949e' }}>
              {a.nxdomain_count ?? '—'}
            </td>
            <td style={{ ...TD, color: '#8b949e', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.reason || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── 흐름 이상탐지기 뷰 ────────────────────────────────────────
function FlowTable({ alerts, onRowClick }) {
  if (alerts.length === 0) return <Empty />
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#0d1117' }}>
          {['시각', '심각도', '출발 IP', '목적지 IP:포트', '프로토콜', '이상 유형', 'Anomaly Score', '전송 바이트'].map(h => (
            <th key={h} style={TH}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {alerts.map((a, i) => (
          <tr key={i} onClick={() => onRowClick(a)}
            style={{ borderBottom: '1px solid #21262d', borderLeft: `3px solid ${VERDICT_COLORS[a.verdict] || 'transparent'}`, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#21262d' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <td style={TD}>{(a.timestamp || '').substring(0, 19)}</td>
            <td style={TD}><VerdictBadge verdict={a.verdict} /></td>
            <td style={{ ...TD, fontFamily: 'monospace', color: '#58a6ff' }}>{a.src_ip || '—'}</td>
            <td style={{ ...TD, fontFamily: 'monospace', color: '#f85149' }}>
              {a.dst_ip ? `${a.dst_ip}:${a.dst_port}` : '—'}
            </td>
            <td style={{ ...TD, color: '#8b949e' }}>{a.proto || '—'}</td>
            <td style={{ ...TD, color: '#d29922' }}>{a.anomaly_type || '—'}</td>
            <td style={{ ...TD, textAlign: 'right', color: (a.anomaly_score || 0) < -0.2 ? '#f85149' : '#d29922' }}>
              {a.anomaly_score ?? '—'}
            </td>
            <td style={{ ...TD, textAlign: 'right' }}>
              {a.orig_bytes != null ? `${a.orig_bytes.toLocaleString()} B` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── 공통 ───────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 90) return '#f85149'
  if (score >= 70) return '#d29922'
  return '#3fb950'
}

function Empty() {
  return (
    <div style={{ padding: '32px', textAlign: 'center', color: '#484f58' }}>경보 없음</div>
  )
}

const TH = {
  padding: '8px 12px', textAlign: 'left', color: '#484f58',
  fontSize: '11px', fontWeight: 'normal', borderBottom: '1px solid #21262d',
  whiteSpace: 'nowrap',
}
const TD = { padding: '7px 12px', color: '#c9d1d9', fontSize: '12px' }

const DETECTOR_CONFIG = {
  beacon_detector:       { label: '비콘 탐지기',     color: '#58a6ff', desc: 'CoV + FFT로 C2 비콘 통신 패턴 탐지' },
  dga_detector:         { label: 'DGA 탐지기',      color: '#bc8cff', desc: 'Shannon Entropy + 어휘 분석으로 악성 도메인 탐지' },
  flow_anomaly_detector: { label: '흐름 이상탐지기', color: '#3fb950', desc: 'Isolation Forest로 비정상 네트워크 흐름 탐지' },
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function DetectorView({ detector, selectedDate }) {
  const [alerts, setAlerts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [modalAlert, setModalAlert] = useState(null)
  const config = DETECTOR_CONFIG[detector] || { label: detector, color: '#8b949e', desc: '' }

  useEffect(() => {
    setPage(1)
  }, [selectedDate, detector])

  useEffect(() => {
    setLoading(true)
    fetchAlerts({ date: selectedDate || undefined, detector, page, limit: 100 })
      .then(d => { setAlerts(d.alerts); setTotal(d.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [detector, selectedDate, page])

  const totalPages = Math.ceil(total / 100)

  return (
    <div style={{ padding: '20px 0' }}>
      {/* 탐지기 설명 */}
      <div style={{
        marginBottom: '16px', padding: '12px 16px',
        background: `${config.color}0d`, border: `1px solid ${config.color}30`,
        borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ color: config.color, fontWeight: 'bold', fontSize: '13px' }}>{config.label}</span>
        <span style={{ color: '#8b949e', fontSize: '12px' }}>{config.desc}</span>
        <span style={{ marginLeft: 'auto', color: '#484f58', fontSize: '11px' }}>총 {total}건</span>
      </div>

      {/* 테이블 */}
      <div style={{
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: '8px', overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#484f58' }}>불러오는 중…</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              {detector === 'beacon_detector'       && <BeaconTable alerts={alerts} onRowClick={setModalAlert} />}
              {detector === 'dga_detector'          && <DGATable    alerts={alerts} onRowClick={setModalAlert} />}
              {detector === 'flow_anomaly_detector' && <FlowTable   alerts={alerts} onRowClick={setModalAlert} />}
            </div>
            {totalPages > 1 && (
              <div style={{
                padding: '10px 16px', borderTop: '1px solid #21262d',
                display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center',
              }}>
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  style={btnStyle(page === 1)}
                >← 이전</button>
                <span style={{ color: '#8b949e', fontSize: '12px' }}>{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  style={btnStyle(page >= totalPages)}
                >다음 →</button>
              </div>
            )}
          </>
        )}
      </div>

      {modalAlert && <AlertModal alert={modalAlert} onClose={() => setModalAlert(null)} />}
    </div>
  )
}

const btnStyle = (disabled) => ({
  background: disabled ? '#161b22' : '#21262d',
  color: disabled ? '#484f58' : '#c9d1d9',
  border: '1px solid #30363d', borderRadius: '6px',
  padding: '4px 12px', fontSize: '12px',
  cursor: disabled ? 'not-allowed' : 'pointer',
})
