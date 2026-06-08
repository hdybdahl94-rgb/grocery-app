import { useState, useEffect, useRef, useCallback } from 'react'
import JoinHousehold from './components/JoinHousehold.jsx'
import GroceryList from './components/GroceryList.jsx'
import MealPlan from './components/MealPlan.jsx'
import { WS_URL } from './config.js'

const STORAGE_KEY = 'handleliste:household'
const STATE_KEY = (code) => `handleliste:state:${code}`
const QUEUE_KEY = (code) => `handleliste:queue:${code}`

const EMPTY_STATE = { groceries: [], meals: [], mealTemplates: [] }

function loadStoredHousehold() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.name && parsed.code) return parsed
  } catch { }
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
  } catch { }
  return { ...EMPTY_STATE }
}

function saveCachedState(code, s) {
  try { localStorage.setItem(STATE_KEY(code), JSON.stringify(s)) } catch { }
}

function loadQueuedMessages(code) {
  try {
    const raw = localStorage.getItem(QUEUE_KEY(code))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { }
  return []
}

function saveQueuedMessages(code, queue) {
  try {
    localStorage.setItem(QUEUE_KEY(code), JSON.stringify(queue))
  } catch { }
}

function clearQueuedMessages(code) {
  try {
    localStorage.removeItem(QUEUE_KEY(code))
  } catch { }
}


function makeTempId(prefix = 'tmp') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}:${crypto.randomUUID()}`
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`
}

function normalizeText(text) {
  return (text || '').trim().toLowerCase()
}

function removeEmptyItems(groceries) {
  return groceries.filter(item => {
    const general = item.generalQuantity || 0
    const portions = (item.portions || []).filter(p => p.quantity > 0)
    return general > 0 || portions.length > 0
  }).map(item => ({
    ...item,
    portions: (item.portions || []).filter(p => p.quantity > 0),
  }))
}

