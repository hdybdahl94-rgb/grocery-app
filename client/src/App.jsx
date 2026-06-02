import { useState, useEffect, useRef, useCallback } from 'react'
import JoinHousehold from './components/JoinHousehold.jsx'
import GroceryList from './components/GroceryList.jsx'
import MealPlan from './components/MealPlan.jsx'
import { WS_URL } from './config.js'

export default function App() {
  const [household, setHousehold] = useState(null)
  const [state, setState] = useState({ groceries: [], meals: [], mealTemplates: [] })
  const [tab, setTab] = useState('grocery')
  const [connected, setConnected] = useState(false)
  const [toast, setToast] = useState(null)

  const wsRef = useRef(null)
  const toastTimer = useRef(null)

  // ✅ Toast helper
  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }, [])

  // ✅ Send WebSocket message
  
const sendMessage = useCallback((msg) => {
  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
    console.log('SENDER:', msg)
    wsRef.current.send(JSON.stringify(msg))
  } else {
    console.log('WebSocket IKKE åpen', wsRef.current?.readyState)
  }
}, [])


  // ✅ WebSocket connection
  useEffect(() => {
    if (!household) return

    let ws
    let reconnectTimeout

    function connect() {
      ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        ws.send(JSON.stringify({ action: 'JOIN', code: household.code }))
      }

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'STATE') {
            setState({
              groceries: data.groceries || [],
              meals: data.meals || [],
              mealTemplates: data.mealTemplates || []
            })
          }
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        reconnectTimeout = setTimeout(connect, 2000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout)
      if (ws) ws.close()
    }
  }, [household])

  // ✅ Join household
  function handleJoin(name, code, initialState) {
    setHousehold({ name, code })
    setState({
      groceries: initialState.groceries || [],
      meals: initialState.meals || [],
      mealTemplates: initialState.mealTemplates || []
    })
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

        <button
          className="household-badge"
          onClick={handleCopyCode}
          title="Trykk for å kopiere kode"
        >
          # {household.code}
        </button>
      </header>

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