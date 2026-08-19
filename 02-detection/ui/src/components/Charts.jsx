import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
  LineChart, Line,
} from 'recharts'

// ── 히트맵 (시간대 × 심각도) ──────────────────────────────────
const VERDICTS = ['Critical', 'Danger', 'High', 'Medium', 'Low']
const VERDICT_HEX = {
  Critical: '#f85149', Danger: '#db61a2', High: '#d29922',
  Medium: '#1f6feb', Low: '#238636',
}
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))

function cellOpacity(count, maxCount) {
  if (!count || maxCount === 0) return 0
  return 0.15 + (count / maxCount) * 0.75
}

function Heatmap({ heatmap }) {
  if (!heatmap || Object.keys(heatmap).length === 0) return null

  // 최대값 계산
  let maxCount = 1
  VERDICTS.forEach(v => {
    HOURS.forEach(h => {
      const c = heatmap[h]?.[v] || 0
      if (c > maxCount) maxCount = c
    })
  })

  const hasAny = VERDICTS.some(v => HOURS.some(h => (heatmap[h]?.[v] || 0) > 0))
  if (!hasAny) return null

  return (
    <div style={{
      background: '#161b22', border: '1px solid #30363d',
      borderRadius: '8px', padding: '16px',
    }}>
      <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '12px' }}>
        시간대 × 심각도 히트맵
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: '600px' }}>
          {/* 시간 레이블 */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', paddingLeft: '72px' }}>
            {HOURS.map(h => (
              <div key={h} style={{
                flex: 1, textAlign: 'center', fontSize: '9px', color: '#484f58',
              }}>
                {h % 4 === 0 ? `${h}시` : ''}
              </div>
            ))}
          </div>
          {/* 셀 행 */}
          {VERDICTS.map(v => {
            const rowHasData = HOURS.some(h => (heatmap[h]?.[v] || 0) > 0)
            if (!rowHasData) return null
            return (
              <div key={v} style={{ display: 'flex', alignItems: 'center', marginBottom: '3px' }}>
                <div style={{
                  width: '68px', fontSize: '10px', color: VERDICT_HEX[v],
                  textAlign: 'right', paddingRight: '8px', flexShrink: 0,
                }}>
                  {v}
                </div>
                {HOURS.map(h => {
                  const count = heatmap[h]?.[v] || 0
                  const opacity = cellOpacity(count, maxCount)
                  return (
                    <div
                      key={h}
                      title={count > 0 ? `${h}시 ${v}: ${count}건` : ''}
                      style={{
                        flex: 1, height: '16px',
                        background: count > 0 ? VERDICT_HEX[v] : '#0d1117',
                        opacity: count > 0 ? opacity : 0.4,
                        borderRadius: '2px',
                        margin: '0 1px',
                      }}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ marginTop: '8px', fontSize: '10px', color: '#484f58' }}>
        색이 진할수록 해당 시간대에 경보 많음 · 셀에 마우스 올리면 건수 표시
      </div>
    </div>
  )
}

const DETECTOR_LABELS = {
  beacon_detector:       '비콘',
  dga_detector:         'DGA',
  flow_anomaly_detector: '흐름이상',
  ip_risk_scorer:       'IP위험도',
}
const DETECTOR_COLORS = {
  beacon_detector:       '#58a6ff',
  dga_detector:         '#bc8cff',
  flow_anomaly_detector: '#3fb950',
  ip_risk_scorer:       '#d29922',
}
const VERDICT_COLORS = {
  Critical: '#f85149',
  Danger:   '#db61a2',
  High:     '#d29922',
  Medium:   '#1f6feb',
  Low:      '#238636',
}

const CARD_STYLE = {
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: '8px',
  padding: '16px',
}
const TOOLTIP_STYLE = {
  contentStyle: { background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', fontSize: '12px' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
}
const AXIS_STYLE = { stroke: '#484f58', fontSize: 11 }

export default function Charts({ summary }) {
  if (!summary) return null
  const heatmap = summary.heatmap || {}

  // BarChart: 탐지기별 경보 수
  const barData = Object.entries(summary.by_detector || {}).map(([k, v]) => ({
    name: DETECTOR_LABELS[k] || k,
    count: v,
    color: DETECTOR_COLORS[k] || '#8b949e',
    key: k,
  }))

  // PieChart: 심각도 분포
  const pieData = Object.entries(summary.by_verdict || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, value: v, color: VERDICT_COLORS[k] || '#8b949e' }))

  // LineChart: 시간대별 경보 (0~23시)
  const lineData = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0')
    return { hour: `${h}시`, count: summary.hourly?.[h] || 0 }
  })

  return (
    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* 상단: BarChart + PieChart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* 탐지기별 경보 */}
        <div style={CARD_STYLE}>
          <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '12px' }}>탐지기별 경보 수</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
              <XAxis dataKey="name" {...AXIS_STYLE} tick={{ fill: '#8b949e', fontSize: 11 }} />
              <YAxis {...AXIS_STYLE} tick={{ fill: '#8b949e', fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {barData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 심각도 분포 */}
        <div style={CARD_STYLE}>
          <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '12px' }}>심각도 분포</div>
          {pieData.length === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58' }}>
              데이터 없음
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="40%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span style={{ color: '#c9d1d9', fontSize: 11 }}>{v}</span>}
                />
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 하단: 시간대별 경보 추이 */}
      <div style={CARD_STYLE}>
        <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '12px' }}>시간대별 경보 추이</div>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={lineData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
            <XAxis dataKey="hour" {...AXIS_STYLE} tick={{ fill: '#484f58', fontSize: 10 }} interval={3} />
            <YAxis {...AXIS_STYLE} tick={{ fill: '#8b949e', fontSize: 11 }} allowDecimals={false} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#58a6ff"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#58a6ff' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 히트맵 */}
      <Heatmap heatmap={heatmap} />
    </div>
  )
}
