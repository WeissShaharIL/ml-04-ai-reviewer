import { useState, useEffect, useRef, useCallback } from 'react'

const IMAGES = [
  { id: 1, url: 'https://picsum.photos/seed/puzzle1/600/600', label: 'Mountain Lake' },
  { id: 2, url: 'https://picsum.photos/seed/puzzle2/600/600', label: 'Forest Path' },
  { id: 3, url: 'https://picsum.photos/seed/puzzle3/600/600', label: 'Ocean Sunset' },
]

const DIFFICULTIES = {
  easy:   { grid: 3, label: 'Easy',   color: '#059669' },
  medium: { grid: 4, label: 'Medium', color: '#d97706' },
  hard:   { grid: 5, label: 'Hard',   color: '#dc2626' },
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Puzzle Board ──────────────────────────────────────────────────────────────
function PuzzleBoard({ image, grid, onComplete }) {
  const PIECE_SIZE = Math.floor(480 / grid)
  const total      = grid * grid

  const [pieces, setPieces]     = useState([])
  const [dragging, setDragging] = useState(null)
  const [slots, setSlots]       = useState(Array(total).fill(null))
  const [solved, setSolved]     = useState(false)
  const dragOver                = useRef(null)

  useEffect(() => {
    const ids = shuffle(Array.from({ length: total }, (_, i) => i))
    setPieces(ids)
    setSlots(Array(total).fill(null))
    setSolved(false)
  }, [image, grid])

  const checkSolved = useCallback((newSlots) => {
    const done = newSlots.every((pid, idx) => pid === idx)
    if (done) { setSolved(true); onComplete() }
  }, [onComplete])

  const handleDragStart = (e, pieceId, fromSlot = null) => {
    setDragging({ pieceId, fromSlot })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDropOnSlot = (e, slotIdx) => {
    e.preventDefault()
    if (dragging === null) return
    const { pieceId, fromSlot } = dragging

    setSlots(prev => {
      const next = [...prev]
      // if slot occupied, swap
      const occupant = next[slotIdx]
      next[slotIdx] = pieceId
      if (fromSlot !== null) {
        next[fromSlot] = occupant
      } else {
        setPieces(p => p.filter(id => id !== pieceId))
        if (occupant !== null) setPieces(p => [...p, occupant])
      }
      checkSolved(next)
      return next
    })
    setDragging(null)
  }

  const handleDropOnTray = (e) => {
    e.preventDefault()
    if (dragging === null || dragging.fromSlot === null) return
    const { pieceId, fromSlot } = dragging
    setSlots(prev => {
      const next = [...prev]
      next[fromSlot] = null
      return next
    })
    setPieces(p => [...p, pieceId])
    setDragging(null)
  }

  const pieceStyle = (pid) => ({
    width:  PIECE_SIZE,
    height: PIECE_SIZE,
    backgroundImage:    `url(${image})`,
    backgroundSize:     `${480}px ${480}px`,
    backgroundPosition: `-${(pid % grid) * PIECE_SIZE}px -${Math.floor(pid / grid) * PIECE_SIZE}px`,
    cursor: 'grab',
    borderRadius: 4,
    border: '2px solid rgba(255,255,255,0.15)',
    flexShrink: 0,
    transition: 'transform 0.1s, box-shadow 0.1s',
  })

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
      {/* Board */}
      <div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${grid}, ${PIECE_SIZE}px)`,
          gap: 3,
          background: 'rgba(255,255,255,0.04)',
          padding: 8,
          borderRadius: 12,
          border: '1px solid var(--border)',
        }}>
          {slots.map((pid, idx) => (
            <div
              key={idx}
              onDragOver={e => { e.preventDefault(); dragOver.current = idx }}
              onDrop={e => handleDropOnSlot(e, idx)}
              style={{
                width:  PIECE_SIZE,
                height: PIECE_SIZE,
                background: pid !== null ? 'transparent' : 'rgba(255,255,255,0.03)',
                border: `2px dashed ${pid !== null ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {pid !== null && (
                <div
                  draggable
                  onDragStart={e => handleDragStart(e, pid, idx)}
                  style={{
                    ...pieceStyle(pid),
                    boxShadow: solved ? '0 0 0 2px #059669' : 'none',
                  }}
                />
              )}
            </div>
          ))}
        </div>
        {solved && (
          <div style={{
            marginTop: 12, textAlign: 'center', color: '#059669',
            fontFamily: "'Courier New', monospace", fontSize: 18, fontWeight: 700,
            letterSpacing: 2, animation: 'fadeIn 0.5s ease'
          }}>
            ✓ PUZZLE COMPLETE
          </div>
        )}
      </div>

      {/* Tray */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDropOnTray}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          width: PIECE_SIZE * 2 + 30,
          minHeight: 120,
          background: 'rgba(255,255,255,0.03)',
          border: '1px dashed var(--border)',
          borderRadius: 12,
          padding: 10,
          alignContent: 'flex-start',
        }}
      >
        <div style={{ width: '100%', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontFamily: 'monospace' }}>
          PIECES — {pieces.length} remaining
        </div>
        {pieces.map(pid => (
          <div
            key={pid}
            draggable
            onDragStart={e => handleDragStart(e, pid, null)}
            style={pieceStyle(pid)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function Leaderboard({ difficulty, refresh }) {
  const [scores, setScores] = useState([])

  useEffect(() => {
    fetch(`/api/scores?difficulty=${difficulty}&limit=10`)
      .then(r => r.json())
      .then(setScores)
      .catch(() => {})
  }, [difficulty, refresh])

  if (!scores.length) return (
    <p style={{ color: 'var(--muted)', fontSize: 13, fontFamily: 'monospace' }}>No scores yet.</p>
  )

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'monospace' }}>
      <thead>
        <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          <th style={{ textAlign: 'left', padding: '4px 8px' }}>#</th>
          <th style={{ textAlign: 'left', padding: '4px 8px' }}>NAME</th>
          <th style={{ textAlign: 'right', padding: '4px 8px' }}>TIME</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((s, i) => (
          <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <td style={{ padding: '6px 8px', color: i === 0 ? '#f59e0b' : 'var(--muted)' }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
            </td>
            <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{s.name}</td>
            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--accent)' }}>
              {formatTime(s.time_secs)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Score Submit Modal ────────────────────────────────────────────────────────
function ScoreModal({ time, difficulty, onSubmit, onSkip }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), time_secs: time, difficulty }),
      })
      onSubmit()
    } catch {
      onSubmit()
    }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 36, width: 360, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
        <h2 style={{ fontFamily: 'monospace', letterSpacing: 2, marginBottom: 4 }}>PUZZLE SOLVED</h2>
        <p style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: 28, fontWeight: 700, marginBottom: 24 }}>
          {formatTime(time)}
        </p>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Enter your name..."
          maxLength={64}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: 15, marginBottom: 16,
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onSkip} style={{
            flex: 1, padding: '10px', borderRadius: 8,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--muted)', fontSize: 14,
          }}>Skip</button>
          <button onClick={submit} disabled={!name.trim() || loading} style={{
            flex: 2, padding: '10px', borderRadius: 8,
            background: name.trim() ? 'var(--accent)' : 'var(--border)',
            color: '#fff', fontSize: 14, fontWeight: 600,
          }}>{loading ? 'Saving...' : 'Save Score'}</button>
        </div>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]         = useState('menu')   // menu | game | done
  const [difficulty, setDifficulty] = useState('medium')
  const [imageIdx, setImageIdx]     = useState(0)
  const [elapsed, setElapsed]       = useState(0)
  const [lbRefresh, setLbRefresh]   = useState(0)
  const [showModal, setShowModal]   = useState(false)
  const timerRef                    = useRef(null)

  const startGame = () => {
    setElapsed(0)
    setScreen('game')
    setShowModal(false)
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  }

  const handleComplete = () => {
    clearInterval(timerRef.current)
    setShowModal(true)
  }

  const handleScoreSubmit = () => {
    setShowModal(false)
    setScreen('menu')
    setLbRefresh(r => r + 1)
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  const diff = DIFFICULTIES[difficulty]
  const img  = IMAGES[imageIdx]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '14px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontFamily: "'Courier New', monospace", fontWeight: 700, letterSpacing: 3, fontSize: 16 }}>
          ◈ JIGSAW
        </div>
        {screen === 'game' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 22, color: 'var(--accent)', letterSpacing: 2 }}>
              {formatTime(elapsed)}
            </span>
            <span style={{ fontSize: 12, color: diff.color, fontFamily: 'monospace', letterSpacing: 1 }}>
              {diff.label.toUpperCase()}
            </span>
            <button onClick={() => { clearInterval(timerRef.current); setScreen('menu') }} style={{
              padding: '6px 14px', borderRadius: 6, background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13,
            }}>← Menu</button>
          </div>
        )}
      </header>

      <main style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
        {screen === 'menu' && (
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            {/* Config panel */}
            <div style={{ flex: '1 1 320px' }}>
              <h1 style={{
                fontFamily: "'Courier New', monospace", fontSize: 36,
                fontWeight: 700, letterSpacing: 4, marginBottom: 8,
              }}>PUZZLE<br />GAME</h1>
              <p style={{ color: 'var(--muted)', marginBottom: 32, fontSize: 14 }}>
                Drag pieces to solve the image. Fastest time wins.
              </p>

              {/* Image select */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 2, fontFamily: 'monospace' }}>
                  IMAGE
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {IMAGES.map((img, i) => (
                    <div key={img.id} onClick={() => setImageIdx(i)} style={{
                      width: 72, height: 72, borderRadius: 8, overflow: 'hidden',
                      border: `2px solid ${imageIdx === i ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer', backgroundImage: `url(${img.url})`,
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      transition: 'border-color 0.2s',
                    }} />
                  ))}
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontFamily: 'monospace' }}>
                  {img.label}
                </p>
              </div>

              {/* Difficulty */}
              <div style={{ marginBottom: 32 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 2, fontFamily: 'monospace' }}>
                  DIFFICULTY
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {Object.entries(DIFFICULTIES).map(([key, val]) => (
                    <button key={key} onClick={() => setDifficulty(key)} style={{
                      padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: `1px solid ${difficulty === key ? val.color : 'var(--border)'}`,
                      background: difficulty === key ? `${val.color}22` : 'transparent',
                      color: difficulty === key ? val.color : 'var(--muted)',
                      transition: 'all 0.2s',
                    }}>{val.label}</button>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontFamily: 'monospace' }}>
                  {diff.grid}×{diff.grid} grid — {diff.grid * diff.grid} pieces
                </p>
              </div>

              <button onClick={startGame} style={{
                padding: '14px 40px', borderRadius: 10, fontSize: 15,
                fontWeight: 700, background: 'var(--accent)', color: '#fff',
                letterSpacing: 2, fontFamily: 'monospace',
                transition: 'background 0.2s',
              }}>START →</button>
            </div>

            {/* Leaderboard */}
            <div style={{
              flex: '1 1 280px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 16, padding: 24,
            }}>
              <div style={{
                fontSize: 11, color: 'var(--muted)', letterSpacing: 2,
                fontFamily: 'monospace', marginBottom: 16,
              }}>
                LEADERBOARD — {difficulty.toUpperCase()}
              </div>
              <Leaderboard difficulty={difficulty} refresh={lbRefresh} />
            </div>
          </div>
        )}

        {screen === 'game' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <PuzzleBoard
              image={img.url}
              grid={diff.grid}
              onComplete={handleComplete}
            />
          </div>
        )}
      </main>

      {showModal && (
        <ScoreModal
          time={elapsed}
          difficulty={difficulty}
          onSubmit={handleScoreSubmit}
          onSkip={handleScoreSubmit}
        />
      )}
    </div>
  )
}