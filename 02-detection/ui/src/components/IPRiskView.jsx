import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts'
import { fetchAlerts } from '../api.js'
import AlertModal from './AlertModal.jsx'

const VERDICT_COLORS = {
  Critical: '#f85149', Danger: '#db61a2', High: '#d29922',
  Medium: '#1f6feb', Low: '#238636',
}
const BREAKDOWN_LABELS = {
  ssh: 'SSH', fail2ban: 'fail2ban', suricata_critical: 'Suricata-C',
  suricata_high: 'Suricata-H', wazuh: 'Wazuh', kr_block: 'KR-BLOCK',
  waf: 'WAF', beacon: '비콘', dga: 'DGA',
}

function VerdictBadge({ verdict }) {
  const color = VERDICT_COLORS[verdict] || '#8b949e'
  return (
    <span style={{
      fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px',
      border: `1px solid ${color}`, color, background: `${color}18`, whiteSpace: 'nowrap',
    }}>
      {verdict}
    </span>
  )
}

function BreakdownBar({ breakdown }) {
  if (!breakdown) return <span style={{ color: '#484f58' }}>—</span>
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0)
  if (entries.length === 0) return <span style={{ color: '#484f58' }}>없음</span>
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {entries.map(([k, v]) => (
        <span key={k} style={{
          fontSize: '10px', padding: '1px 5px', borderRadius: '3px',
          background: '#21262d', color: '#8b949e', whiteSpace: 'nowrap',
        }}>
          {BREAKDOWN_LABELS[k] || k}:{v}
        </span>
      ))}
    </div>
  )
}

export default function IPRiskView({ selectedDate }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAlert, setModalAlert] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetchAlerts({ date: selectedDate || undefined, detector: 'ip_risk_scorer', limit: 200 })
      .then(d => setAlerts(d.alerts))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedDate])

  // 점수순 정렬, 중복 IP 제거 (최고 점수만)
  const deduped = Object.values(
    alerts.reduce((acc, a) => {
      const key = a.ip || a.src_ip || ''
      if (!key) return acc
      if (!acc[key] || (a.score || 0) > (acc[key].score || 0)) acc[key] = a
      return acc
    }, {})
  ).sort((a, b) => (b.score || 0) - (a.score || 0))

  // 차트 데이터 (상위 20)
  const chartData = deduped.slice(0, 20).map((a, i) => ({
    name: a.ip || a.src_ip || `IP-${i}`,
    score: a.score || 0,
    verdict: a.verdict,
    _alert: a,
  }))

  const tooltipStyle = {
    contentStyle: { background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', fontSize: '11px' },
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>불러오는 중…</div>
  }

  if (deduped.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>
        IP 위험도 경보 없음
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 0' }}>
      {/* 설명 배너 */}
      <div style={{
        marginBottom: '16px', padding: '12px 16px',
        background: 'rgba(210,153,34,0.05)', border: '1px solid rgba(210,153,34,0.2)',
        borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ color: '#d29922', fontWeight: 'bold', fontSize: '13px' }}>IP 위험도 스코어러</span>
        <span style={{ color: '#8b949e', fontSize: '12px' }}>
          SSH·IDS·방화벽·HIDS 9개 신호 통합 0~100점 스코어링
        </span>
        <span style={{ marginLeft: 'auto', color: '#484f58', fontSize: '11px' }}>
          {deduped.length}개 IP
        </span>
      </div>

      {/* 수평 바 차트 */}
      <div style={{
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: '8px', padding: '16px', marginBottom: '16px',
      }}>
        <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '12px' }}>
          IP 위험도 점수 (상위 {Math.min(chartData.length, 20)}개)
        </div>
        <ResponsiveContainer width="100%" height={Math.max(chartData.length * 26 + 24, 80)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 16, right: 40, top: 4, bottom: 4 }}
            onClick={(d) => { if (d?.activePayload?.[0]?.payload?._alert) setModalAlert(d.activePayload[0].payload._alert) }}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" horizontal={false} />
            <XAxis type="number" domain={[0, 100]}
              tick={{ fill: '#484f58', fontSize: 10 }}
              ticks={[0, 30, 60, 70, 80, 90, 100]}
            />
            <YAxis type="category" dataKey="name"
              tick={{ fill: '#8b949e', fontSize: 10, fontFamily: 'monospace' }}
              width={130}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(v, n, p) => [`${v}점 (${p.payload.verdict})`]}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={16}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={VERDICT_COLORS[entry.verdict] || '#8b949e'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* 점수 구간 가이드 */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '10px' }}>
          {[['0~29', 'Low', '#238636'], ['30~59', 'Medium', '#1f6feb'], ['60~69', 'High', '#d29922'],
            ['70~79', 'High', '#d29922'], ['80~89', 'Danger', '#db61a2'], ['90+', 'Critical', '#f85149']].map(([range, label, color]) => (
            <span key={range} style={{ color }}>
              {range} = {label}
            </span>
          ))}
        </div>
      </div>

      {/* 상세 테이블 */}
      <div style={{
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: '8px', overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0d1117' }}>
                {['IP', '점수', '심각도', 'SSH', 'fail2ban', 'Suricata-C', 'Wazuh', 'KR-BLOCK', 'WAF', '신호 분해'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', color: '#484f58',
                    fontSize: '11px', fontWeight: 'normal', borderBottom: '1px solid #21262d',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deduped.map((a, i) => {
                const sig = a.signals || {}
                return (
                  <tr key={i}
                    onClick={() => setModalAlert(a)}
                    style={{
                      borderBottom: '1px solid #21262d',
                      borderLeft: `3px solid ${VERDICT_COLORS[a.verdict] || 'transparent'}`,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#21262d' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#58a6ff', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {a.ip || a.src_ip || '—'}
                    </td>
                    <td style={{ padding: '7px 12px', fontWeight: 'bold', fontSize: '13px', color: VERDICT_COLORS[a.verdict] || '#c9d1d9' }}>
                      {a.score ?? '—'}
                    </td>
                    <td style={{ padding: '7px 12px' }}><VerdictBadge verdict={a.verdict} /></td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#c9d1d9', fontSize: '12px' }}>{sig.ssh_attempts ?? '—'}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'center', fontSize: '12px', color: sig.is_banned ? '#f85149' : '#484f58' }}>
                      {sig.is_banned ? '차단' : '—'}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: '12px', color: (sig.suricata_critical || 0) > 0 ? '#f85149' : '#8b949e' }}>
                      {sig.suricata_critical ?? '—'}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: '12px', color: (sig.wazuh_alerts || 0) > 0 ? '#d29922' : '#8b949e' }}>
                      {sig.wazuh_alerts ?? '—'}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: '12px', color: (sig.kr_blocks || 0) > 0 ? '#db61a2' : '#8b949e' }}>
                      {sig.kr_blocks ?? '—'}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: '12px', color: (sig.waf_hits || 0) > 0 ? '#bc8cff' : '#8b949e' }}>
                      {sig.waf_hits ?? '—'}
                    </td>
                    <td style={{ padding: '7px 12px' }}>
                      <BreakdownBar breakdown={a.breakdown} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalAlert && <AlertModal alert={modalAlert} onClose={() => setModalAlert(null)} />}
    </div>
  )
}
