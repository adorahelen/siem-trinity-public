import { useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

// ── 탐지기별 위험 설명 ─────────────────────────────────────────
const DANGER_EXPLANATIONS = {
  beacon_detector: {
    Critical: 'CoV < 0.1 — 통신 간격이 극도로 규칙적입니다. C2(명령제어) 서버와 지속 통신 중인 악성코드의 전형적 패턴으로, 랜섬웨어·RAT 등이 이 방식을 사용합니다. 즉각 격리를 권장합니다.',
    High:     'CoV < 0.3 — C2 비콘 패턴이 감지됩니다. 악성코드가 일정 주기로 C2 서버에 체크인하고 있을 가능성이 높습니다. 목적지 IP 평판 및 프로세스 확인이 필요합니다.',
    Medium:   'CoV < 0.5 — 다소 규칙적인 통신 패턴입니다. 합법적 모니터링 에이전트나 업데이트 서비스일 수 있으나, 목적지 IP 평판 확인을 권장합니다.',
  },
  dga_detector: {
    Critical: 'DGA(Domain Generation Algorithm) — 악성코드가 C2 서버를 무작위 도메인으로 은닉하는 기법입니다. NXDOMAIN 응답 반복은 아직 등록되지 않은 C2 도메인을 탐색 중인 상태로, 감염 가능성이 매우 높습니다.',
    High:     '높은 엔트로피의 무작위 도메인 패턴이 감지됩니다. 보안 인텔리전스(VirusTotal 등)를 통한 추가 조사를 권장합니다.',
    Medium:   'DGA 특성을 일부 보이지만 신뢰도가 낮습니다. 오탐 가능성도 있으므로 도메인과 쿼리 출처를 확인하세요.',
  },
  flow_anomaly_detector: {
    Critical: 'Isolation Forest가 정상 기준을 크게 벗어난 흐름으로 판정했습니다. 포트스캔, 대용량 데이터 외부 유출, 알려진 악성 포트(4444/1337/31337) 통신 중 하나일 가능성이 높습니다.',
    High:     'Anomaly score가 -0.2 미만으로 정상 트래픽 분포에서 유의미하게 이탈했습니다. 비정상 프로토콜 사용이나 연결 패턴 확인을 권장합니다.',
    Medium:   '약한 이상 징후가 감지됩니다. 일시적 트래픽 급증이나 오탐일 수 있으나 반복 발생 시 추가 조사가 필요합니다.',
  },
  ip_risk_scorer: {
    Critical: '다중 보안 레이어(SSH 공격·IDS·방화벽·HIDS)에서 동시에 위험 신호가 감지된 IP입니다. 즉각 차단 조치를 강력히 권장합니다.',
    Danger:   '여러 보안 신호에서 악의적 활동이 확인되었습니다. 우선 순위를 두고 차단 및 사후 조사를 진행하세요.',
    High:     '위험도 점수 70점 이상입니다. 지속적 모니터링과 추가 조사가 필요하며 차단을 고려하세요.',
    Medium:   '일부 보안 신호가 감지됐으나 즉각적 위협은 아닐 수 있습니다. 상황 모니터링을 유지하세요.',
    Low:      '낮은 위험 신호입니다. 일반적인 모니터링을 계속하세요.',
  },
}

// ── 공통 스타일 ────────────────────────────────────────────────
const VERDICT_COLORS = {
  Critical: '#f85149', Danger: '#db61a2', High: '#d29922',
  Medium: '#1f6feb', Low: '#238636',
}
const CARD = {
  background: '#0d1117', border: '1px solid #30363d',
  borderRadius: '6px', padding: '12px 16px', marginBottom: '12px',
}
const LABEL = { color: '#484f58', fontSize: '11px', marginBottom: '4px' }
const VALUE = { color: '#c9d1d9', fontSize: '13px' }

function Field({ label, value }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={LABEL}>{label}</div>
      <div style={VALUE}>{String(value)}</div>
    </div>
  )
}

function DangerBanner({ detector, verdict }) {
  const explanation = DANGER_EXPLANATIONS[detector]?.[verdict]
  if (!explanation) return null
  const color = VERDICT_COLORS[verdict] || '#8b949e'
  return (
    <div style={{
      background: `${color}12`,
      border: `1px solid ${color}40`,
      borderLeft: `3px solid ${color}`,
      borderRadius: '6px',
      padding: '12px 14px',
      marginBottom: '16px',
      fontSize: '13px',
      color: '#c9d1d9',
      lineHeight: '1.6',
    }}>
      <span style={{ color, fontWeight: 'bold', marginRight: '8px' }}>⚠ 위험 원인</span>
      {explanation}
    </div>
  )
}

