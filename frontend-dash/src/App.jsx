import { useState, useEffect, useRef } from 'react'

const API = '/api'

const STATUS_COLOR = {
  pending:   '#d97706',
  reviewing: '#7c3aed',
  done:      '#059669',
  failed:    '#dc2626',
}

const STATUS_ICON = {
  pending:   '⏳',
  reviewing: '🔄',
  done:      '✅',
  failed:    '❌',
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString()
}

function formatElapsed(iso) {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ${secs % 60}s ago`
}

// ── Log Console ───────────────────────────────────────────────────────────────
function LogConsole({ logs }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div style={{
      background: '#0a0a0f',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 16,
      fontFamily: "'Courier New', monospace",
      fontSize: 12,
      height: 200,
      overflowY: 'auto',
    }}>
      {logs.length === 0 && (
        <span style={{ color: 'var(--muted)' }}>Waiting for events...</span>
      )}
      {logs.map((log, i) => (
        <div key={i} style={{
          marginBottom: 4,
          color: log.type === 'error' || log.type === 'failed' ? '#dc2626'
               : log.type === 'done'  ? '#059669'
               : log.type === 'ping'  ? 'transparent'
               : 'var(--text)',
        }}>
          <span style={{ color: 'var(--muted)', marginRight: 8 }}>
            {log.time}
          </span>
          <span style={{ color: '#7c3aed', marginRight: 8 }}>
            {log.type === 'ping' ? '' : `[${log.type}]`}
          </span>
          {log.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

// ── Review Card ───────────────────────────────────────────────────────────────
function ReviewCard({ review, onSelect, selected }) {
  const color = STATUS_COLOR[review.status] || 'var(--muted)'
  return (
    <div
      onClick={() => onSelect(review)}
      style={{
        padding: '14px 16px',
        borderRadius: 10,
        border: `1px solid ${selected ? color : 'var(--border)'}`,
        background: selected ? `${color}11` : 'var(--surface)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{STATUS_ICON[review.status]}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>
            PR #{review.pr_number}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            background: `${color}22`, color,
            fontFamily: 'monospace', letterSpacing: 1,
          }}>
            {review.status.toUpperCase()}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
          {formatTime(review.created_at)}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {review.pr_title}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
        {review.repo} · {review.author}
      </div>
    </div>
  )
}

// ── Review Detail ─────────────────────────────────────────────────────────────
function ReviewDetail({ review, onRetry }) {
  const [full, setFull] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!review) return
    setLoading(true)
    fetch(`${API}/reviews/${review.id}`)
      .then(r => r.json())
      .then(d => { setFull(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [review?.id, review?.status])

  if (!review) return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--muted)', fontFamily: 'monospace', fontSize: 13,
    }}>
      ← Select a review
    </div>
  )

  const color = STATUS_COLOR[review.status] || 'var(--muted)'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              {review.repo}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              PR #{review.pr_number} — {review.pr_title}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>
              <span>author: {review.author}</span>
              <span>created: {formatTime(review.created_at)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12,
              background: `${color}22`, color, fontFamily: 'monospace', letterSpacing: 1,
            }}>
              {STATUS_ICON[review.status]} {review.status.toUpperCase()}
            </span>
            <a href={review.pr_url} target="_blank" rel="noreferrer" style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12,
              background: 'var(--border)', color: 'var(--text)',
              textDecoration: 'none', fontFamily: 'monospace',
            }}>
              View PR ↗
            </a>
            {(review.status === 'failed' || review.status === 'done') && (
              <button onClick={() => onRetry(review.id)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12,
                background: '#7c3aed22', color: '#7c3aed',
                border: '1px solid #7c3aed44', fontFamily: 'monospace', cursor: 'pointer',
              }}>
                ↺ Retry
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Review output */}
      <div style={{
        flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 16, overflowY: 'auto',
      }}>
        {loading && (
          <div style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 13 }}>Loading...</div>
        )}
        {!loading && full?.review && (
          <pre style={{
            fontFamily: "'Courier New', monospace", fontSize: 12,
            whiteSpace: 'pre-wrap', color: 'var(--text)', margin: 0,
          }}>
            {full.review}
          </pre>
        )}
        {!loading && !full?.review && review.status === 'reviewing' && (
          <div style={{ color: '#7c3aed', fontFamily: 'monospace', fontSize: 13 }}>
            🔄 AI is reviewing the code...
          </div>
        )}
        {!loading && !full?.review && review.status === 'pending' && (
          <div style={{ color: '#d97706', fontFamily: 'monospace', fontSize: 13 }}>
            ⏳ Queued for review...
          </div>
        )}
        {!loading && !full?.review && review.status === 'failed' && (
          <div style={{ color: '#dc2626', fontFamily: 'monospace', fontSize: 13 }}>
            ❌ Review failed — click Retry to try again
          </div>
        )}
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [reviews, setReviews]       = useState([])
  const [selected, setSelected]     = useState(null)
  const [logs, setLogs]             = useState([])
  const [connected, setConnected]   = useState(false)
  const [config, setConfig]         = useState(null)
  const eventSourceRef              = useRef(null)

  const addLog = (event) => {
    if (event.type === 'ping') return
    setLogs(prev => [...prev.slice(-100), {
      ...event,
      time: new Date().toLocaleTimeString(),
    }])
  }

  // Load reviews
  const loadReviews = () => {
    fetch(`${API}/reviews`)
      .then(r => r.json())
      .then(setReviews)
      .catch(() => {})
  }

  // Load config
  useEffect(() => {
    fetch(`${API}/config`)
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {})
  }, [])

  // SSE stream
  useEffect(() => {
    const connect = () => {
      const es = new EventSource(`${API}/stream`)
      eventSourceRef.current = es

      es.onopen = () => {
        setConnected(true)
        addLog({ type: 'connected', message: 'Stream connected to backend' })
        loadReviews()
      }

      es.onmessage = (e) => {
        const event = JSON.parse(e.data)
        addLog(event)

        // Refresh reviews list on any status change
        if (['status', 'pr_received', 'done', 'failed'].includes(event.type)) {
          loadReviews()
          // Refresh selected review detail if it matches
          setSelected(prev => {
            if (prev && prev.id === event.review_id) {
              return { ...prev, status: event.status || prev.status }
            }
            return prev
          })
        }
      }

      es.onerror = () => {
        setConnected(false)
        es.close()
        // Reconnect after 3s
        setTimeout(connect, 3000)
      }
    }

    connect()
    loadReviews()

    // Poll as fallback every 5s
    const poll = setInterval(loadReviews, 5000)

    return () => {
      eventSourceRef.current?.close()
      clearInterval(poll)
    }
  }, [])

  const handleRetry = (id) => {
    fetch(`${API}/reviews/${id}/retry`, { method: 'POST' })
      .then(() => {
        loadReviews()
        addLog({ type: 'log', message: `Retry triggered for review #${id}` })
      })
  }

  // Update selected when reviews refresh
  useEffect(() => {
    if (selected) {
      const updated = reviews.find(r => r.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [reviews])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        :root {
          --bg: #0f0f13; --surface: #1a1a24; --border: #2e2e3e;
          --accent: #7c3aed; --text: #e8e8f0; --muted: #6b6b80;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f0f13; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2e2e3e; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface)',
      }}>
        <div style={{ fontFamily: "'Courier New', monospace", fontWeight: 700, letterSpacing: 3, fontSize: 14 }}>
          ◈ AI REVIEWER
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, fontFamily: 'monospace' }}>
          {config && (
            <span style={{ color: 'var(--muted)' }}>
              {config.provider} / {config.model}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connected ? '#059669' : '#dc2626',
              display: 'inline-block',
            }} />
            <span style={{ color: connected ? '#059669' : '#dc2626' }}>
              {connected ? 'Connected' : 'Reconnecting...'}
            </span>
          </span>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24, gap: 16 }}>
        {/* Log console */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 8 }}>
            LIVE EVENT STREAM
          </div>
          <LogConsole logs={logs} />
        </div>

        {/* Main panel */}
        <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
          {/* Review list */}
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 8 }}>
              REVIEWS ({reviews.length})
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 500 }}>
              {reviews.length === 0 && (
                <div style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 13, padding: 16, textAlign: 'center' }}>
                  No reviews yet.<br />Open a PR to trigger one.
                </div>
              )}
              {reviews.map(r => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  selected={selected?.id === r.id}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </div>

          {/* Detail panel */}
          <div style={{
            flex: 1, background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 12, padding: 16,
          }}>
            <ReviewDetail review={selected} onRetry={handleRetry} />
          </div>
        </div>
      </div>
    </div>
  )
}