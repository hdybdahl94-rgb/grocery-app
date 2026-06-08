import { useState } from 'react'
import { API_URL } from '../config.js'

export default function JoinHousehold({ onJoin, initialCode }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialCode || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Skriv inn navnet ditt'); return }
    if (!code.trim() || code.trim().length !== 4) { setError('Skriv inn en gyldig 4-bokstavs kode'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/household/${code.trim().toUpperCase()}`)
      const data = await res.json()
      onJoin(name.trim(), data.code, data)
    } catch {
      setError('Kunne ikke koble til serveren. Er den startet?')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Skriv inn navnet ditt først'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/household/create`, { method: 'POST' })
      const data = await res.json()
      const res2 = await fetch(`${API_URL}/api/household/${data.code}`)
      const data2 = await res2.json()
      onJoin(name.trim(), data.code, data2)
    } catch {
      setError('Kunne ikke koble til serveren. Er den startet?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="join-screen">
      <div className="join-logo">🛒</div>
      <h1>Handleliste</h1>
      <p>Del listen med hele husstanden</p>

      <div className="join-card">

        {initialCode && (
          <p className="info-text">
            🔗 Invitasjonslink åpnet – skriv inn navnet ditt for å bli med
          </p>
        )}

        <div className="input-group">
          <label>Ditt navn</label>
          <input
            className="input-field"
            placeholder="f.eks. Kari"
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="given-name"
          />
        </div>

        <div className="input-group">
          <label>Husstandskode</label>
          <input
            className="input-field code-field"
            placeholder="ABCD"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </div>

        {error && <p style={{ color: '#e53935', fontSize: 14, textAlign: 'center' }}>{error}</p>}

        <button className="btn-primary" onClick={handleJoin} disabled={loading}>
          {loading ? 'Kobler til…' : 'Bli med i husstanden'}
        </button>

        <div className="divider">eller</div>

        <button className="btn-secondary" onClick={handleCreate} disabled={loading}>
          {loading ? 'Oppretter…' : '✨ Opprett ny husstand'}
        </button>
      </div>
    </div>
  )
}