// ── 탐지기별 상세 섹션 ─────────────────────────────────────────

function BeaconDetail({ a }) {
  return (
    <div style={CARD}>
      <div style={{ color: '#58a6ff', fontSize: '12px', fontWeight: 'bold', marginBottom: '12px' }}>
        비콘 분석 데이터
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Field label="출발 IP" value={a.src_ip} />
        <Field label="목적지 IP" value={a.dst_ip} />
        <Field label="총 연결 횟수" value={`${a.connection_count}회`} />
        <Field label="평균 연결 간격" value={`${a.mean_interval}초`} />
        <Field label="간격 표준편차" value={`${a.std_interval}초`} />
        <Field label="변동계수(CoV)" value={a.cov} />
        <Field label="FFT 지배 강도" value={a.fft_dominance} />
        <Field label="위험 점수" value={`${a.score}/100`} />
      </div>
      <div style={{ marginTop: '10px', color: '#8b949e', fontSize: '11px' }}>
        <strong style={{ color: '#484f58' }}>해석</strong>&nbsp;
        CoV(변동계수)가 낮을수록 연결 간격이 규칙적 → C2 비콘 가능성 높음.
        FFT 지배 강도가 높을수록 단일 주기 신호 → 의심도 증가.
      </div>
    </div>
  )
}

function DGADetail({ a }) {
  const srcIps = Array.isArray(a.src_ips) ? a.src_ips.join(', ') : (a.src_ips || '—')
  return (
    <div style={CARD}>
      <div style={{ color: '#bc8cff', fontSize: '12px', fontWeight: 'bold', marginBottom: '12px' }}>
        DGA 도메인 분석
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ gridColumn: '1/-1' }}><Field label="의심 도메인" value={a.domain} /></div>
        <Field label="Shannon Entropy" value={a.entropy} />
        <Field label="탐지 신뢰도" value={a.confidence ? `${(a.confidence * 100).toFixed(0)}%` : undefined} />
        <Field label="총 쿼리 수" value={`${a.query_count}회`} />
        <Field label="NXDOMAIN 수" value={`${a.nxdomain_count}회`} />
        <div style={{ gridColumn: '1/-1' }}><Field label="탐지 근거" value={a.reason} /></div>
        <div style={{ gridColumn: '1/-1' }}><Field label="쿼리 출처 IP" value={srcIps} /></div>
      </div>
      <div style={{ marginTop: '10px', color: '#8b949e', fontSize: '11px' }}>
        <strong style={{ color: '#484f58' }}>해석</strong>&nbsp;
        Entropy ≥ 3.5이면 무작위 문자열 가능성 높음. NXDOMAIN 반복은 미등록 C2 서버를 탐색 중인 신호.
      </div>
    </div>
  )
}

function FlowDetail({ a }) {
  return (
    <div style={CARD}>
      <div style={{ color: '#3fb950', fontSize: '12px', fontWeight: 'bold', marginBottom: '12px' }}>
        흐름 이상 분석
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Field label="출발 IP" value={a.src_ip} />
        <Field label="목적지 IP:포트" value={a.dst_ip ? `${a.dst_ip}:${a.dst_port}` : undefined} />
        <Field label="프로토콜" value={a.proto} />
        <Field label="연결 상태" value={a.conn_state} />
        <Field label="이상 유형" value={a.anomaly_type} />
        <Field label="Anomaly Score" value={a.anomaly_score} />
        <Field label="전송 바이트(출발)" value={a.orig_bytes ? `${a.orig_bytes.toLocaleString()} B` : undefined} />
        <Field label="전송 패킷(출발)" value={a.orig_pkts ? `${a.orig_pkts}pkt` : undefined} />
      </div>
      <div style={{ marginTop: '10px', color: '#8b949e', fontSize: '11px' }}>
        <strong style={{ color: '#484f58' }}>해석</strong>&nbsp;
        Anomaly Score가 음수일수록 비정상. -0.2 미만 = High, 그 외 = Medium.
        conn_state S0/REJ + 소량 패킷은 포트스캔 전형 패턴.
      </div>
    </div>
  )
}

