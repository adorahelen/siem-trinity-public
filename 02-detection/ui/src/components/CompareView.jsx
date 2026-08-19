import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts'
import { fetchCompare, fetchHistory } from '../api.js'

const VERDICT_COLORS = {
  Critical: '#f85149', Danger: '#db61a2', High: '#d29922',
  Medium: '#1f6feb', Low: '#238636',
}
const DETECTOR_LABELS = {
  beacon_detector: '비콘', dga_detector: 'DGA',
  flow_anomaly_detector: '흐름이상', ip_risk_scorer: 'IP위험도',
}
const DETECTOR_COLORS = {
  beacon_detector: '#58a6ff', dga_detector: '#bc8cff',
  flow_anomaly_detector: '#3fb950', ip_risk_scorer: '#d29922',
}

const tooltipStyle = {
  contentStyle: { background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', fontSize: '11px' },
}
const axisStyle = { stroke: '#484f58', fontSize: 11 }

function CardGroup({ summary, color }) {
  if (!summary) return <div style={{ color: '#484f58', fontSize: '12px', padding: '16px' }}>데이터 없음</div>
  const v = summary.by_verdict || {}
  const critical = (v.Critical || 0) + (v.Danger || 0)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
      {[
        { label: '전체', value: summary.total, color },
        { label: 'Critical+Danger', value: critical, color: '#f85149' },
        { label: 'High', value: v.High || 0, color: '#d29922' },
        { label: 'Medium', value: v.Medium || 0, color: '#1f6feb' },
      ].map(({ label, value, color: c }) => (
        <div key={label} style={{
          background: '#0d1117', border: '1px solid #30363d',
          borderTop: `2px solid ${c}`, borderRadius: '6px',
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: '10px', color: '#8b949e', marginBottom: '4px' }}>{label}</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: c }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

export default function CompareView() {
  const [historyDates, setHistoryDates] = useState([])
  const [date1, setDate1] = useState('')
  const [date2, setDate2] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 어제 날짜 계산
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })()
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetchHistory()
      .then(d => {
        setHistoryDates(d.dates || [])
        // 기본값: date1=어제, date2=오늘
        const dates = (d.dates || []).map(x => x.date)
        setDate1(dates.find(x => x === yesterday) ? yesterday : (dates[1] || dates[0] || yesterday))
        setDate2(today)
      })
      .catch(() => {
        setDate1(yesterday)
        setDate2(today)
      })
  }, [])

  useEffect(() => {
    if (!date1) return
    setLoading(true)
    setError(null)
    fetchCompare(date1, date2 || today)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [date1, date2])

  // 시간대별 비교 라인차트 데이터
  const lineData = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0')
    return {
      hour: `${h}시`,
      [date1 || 'date1']: data?.date1?.hourly?.[h] || 0,
      [date2 || today]: data?.date2?.hourly?.[h] || 0,
    }
  })

  // 탐지기별 비교 바 차트
  const detectors = ['beacon_detector', 'dga_detector', 'flow_anomaly_detector', 'ip_risk_scorer']
  const detectorBarData = detectors.map(d => ({
    name: DETECTOR_LABELS[d],
    [date1 || 'date1']: data?.date1?.by_detector?.[d] || 0,
    [date2 || today]: data?.date2?.by_detector?.[d] || 0,
    color: DETECTOR_COLORS[d],
  }))

  // 심각도별 비교
  const verdictBarData = ['Critical', 'Danger', 'High', 'Medium', 'Low'].map(v => ({
    name: v,
    [date1 || 'date1']: data?.date1?.by_verdict?.[v] || 0,
    [date2 || today]: data?.date2?.by_verdict?.[v] || 0,
    color: VERDICT_COLORS[v],
  })).filter(x => (x[date1 || 'date1'] + x[date2 || today]) > 0)

  const DATE_OPTIONS = [
    { date: today, count: null },
    ...historyDates,
  ]

  const selectStyle = {
    background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d',
    borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', outline: 'none',
  }
  const CARD = {
    background: '#161b22', border: '1px solid #30363d',
    borderRadius: '8px', padding: '16px', marginBottom: '16px',
  }

  return (
    <div style={{ padding: '20px 0' }}>
      {/* 날짜 선택 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        marginBottom: '20px', flexWrap: 'wrap',
      }}>
        <span style={{ color: '#8b949e', fontSize: '12px' }}>비교 날짜</span>
        <select value={date1} onChange={e => setDate1(e.target.value)} style={selectStyle}>
          {DATE_OPTIONS.map(({ date, count }) => (
            <option key={date} value={date}>
              {date}{count != null ? ` (${count}건)` : ''}
            </option>
          ))}
        </select>
        <span style={{ color: '#484f58' }}>vs</span>
        <select value={date2} onChange={e => setDate2(e.target.value)} style={selectStyle}>
          {DATE_OPTIONS.map(({ date, count }) => (
            <option key={date} value={date}>
              {date}{count != null ? ` (${count}건)` : ''}
            </option>
          ))}
        </select>
        {loading && <span style={{ color: '#484f58', fontSize: '12px' }}>불러오는 중…</span>}
        {error && <span style={{ color: '#f85149', fontSize: '12px' }}>⚠ {error}</span>}
      </div>

      {data && (
        <>
          {/* 요약 카드 비교 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div style={CARD}>
              <div style={{ color: '#58a6ff', fontSize: '12px', marginBottom: '10px', fontWeight: 'bold' }}>
                {date1}
              </div>
              <CardGroup summary={data.date1} color="#58a6ff" />
            </div>
            <div style={CARD}>
              <div style={{ color: '#3fb950', fontSize: '12px', marginBottom: '10px', fontWeight: 'bold' }}>
                {date2 || today}
              </div>
              <CardGroup summary={data.date2} color="#3fb950" />
            </div>
          </div>

          {/* 시간대별 경보 추이 비교 */}
          <div style={CARD}>
            <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '12px' }}>시간대별 경보 추이 비교</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={lineData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                <XAxis dataKey="hour" {...axisStyle} tick={{ fill: '#484f58', fontSize: 10 }} interval={3} />
                <YAxis {...axisStyle} tick={{ fill: '#8b949e', fontSize: 11 }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend
                  formatter={(v) => <span style={{ color: '#8b949e', fontSize: 11 }}>{v}</span>}
                />
                <Line type="monotone" dataKey={date1} stroke="#58a6ff" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                <Line type="monotone" dataKey={date2 || today} stroke="#3fb950" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 탐지기별 + 심각도별 비교 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={CARD}>
              <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '12px' }}>탐지기별 경보 비교</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={detectorBarData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                  <XAxis dataKey="name" {...axisStyle} tick={{ fill: '#8b949e', fontSize: 10 }} />
                  <YAxis {...axisStyle} tick={{ fill: '#8b949e', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend formatter={(v) => <span style={{ color: '#8b949e', fontSize: 10 }}>{v}</span>} />
                  <Bar dataKey={date1} fill="#58a6ff" radius={[3, 3, 0, 0]} maxBarSize={24} />
                  <Bar dataKey={date2 || today} fill="#3fb950" radius={[3, 3, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={CARD}>
              <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '12px' }}>심각도별 경보 비교</div>
              {verdictBarData.length === 0 ? (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58' }}>
                  데이터 없음
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={verdictBarData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                    <XAxis dataKey="name" {...axisStyle} tick={{ fill: '#8b949e', fontSize: 10 }} />
                    <YAxis {...axisStyle} tick={{ fill: '#8b949e', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Legend formatter={(v) => <span style={{ color: '#8b949e', fontSize: 10 }}>{v}</span>} />
                    <Bar dataKey={date1} fill="#58a6ff" radius={[3, 3, 0, 0]} maxBarSize={24} />
                    <Bar dataKey={date2 || today} fill="#3fb950" radius={[3, 3, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
