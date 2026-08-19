import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header.jsx'
import SummaryCards from './components/SummaryCards.jsx'
import Charts from './components/Charts.jsx'
import AlertTable from './components/AlertTable.jsx'
import AlertModal from './components/AlertModal.jsx'
import DetectorView from './components/DetectorView.jsx'
import IPRiskView from './components/IPRiskView.jsx'
import CompareView from './components/CompareView.jsx'
import { fetchSummary, fetchAlerts, fetchHistory, triggerRun } from './api.js'

const IDLE_INTERVAL = 60_000
const RUN_INTERVAL  = 3_000

// ── 탭 정의 ──────────────────────────────────────────────────
const TABS = [
  { id: 'overview',  label: '개요' },
  { id: 'beacon',    label: '비콘' },
  { id: 'dga',       label: 'DGA' },
  { id: 'flow',      label: '흐름이상' },
  { id: 'ip',        label: 'IP 위험도' },
  { id: 'compare',   label: '날짜 비교' },
]

const DETECTOR_MAP = {
  beacon: 'beacon_detector',
  dga:    'dga_detector',
  flow:   'flow_anomaly_detector',
}

function Tabs({ active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: '2px',
      borderBottom: '1px solid #30363d',
      padding: '0 20px',
      background: '#010409',
      position: 'sticky', top: '49px', zIndex: 90,
    }}>
      {TABS.map(t => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: isActive ? '2px solid #58a6ff' : '2px solid transparent',
              color: isActive ? '#c9d1d9' : '#8b949e',
              padding: '10px 16px',
              fontSize: '13px',
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#c9d1d9' }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#8b949e' }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab]       = useState('overview')
  const [summary, setSummary]           = useState(null)
  const [alerts, setAlerts]             = useState([])
  const [alertsTotal, setAlertsTotal]   = useState(0)
  const [isRunning, setIsRunning]       = useState(false)
  const [error, setError]               = useState(null)
  const [historyDates, setHistoryDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('')

  const [filterDetector, setFilterDetector] = useState('')
  const [filterVerdict, setFilterVerdict]   = useState('')
  const [page, setPage]                     = useState(1)

  const [modalAlert, setModalAlert] = useState(null)

  // 히스토리 날짜 목록
  useEffect(() => {
    fetchHistory().then(d => setHistoryDates(d.dates || [])).catch(() => {})
  }, [])

  const refresh = useCallback(async () => {
    if (activeTab !== 'overview') return
    try {
      const date = selectedDate || undefined
      const [sum, als] = await Promise.all([
        fetchSummary(date),
        fetchAlerts({ date, detector: filterDetector, verdict: filterVerdict, page }),
      ])
      setSummary(sum)
      setAlerts(als.alerts)
      setAlertsTotal(als.total)
      setIsRunning(sum.status?.is_running ?? false)
      setError(sum.status?.error || null)
    } catch (e) {
      setError(e.message)
    }
  }, [activeTab, selectedDate, filterDetector, filterVerdict, page])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, isRunning ? RUN_INTERVAL : IDLE_INTERVAL)
    return () => clearInterval(id)
  }, [refresh, isRunning])

  const handleRun = async () => {
    try {
      await triggerRun()
      setIsRunning(true)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDateChange = (date) => {
    setSelectedDate(date)
    setPage(1)
    fetchHistory().then(d => setHistoryDates(d.dates || [])).catch(() => {})
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setPage(1)
    setFilterDetector('')
    setFilterVerdict('')
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '40px' }}>
      <Header
        summary={summary}
        isRunning={isRunning}
        error={error}
        onRun={handleRun}
        historyDates={historyDates}
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
      />
      <Tabs active={activeTab} onChange={handleTabChange} />

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
        {/* 개요 탭 */}
        {activeTab === 'overview' && (
          <>
            <SummaryCards summary={summary} />
            <Charts summary={summary} />
            <AlertTable
              alerts={alerts}
              total={alertsTotal}
              filterDetector={filterDetector}
              filterVerdict={filterVerdict}
              page={page}
              onFilterDetector={(v) => { setFilterDetector(v); setPage(1) }}
              onFilterVerdict={(v) => { setFilterVerdict(v); setPage(1) }}
              onPage={setPage}
              onRowClick={setModalAlert}
            />
          </>
        )}

        {/* 탐지기별 탭 (비콘/DGA/흐름이상) */}
        {(activeTab === 'beacon' || activeTab === 'dga' || activeTab === 'flow') && (
          <DetectorView
            detector={DETECTOR_MAP[activeTab]}
            selectedDate={selectedDate}
          />
        )}

        {/* IP 위험도 탭 */}
        {activeTab === 'ip' && (
          <IPRiskView selectedDate={selectedDate} />
        )}

        {/* 날짜 비교 탭 */}
        {activeTab === 'compare' && (
          <CompareView />
        )}
      </div>

      {/* 경보 상세 모달 */}
      {modalAlert && (
        <AlertModal alert={modalAlert} onClose={() => setModalAlert(null)} />
      )}
    </div>
  )
}