function IPRiskDetail({ a }) {
  const breakdown = a.breakdown || {}
  const signals = a.signals || {}
  const BREAKDOWN_LABELS = {
    ssh: 'SSH 공격', fail2ban: 'fail2ban 차단',
    suricata_critical: 'Suricata Critical', suricata_high: 'Suricata High',
    wazuh: 'Wazuh 알림', kr_block: 'KR-BLOCK', waf: 'WAF(ModSec)',
    beacon: '비콘 연계', dga: 'DGA 연계',
  }
  const BREAKDOWN_MAX = {
    ssh: 20, fail2ban: 20, suricata_critical: 15, suricata_high: 10,
    wazuh: 10, kr_block: 10, waf: 5, beacon: 5, dga: 5,
  }
  const barData = Object.entries(breakdown)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: BREAKDOWN_LABELS[k] || k, score: v, max: BREAKDOWN_MAX[k] || 10 }))
    .sort((a, b) => b.score - a.score)

  const tooltipStyle = {
    contentStyle: { background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', fontSize: '11px' },
  }

  return (
    <div style={CARD}>
      <div style={{ color: '#d29922', fontSize: '12px', fontWeight: 'bold', marginBottom: '12px' }}>
        IP 위험도 점수 분해
      </div>
      <div style={{ marginBottom: '12px' }}>
        <span style={{ fontSize: '28px', fontWeight: 'bold', color: VERDICT_COLORS[a.verdict] || '#c9d1d9' }}>
          {a.score}
        </span>
        <span style={{ color: '#8b949e', fontSize: '12px', marginLeft: '8px' }}>/ 100점</span>
        <span style={{
          marginLeft: '12px', fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
          border: `1px solid ${VERDICT_COLORS[a.verdict] || '#30363d'}`,
          color: VERDICT_COLORS[a.verdict] || '#c9d1d9',
          background: `${VERDICT_COLORS[a.verdict] || '#30363d'}18`,
        }}>
          {a.verdict}
        </span>
      </div>
      {barData.length > 0 && (
        <ResponsiveContainer width="100%" height={barData.length * 28 + 16}>
          <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, 20]} tick={{ fill: '#484f58', fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#8b949e', fontSize: 11 }} width={110} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v}점`]} />
            <Bar dataKey="score" radius={[0, 3, 3, 0]} maxBarSize={14}>
              {barData.map((entry, i) => (
                <Cell key={i} fill={entry.score >= 15 ? '#f85149' : entry.score >= 10 ? '#d29922' : '#58a6ff'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '12px' }}>
        <Field label="SSH 공격 시도" value={`${signals.ssh_attempts || 0}회`} />
        <Field label="fail2ban 차단" value={signals.is_banned ? '차단됨' : '없음'} />
        <Field label="Suricata Critical" value={`${signals.suricata_critical || 0}건`} />
        <Field label="Suricata High" value={`${signals.suricata_high || 0}건`} />
        <Field label="Wazuh 알림" value={`${signals.wazuh_alerts || 0}건`} />
        <Field label="KR-BLOCK" value={`${signals.kr_blocks || 0}건`} />
        <Field label="WAF 탐지" value={`${signals.waf_hits || 0}건`} />
      </div>
    </div>
  )
}

// ── 메인 모달 ──────────────────────────────────────────────────
export default function AlertModal({ alert: a, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!a) return null

  const DETECTOR_LABELS = {
    beacon_detector: '비콘 탐지기',
    dga_detector: 'DGA 탐지기',
    flow_anomaly_detector: '흐름 이상탐지기',
    ip_risk_scorer: 'IP 위험도 스코어러',
  }
  const verdictColor = VERDICT_COLORS[a.verdict] || '#8b949e'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(1,4,9,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '10px',
        width: '100%', maxWidth: '640px',
        maxHeight: '85vh', overflow: 'auto',
        padding: '24px',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ color: '#8b949e', fontSize: '11px', marginBottom: '4px' }}>
              {a.timestamp} · {DETECTOR_LABELS[a.detector] || a.detector}
            </div>
            <div style={{
              display: 'inline-block', fontSize: '13px', fontWeight: 'bold',
              padding: '3px 10px', borderRadius: '4px',
              border: `1px solid ${verdictColor}`,
              color: verdictColor, background: `${verdictColor}18`,
            }}>
              {a.verdict}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#484f58',
              fontSize: '20px', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* 위험 원인 배너 */}
        <DangerBanner detector={a.detector} verdict={a.verdict} />

        {/* 탐지기별 상세 */}
        {a.detector === 'beacon_detector'       && <BeaconDetail a={a} />}
        {a.detector === 'dga_detector'          && <DGADetail a={a} />}
        {a.detector === 'flow_anomaly_detector' && <FlowDetail a={a} />}
        {a.detector === 'ip_risk_scorer'        && <IPRiskDetail a={a} />}

        {/* 원본 메시지 (beacon / flow는 message 필드 있음) */}
        {a.message && (
          <div style={{ ...CARD, marginBottom: 0 }}>
            <div style={LABEL}>원본 경보 메시지</div>
            <div style={{ ...VALUE, wordBreak: 'break-all', lineHeight: 1.6 }}>{a.message}</div>
          </div>
        )}
      </div>
    </div>
  )
}
