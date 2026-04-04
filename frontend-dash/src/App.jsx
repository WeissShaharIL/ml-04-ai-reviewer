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

function formatDuration(start, end) {
  if (!start || !end) return null
  const secs = Math.floor((new Date(end) - new Date(start)) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function formatBytes(bytes) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

function repoShort(repo) {
  return repo ? repo.split('/')[1] : ''
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function Markdown({ text }) {
  if (!text) return null
  const lines    = text.split('\n')
  const elements = []
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, marginTop: 8, color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, marginTop: 16, color: 'var(--text)' }}>{line.slice(4)}</h3>)
    } else if (line.startsWith('**Overall:**')) {
      const content = line.replace(/\*\*(.*?)\*\*/g, '$1')
      elements.push(<p key={key++} style={{ fontSize: 13, marginBottom: 8, color: 'var(--text)', fontWeight: 600 }}>{content}</p>)
    } else if (line.startsWith('> ')) {
      elements.push(<blockquote key={key++} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 12, margin: '8px 0', color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>{line.slice(2)}</blockquote>)
    } else if (line.startsWith('- ')) {
      const content = line.slice(2)
      const parts   = content.split(/(`[^`]+`)/)
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span>
          <span style={{ color: 'var(--text)' }}>
            {parts.map((p, i) =>
              p.startsWith('`') && p.endsWith('`')
                ? <code key={i} style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{p.slice(1, -1)}</code>
                : p
            )}
          </span>
        </div>
      )
    } else if (line.startsWith('---')) {
      elements.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />)
    } else if (line.startsWith('*') && line.endsWith('*')) {
      elements.push(<p key={key++} style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>{line.slice(1, -1)}</p>)
    } else if (line.trim() === '') {
      elements.push(<div key={key++} style={{ height: 4 }} />)
    } else {
      elements.push(<p key={key++} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{line}</p>)
    }
  }
  return <div>{elements}</div>
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar({ reviews }) {
  const total     = reviews.length
  const done      = reviews.filter(r => r.status === 'done').length
  const failed    = reviews.filter(r => r.status === 'failed').length
  const reviewing = reviews.filter(r => r.status === 'reviewing').length
  const durations = reviews
    .filter(r => r.completed_at && r.created_at)
    .map(r => (new Date(r.completed_at) - new Date(r.created_at)) / 1000)
  const avgTime = durations.length
    ? Math.floor(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null

  const stats = [
    { label: 'TOTAL',    value: total,                         color: 'var(--text)' },
    { label: 'DONE',     value: done,                          color: '#059669' },
    { label: 'FAILED',   value: failed,                        color: '#dc2626' },
    { label: 'ACTIVE',   value: reviewing,                     color: '#7c3aed' },
    { label: 'AVG TIME', value: avgTime ? `${avgTime}s` : '—', color: 'var(--muted)' },
  ]

  return (
    <div style={{ display: 'flex', gap: 1, marginBottom: 16, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {stats.map(s => (
        <div key={s.label} style={{ flex: 1, padding: '10px 16px', background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Repo Filter ───────────────────────────────────────────────────────────────
function RepoFilter({ repos, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
      {repos.map(r => (
        <button key={r} onClick={() => onChange(r)} style={{
          padding: '3px 8px', borderRadius: 6, fontSize: 10,
          fontFamily: 'monospace', cursor: 'pointer',
          border: `1px solid ${active === r ? '#0ea5e9' : 'var(--border)'}`,
          background: active === r ? '#0ea5e922' : 'transparent',
          color: active === r ? '#0ea5e9' : 'var(--muted)',
          transition: 'all 0.15s',
          maxWidth: 180, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {r === 'all' ? 'ALL REPOS' : repoShort(r).toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ── Status Filter ─────────────────────────────────────────────────────────────
function FilterBar({ active, onChange }) {
  const filters = ['all', 'pending', 'reviewing', 'done', 'failed']
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
      {filters.map(f => (
        <button key={f} onClick={() => onChange(f)} style={{
          padding: '3px 8px', borderRadius: 6, fontSize: 10,
          fontFamily: 'monospace', letterSpacing: 1, cursor: 'pointer',
          border: `1px solid ${active === f ? STATUS_COLOR[f] || 'var(--accent)' : 'var(--border)'}`,
          background: active === f ? `${STATUS_COLOR[f] || '#7c3aed'}22` : 'transparent',
          color: active === f ? STATUS_COLOR[f] || 'var(--accent)' : 'var(--muted)',
          transition: 'all 0.15s',
        }}>{f.toUpperCase()}</button>
      ))}
    </div>
  )
}

// ── Log Console ───────────────────────────────────────────────────────────────
function LogConsole({ logs }) {
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  return (
    <div style={{
      background: '#0a0a0f', border: '1px solid var(--border)',
      borderRadius: 10, padding: 16, fontFamily: "'Courier New', monospace",
      fontSize: 12, height: 160, overflowY: 'auto',
    }}>
      {logs.length === 0 && <span style={{ color: 'var(--muted)' }}>Waiting for events...</span>}
      {logs.map((log, i) => (
        <div key={i} style={{
          marginBottom: 3,
          display: log.type === 'ping' ? 'none' : 'block',
          color: log.type === 'error' || log.status === 'failed' ? '#dc2626'
               : log.status === 'done' ? '#059669'
               : 'var(--text)',
        }}>
          <span style={{ color: 'var(--muted)', marginRight: 8 }}>{log.time}</span>
          <span style={{ color: '#7c3aed', marginRight: 8 }}>[{log.type}]</span>
          {log.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

// ── Review Card ───────────────────────────────────────────────────────────────
function ReviewCard({ review, onSelect, selected }) {
  const color    = STATUS_COLOR[review.status] || 'var(--muted)'
  const duration = formatDuration(review.created_at, review.completed_at)

  return (
    <div onClick={() => onSelect(review)} style={{
      padding: '12px 14px', borderRadius: 10,
      border: `1px solid ${selected ? color : 'var(--border)'}`,
      background: selected ? `${color}11` : 'var(--surface)',
      cursor: 'pointer', transition: 'all 0.15s', marginBottom: 6,
    }}>
      {/* Repo tag */}
      <div style={{ marginBottom: 6 }}>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 4,
          background: '#0ea5e922', color: '#0ea5e9',
          fontFamily: 'monospace', letterSpacing: 1,
        }}>
          {review.repo}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{STATUS_ICON[review.status]}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>PR #{review.pr_number}</span>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `${color}22`, color, fontFamily: 'monospace', letterSpacing: 1 }}>
            {review.status.toUpperCase()}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{formatTime(review.created_at)}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
        {review.pr_title}
      </div>
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
        <span>{review.author}</span>
        {review.diff_size && <span>diff: {formatBytes(review.diff_size)}</span>}
        {duration         && <span>took: {duration}</span>}
        {review.model     && <span>{review.model}</span>}
      </div>
    </div>
  )
}

// ── Live Token Stream ─────────────────────────────────────────────────────────
function TokenStream({ tokens }) {
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [tokens])

  return (
    <div style={{ height: '100%' }}>
      <div style={{ fontSize: 10, color: '#7c3aed', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 }}>
        ◈ AI GENERATING...
      </div>
      <pre style={{
        fontFamily: "'Courier New', monospace", fontSize: 12,
        whiteSpace: 'pre-wrap', color: '#a78bfa', margin: 0, lineHeight: 1.7,
      }}>
        {tokens || ''}
        <span style={{ animation: 'blink 1s step-end infinite', color: 'var(--accent)' }}>▋</span>
      </pre>
      <div ref={bottomRef} />
    </div>
  )
}

// ── Review Detail ─────────────────────────────────────────────────────────────
function ReviewDetail({ review, onRetry, streamTokens }) {
  const [full, setFull]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab]         = useState('review')

  useEffect(() => {
    if (!review) return
    setLoading(true)
    setTab('review')
    fetch(`${API}/reviews/${review.id}`)
      .then(r => r.json())
      .then(d => { setFull(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [review?.id, review?.status])

  if (!review) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontFamily: 'monospace', fontSize: 13, padding: 40 }}>
      ← Select a review
    </div>
  )

  const color      = STATUS_COLOR[review.status] || 'var(--muted)'
  const duration   = formatDuration(review.created_at, review.completed_at)
  const liveTokens = streamTokens[review.id] || ''

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ background: '#0f0f13', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            {/* Repo tag */}
            <div style={{ marginBottom: 6 }}>
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 4,
                background: '#0ea5e922', color: '#0ea5e9',
                fontFamily: 'monospace', letterSpacing: 1,
              }}>
                {review.repo}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              PR #{review.pr_number} — {review.pr_title}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
              <span>author: {review.author}</span>
              <span>created: {formatTime(review.created_at)}</span>
              {duration         && <span>duration: {duration}</span>}
              {review.model     && <span>model: {review.model}</span>}
              {review.provider  && <span>provider: {review.provider}</span>}
              {review.diff_size && <span>diff: {formatBytes(review.diff_size)}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, background: `${color}22`, color, fontFamily: 'monospace' }}>
              {STATUS_ICON[review.status]} {review.status.toUpperCase()}
            </span>
            <a href={review.pr_url} target="_blank" rel="noreferrer" style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 11,
              background: 'var(--border)', color: 'var(--text)', textDecoration: 'none', fontFamily: 'monospace',
            }}>↗ PR</a>
            {['failed', 'done'].includes(review.status) && (
              <button onClick={() => onRetry(review.id)} style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11,
                background: '#7c3aed22', color: '#7c3aed',
                border: '1px solid #7c3aed44', fontFamily: 'monospace', cursor: 'pointer',
              }}>↺ Retry</button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      {full?.diff && review.status !== 'reviewing' && (
        <div style={{ display: 'flex', gap: 6 }}>
          {['review', 'diff'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 11,
              fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 1,
              border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`,
              background: tab === t ? '#7c3aed22' : 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
            }}>{t.toUpperCase()}</button>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{
        flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 20, overflowY: 'auto',
      }}>
        {loading && <div style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 13 }}>Loading...</div>}

        {!loading && review.status === 'reviewing' && <TokenStream tokens={liveTokens} />}

        {!loading && review.status !== 'reviewing' && tab === 'review' && (
          <>
            {full?.review && <Markdown text={full.review} />}
            {!full?.review && review.status === 'pending' && (
              <div style={{ color: '#d97706', fontFamily: 'monospace', fontSize: 13 }}>⏳ Queued for review...</div>
            )}
            {!full?.review && review.status === 'failed' && (
              <div style={{ color: '#dc2626', fontFamily: 'monospace', fontSize: 13 }}>❌ Review failed — click Retry</div>
            )}
          </>
        )}

        {!loading && tab === 'diff' && review.status !== 'reviewing' && full?.diff && (
          <pre style={{ fontFamily: "'Courier New', monospace", fontSize: 11, whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
            {full.diff.split('\n').map((line, i) => (
              <div key={i} style={{
                color: line.startsWith('+') ? '#059669' : line.startsWith('-') ? '#dc2626' : line.startsWith('@@') ? '#7c3aed' : 'var(--muted)',
                background: line.startsWith('+') ? '#05966911' : line.startsWith('-') ? '#dc262611' : 'transparent',
              }}>{line}</div>
            ))}
          </pre>
        )}
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [reviews, setReviews]           = useState([])
  const [selected, setSelected]         = useState(null)
  const [logs, setLogs]                 = useState([])
  const [connected, setConnected]       = useState(false)
  const [config, setConfig]             = useState(null)
  const [filter, setFilter]             = useState('all')
  const [repoFilter, setRepoFilter]     = useState('all')
  const [streamTokens, setStreamTokens] = useState({})
  const eventSourceRef                  = useRef(null)

  const addLog = (event) => {
    if (event.type === 'ping' || event.type === 'token') return
    setLogs(prev => [...prev.slice(-100), { ...event, time: new Date().toLocaleTimeString() }])
  }

  const loadReviews = () => {
    fetch(`${API}/reviews`).then(r => r.json()).then(setReviews).catch(() => {})
  }

  useEffect(() => {
    fetch(`${API}/config`).then(r => r.json()).then(setConfig).catch(() => {})
  }, [])

  useEffect(() => {
    const connect = () => {
      const es = new EventSource(`${API}/stream`)
      eventSourceRef.current = es

      es.onopen = () => {
        setConnected(true)
        addLog({ type: 'connected', message: 'Stream connected' })
        loadReviews()
      }

      es.onmessage = (e) => {
        const event = JSON.parse(e.data)

        if (event.type === 'token') {
          setStreamTokens(prev => ({
            ...prev,
            [event.review_id]: (prev[event.review_id] || '') + event.token,
          }))
          return
        }

        addLog(event)

        if (['status', 'pr_received', 'done', 'failed'].includes(event.type)) {
          loadReviews()
          setSelected(prev => prev && prev.id === event.review_id
            ? { ...prev, status: event.status || prev.status }
            : prev)
        }
      }

      es.onerror = () => {
        setConnected(false)
        es.close()
        setTimeout(connect, 3000)
      }
    }

    connect()
    loadReviews()
    const poll = setInterval(loadReviews, 5000)
    return () => { eventSourceRef.current?.close(); clearInterval(poll) }
  }, [])

  useEffect(() => {
    if (selected) {
      const updated = reviews.find(r => r.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [reviews])

  const handleRetry = (id) => {
    setStreamTokens(prev => ({ ...prev, [id]: '' }))
    fetch(`${API}/reviews/${id}/retry`, { method: 'POST' }).then(() => {
      loadReviews()
      addLog({ type: 'log', message: `Retry triggered for review #${id}` })
    })
  }

  const repos    = ['all', ...new Set(reviews.map(r => r.repo))]
  const filtered = reviews
    .filter(r => filter === 'all' || r.status === filter)
    .filter(r => repoFilter === 'all' || r.repo === repoFilter)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        :root { --bg:#0f0f13; --surface:#1a1a24; --border:#2e2e3e; --accent:#7c3aed; --text:#e8e8f0; --muted:#6b6b80; }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#0f0f13; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#2e2e3e; border-radius:3px; }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface)',
      }}>
        <div style={{ fontFamily: "'Courier New', monospace", fontWeight: 700, letterSpacing: 3, fontSize: 14 }}>
          ◈ AI REVIEWER
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, fontFamily: 'monospace' }}>
          {config && <span style={{ color: 'var(--muted)' }}>{config.provider} / {config.model}</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#059669' : '#dc2626', display: 'inline-block' }} />
            <span style={{ color: connected ? '#059669' : '#dc2626' }}>{connected ? 'Connected' : 'Reconnecting...'}</span>
          </span>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 14 }}>
        <StatsBar reviews={reviews} />

        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 6 }}>LIVE EVENT STREAM</div>
          <LogConsole logs={logs} />
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 400 }}>
          {/* Left panel */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 6 }}>REPOSITORY</div>
            <RepoFilter repos={repos} active={repoFilter} onChange={setRepoFilter} />

            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 6, marginTop: 8 }}>STATUS</div>
            <FilterBar active={filter} onChange={setFilter} />

            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 8 }}>
              REVIEWS ({filtered.length}{filter !== 'all' || repoFilter !== 'all' ? ` / ${reviews.length}` : ''})
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filtered.length === 0 && (
                <div style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 12, padding: 16, textAlign: 'center' }}>
                  No reviews match the current filter.
                </div>
              )}
              {filtered.map(r => (
                <ReviewCard key={r.id} review={r} selected={selected?.id === r.id} onSelect={setSelected} />
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, minHeight: 400 }}>
            <ReviewDetail review={selected} onRetry={handleRetry} streamTokens={streamTokens} />
          </div>
        </div>
      </div>
    </div>
  )
}