function applyLocalMessage(prev, msg) {
  switch (msg.action) {
    case 'ADD_ITEM': {
      const text = msg.text.trim()
      const mealId = msg.mealId || null

      const groceries = [...prev.groceries]
      const existing = groceries.find(item =>
        !item.done && normalizeText(item.text) === normalizeText(text)
      )

      if (existing) {
        if (mealId) {
          const portions = [...(existing.portions || [])]
          const idx = portions.findIndex(p => p.mealId === mealId)

          if (idx >= 0) {
            portions[idx] = { ...portions[idx], quantity: portions[idx].quantity + 1 }
          } else {
            portions.push({ mealId, quantity: 1 })
          }

          return {
            ...prev,
            groceries: removeEmptyItems(
              groceries.map(g => g.id === existing.id
                ? { ...g, portions }
                : g
              )
            )
          }

        } else {
          return {
            ...prev,
            groceries: removeEmptyItems(
              groceries.map(g => g.id === existing.id
                ? { ...g, generalQuantity: (g.generalQuantity || 0) + 1 }
                : g
              )
            )
          }
        }
      }

      groceries.push({
        id: makeTempId('item'),
        pending: true,
        text,
        checked: false,
        done: false,
        generalQuantity: mealId ? 0 : 1,
        portions: mealId ? [{ mealId, quantity: 1 }] : [],
      })

      return { ...prev, groceries: groceries }
    }

    case 'TOGGLE_ITEM': {
      return {
        ...prev,
        groceries: prev.groceries.map(item =>
          item.id === msg.id
            ? { ...item, checked: !item.checked }
            : item
        )
      }
    }

    case 'DELETE_ITEM': {
      return {
        ...prev,
        groceries: prev.groceries.filter(item => item.id !== msg.id)
      }
    }

    case 'SET_PORTION': {
      const groceries = prev.groceries.map(item => {
        if (item.id !== msg.id) return item

        if (!msg.mealId) {
          return {
            ...item,
            generalQuantity: Math.max(0, msg.quantity)
          }
        }

        const portions = [...(item.portions || [])]
        const idx = portions.findIndex(p => p.mealId === msg.mealId)

        if (idx >= 0) {
          if (msg.quantity <= 0) {
            portions.splice(idx, 1)
          } else {
            portions[idx] = { ...portions[idx], quantity: msg.quantity }
          }
        } else if (msg.quantity > 0) {
          portions.push({ mealId: msg.mealId, quantity: msg.quantity })
        }

        return {
          ...item,
          portions
        }
      })

      return {
        ...prev,
        groceries: removeEmptyItems(groceries)
      }
    }

    case 'CLEAR_CHECKED': {
      return {
        ...prev,
        groceries: prev.groceries.map(item =>
          item.checked ? { ...item, done: true } : item
        )
      }
    }

    case 'ADD_MEAL': {
      const newMeal = {
        id: makeTempId('meal'),
        day: msg.day,
        note: msg.note,
        pending: true,
      }

      let next = {
        ...prev,
        meals: [...prev.meals, newMeal]
      }

      if (msg.useTemplate) {
        const template = (prev.mealTemplates || []).find(
          t => normalizeText(t.mealName) === normalizeText(msg.note)
        )

        if (template?.ingredients?.length) {
          for (const ing of template.ingredients) {
            for (let i = 0; i < (ing.quantity || 1); i++) {
              next = applyLocalMessage(next, {
                action: 'ADD_ITEM',
                text: ing.text,
                mealId: newMeal.id,
              })
            }
          }
        }
      }

      return next
    }

    case 'DELETE_MEAL': {
      const meals = prev.meals.filter(meal => meal.id !== msg.id)

      const groceries = removeEmptyItems(
        prev.groceries.map(item => ({
          ...item,
          portions: (item.portions || []).filter(p => p.mealId !== msg.id)
        }))
      )

      return {
        ...prev,
        meals,
        groceries
      }
    }

    default:
      return prev
  }
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
  const queueRef = useRef(
    initialHousehold ? loadQueuedMessages(initialHousehold.code) : []
  ) // endringer som venter på at backend våkner

  // ✅ Toast helper
  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }, [])

  // ✅ Send melding – eller legg i kø hvis backend ikke er tilgjengelig ennå
  const sendMessage = useCallback((msg) => {
    if (!household) return

    // 1. Oppdater UI lokalt umiddelbart
    setState(prev => {
      const next = applyLocalMessage(prev, msg)
      saveCachedState(household.code, next)
      return next
    })

    // 2. Send til backend hvis mulig – ellers legg i persistent kø
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      queueRef.current = [...queueRef.current, msg]
      saveQueuedMessages(household.code, queueRef.current)
    }
  }, [household])

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


        const queued = [...queueRef.current]

        // IKKE tøm enda!
        queued.forEach(m => ws.send(JSON.stringify(m)))

      }
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)

          if (data.type === 'STATE') {
            setState(prev => {
              const next = {
                groceries: (data.groceries && data.groceries.length > 0)
                  ? data.groceries
                  : prev.groceries,
                meals: (data.meals && data.meals.length > 0)
                  ? data.meals
                  : prev.meals, // ✅ bruk prev, ikke state
                mealTemplates: data.mealTemplates || [],
              }

              const isServerEmpty =
                (data.groceries?.length || 0) === 0 &&
                (data.meals?.length || 0) === 0

              if (!isServerEmpty) {
                next.groceries = next.groceries.map(item => ({
                  ...item,
                  pending: false,
                }))

                next.meals = next.meals.map(meal => ({
                  ...meal,
                  pending: false,
                }))
              }

              // cache + queue håndtering
              if (household?.code) {
                saveCachedState(household.code, next)

                if (queueRef.current.length > 0) {
                  queueRef.current = []
                  saveQueuedMessages(household.code, [])
                  showToast("✅ Endringer synkronisert")
                }
              }

              return next
            })
          }
        } catch { }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        if (!closed && navigator.onLine) {
          reconnectTimeout = setTimeout(connect, 2000)
        }
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
    queueRef.current = loadQueuedMessages(code)

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hh)) } catch { }
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
      if (household) {
        localStorage.removeItem(STATE_KEY(household.code))
        clearQueuedMessages(household.code)
      }
    } catch { }
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