import { useState, useEffect, useRef, useCallback } from 'react'
import JoinHousehold from './components/JoinHousehold.jsx'
import GroceryList from './components/GroceryList.jsx'
import MealPlan from './components/MealPlan.jsx'
import { WS_URL } from './config.js'

const STORAGE_KEY = 'handleliste:household'
const STATE_KEY = (code) => `handleliste:state:${code}`

const EMPTY_STATE = { groceries: [], meals: [], mealTemplates: [] }

function loadStoredHousehold() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.name && parsed.code) return parsed
  } catch {}
  return null
}

// Hent lagret liste fra mobilens minne (vises umiddelbart ved oppstart)
function loadCachedState(code) {
  try {
    const raw = localStorage.getItem(STATE_KEY(code))
    if (raw) {
      const p = JSON.parse(raw)
      return {
        groceries: p.groceries || [],
        meals: p.meals || [],
        mealTemplates: p.mealTemplates || [],
      }
    }
  } catch {}
  return { ...EMPTY_STATE }
}

function saveCachedState(code, s) {
  try { localStorage.setItem(STATE_KEY(code), JSON.stringify(s)) } catch {}
}

const initialHousehold = loadStoredHousehold()

export default function App() {
  // Husk husstanden fra forrige besøk
  const [household, setHousehold] = useState(initialHousehold)
  // Vis lagret liste umiddelbart – uten å vente på backend
  const [state, setState] = useState(() =>
    initialHousehold ? loadCachedState(initialHousehold.code) : { ...EMPTY_STATE }
  )
  const [tab, setTab] = useState('grocery')
  const [connected, setConnected] = useState(false)
  const [toast, setToast] = useState(null)

  const wsRef = useRef(null)
  const toastTimer = useRef(null)
  const queueRef = useRef([]) // endringer som venter på at backend våkner

  // ✅ Toast helper
  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }, [])

  // ✅ Send melding – eller legg i kø hvis backend ikke er tilgjengelig ennå
  const sendMessage = useCallback((msg) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      queueRef.current.push(msg) // sendes automatisk når tilkoblet
    }
  }, [])

  // ✅ WebSocket connection
  useEffect(() => {
    if (!household) return

    let ws
    let reconnectTimeout
    let closed = false

    function connect() {
      ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        ws.send(JSON.stringify({ action: 'JOIN', code: household.code }))
        // Send alle endringer som ble gjort mens backend sov
        const queued = queueRef.current
        queueRef.current = []
        queued.forEach(m => ws.send(JSON.stringify(m)))
      }

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'STATE') {
            const next = {
              groceries: data.groceries || [],
              meals: data.meals || [],
              mealTemplates: data.mealTemplates || [],
            }
            setState(next)
            saveCachedState(household.code, next) // oppdater lokal cache
          }
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        if (!closed) reconnectTimeout = setTimeout(connect, 2000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      closed = true
      clearTimeout(reconnectTimeout)
      if (ws) ws.close()
    }
  }, [household])

  // ✅ Join household
  function handleJoin(name, code, initialState) {
    const hh = { name, code }
    setHousehold(hh)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hh)) } catch {}
    const next = {
      groceries: initialState.groceries || [],
      meals: initialState.meals || [],
      mealTemplates: initialState.mealTemplates || [],
    }
    setState(next)
    saveCachedState(code, next)
  }

  // ✅ Bytt husstand (logg ut)
  function handleLeave() {
    if (!confirm('Vil du bytte husstand? Du må skrive inn navn og kode på nytt.')) return
    try {
      localStorage.removeItem(STORAGE_KEY)
      if (household) localStorage.removeItem(STATE_KEY(household.code))
    } catch {}
    queueRef.current = []
    setHousehold(null)
    setState({ ...EMPTY_STATE })
  }

  // ✅ Copy code
  function handleCopyCode() {
    if (!household) return

    navigator.clipboard.writeText(household.code)
      .then(() => {
        showToast('Kode kopiert! Del med husstandsmedlemmer')
      })
      .catch(() => {
        showToast(`Kode: ${household.code}`)
      })
  }

  // ✅ Not logged in yet
  if (!household) {
    return <JoinHousehold onJoin={handleJoin} />
  }

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <h1>
          <span
            className="connection-dot"
            style={{
              background: connected ? '#69f0ae' : '#ffcc02',
              width: 8,
              height: 8,
              borderRadius: '50%',
              display: 'inline-block',
              marginRight: 8
            }}
          />
          Hei, {household.name}!
        </h1>

        <div className="header-actions">
          <button
            className="household-badge"
            onClick={handleCopyCode}
            title="Trykk for å kopiere kode"
          >
            # {household.code}
          </button>
          <button
            className="btn-leave"
            onClick={handleLeave}
            title="Bytt husstand"
          >
            Bytt
          </button>
        </div>
      </header>

      {/* TILKOBLINGSSTATUS */}
      {!connected && (
        <div className="sync-banner">
          🔄 Viser lagret liste – kobler til server…
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="tab-content">
        {tab === 'grocery' && (
          <GroceryList
            groceries={state.groceries}
            meals={state.meals}
            sendMessage={sendMessage}
            householdCode={household.code}
          />
        )}

        {tab === 'meals' && (
          <MealPlan
            meals={state.meals}
            groceries={state.groceries}
            mealTemplates={state.mealTemplates}
            sendMessage={sendMessage}
            householdCode={household.code}
          />
        )}
      </main>

      {/* NAVIGATION */}
      <nav className="tab-bar">
        <button
          className={`tab-btn${tab === 'grocery' ? ' active' : ''}`}
          onClick={() => setTab('grocery')}
        >
          <span className="tab-icon">🛒</span>
          <span className="tab-label">Handleliste</span>
        </button>

        <button
          className={`tab-btn${tab === 'meals' ? ' active' : ''}`}
          onClick={() => setTab('meals')}
        >
          <span className="tab-icon">🍽️</span>
          <span className="tab-label">Middagsplan</span>
        </button>
      </nav>

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}