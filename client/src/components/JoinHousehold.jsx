import { useState } from 'react'
import { API_URL } from '../config.js'

export default function JoinHousehold({ onJoin, initialCode, households = [], onRemove }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialCode || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')



  async function handleJoin(e) {
    if (e) e.preventDefault()
    if (!name.trim()) { setError('Skriv inn navnet ditt'); return }
    if (!code.trim() || code.trim().length !== 4) { setError('Skriv inn en gyldig 4-bokstavs kode'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/household/${code.trim().toUpperCase()}`)
      const data = await res.json()
      onJoin(name.trim(), data.code, data)
    } catch {
      const existing = households.find(h => h.code === code.trim().toUpperCase())
      if (existing) {
        onJoin(name.trim(), existing.code, { groceries: [], meals: [] })
      } else {
        setError('Kunne ikke koble til serveren.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e) {
  if (e) e.preventDefault()

  if (!name.trim()) {
    setError('Skriv inn navnet ditt først')
    return
  }

  setError('')
  setLoading(true)

  try {
    const res = await fetch(`${API_URL}/api/household/create`, { method: 'POST' })

    // ✅ NY: sjekk response
    if (!res.ok) {
      throw new Error('Create failed')
    }

    const data = await res.json()

    const res2 = await fetch(`${API_URL}/api/household/${data.code}`)

    // ✅ NY: sjekk response
    if (!res2.ok) {
      throw new Error('Fetch household failed')
    }

    const data2 = await res2.json()

    onJoin(name.trim(), data.code, {
      ...data2,
      label: label || ''
    })

  } catch (err) {
    console.error("FEIL:", err) // ✅ viktig debug
    setError('Kunne ikke koble til serveren.')
  } finally {
    setLoading(false)
  }
}

  return (
    <div className="join-screen" style={{ padding: '20px', boxSizing: 'border-box', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <div className="join-logo" style={{ fontSize: '48px', marginBottom: '10px', textAlign: 'center' }}>🛒</div>
      <h1 style={{ textAlign: 'center', margin: '0 0 5px 0', fontSize: '28px', fontWeight: 'bold', color: '#333' }}>Handleliste</h1>
      <p style={{ textAlign: 'center', color: '#666', margin: '0 0 24px 0', fontSize: '15px' }}>Del listen med hele husstanden</p>

      <div className="join-card" style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        width: '100%',
        maxWidth: '400px',
        boxSizing: 'border-box'
      }}>

        {/* 1. DITT NAVN */}
        <div className="input-group" style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#777', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ditt navn</label>
          <input
            className="input-field"
            placeholder="f.eks. Kari"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #ccc',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div className="input-group">
          <label>Navn på husstand (valgfritt)</label>
          <input
            placeholder="f.eks. Hjemme, Hytte..."
            value={label}
            onChange={e => setLabel(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #ccc',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>


        {/* 2. DINE HUSSTANDER - Rendres her, trygt plassert inni det hvite kortet */}
        {households && households.length > 0 && (
          <div className="saved-households-section" style={{ marginBottom: '25px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#777', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Dine lagrede husstander
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {households.map(h => (
                <div
                  key={h.code}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center'
                  }}
                >
                  {/* ✅ BYTT KNAPP */}
                  <button
                    onClick={() => {
                      const userName = h.name || name

                      if (!userName || !userName.trim()) {
                        setError('Fant ikke lagret navn')
                        return
                      }

                      onJoin(userName.trim(), h.code, { groceries: [], meals: [] })
                    }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#e8f5e9',
                      border: '1px solid #c8e6c9',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      cursor: 'pointer'
                    }}
                  >
                    <span>{h.label || h.name || 'Husstand'}</span>
                    <span>{h.code}</span>
                  </button>

                  {/* ❌ DELETE KNAPP */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation() // ✅ veldig viktig!
                      onRemove(h.code)
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#999',
                      fontSize: '16px',
                      cursor: 'pointer'
                    }}
                  >
                    ❌
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. HUSSTANDSKODE */}
        <div className="input-group" style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#777', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Eller skriv inn ny kode</label>
          <input
            className="input-field"
            placeholder="ABCD"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
            maxLength={4}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #ccc',
              fontSize: '18px',
              fontWeight: 'bold',
              letterSpacing: '4px',
              textAlign: 'center',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {error && <p style={{ color: '#d32f2f', fontSize: '14px', textAlign: 'center', margin: '0 0 12px 0' }}>{error}</p>}

        <button
          className="btn-primary"
          onClick={handleJoin}
          disabled={loading}
          style={{
            width: '100%',
            background: '#4caf50',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '14px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginBottom: '4px'
          }}
        >
          {loading ? 'Kobler til...' : 'Bli med i husstanden'}
        </button>

        <div style={{ textAlign: 'center', fontSize: '13px', margin: '14px 0', color: '#aaa', fontWeight: '500' }}>eller</div>

        <button
          className="btn-secondary"
          onClick={handleCreate}
          disabled={loading}
          style={{
            width: '100%',
            background: '#f5f5f5',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            boxSizing: 'border-box'
          }}
        >
          ✨ Opprett ny husstand
        </button>

      </div>
    </div>
  )
}