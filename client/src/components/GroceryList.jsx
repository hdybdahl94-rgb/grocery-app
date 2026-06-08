import { useState } from 'react'

function totalQty(item) {
  const portionSum = (item.portions || []).reduce((s, p) => s + p.quantity, 0)
  return portionSum + (item.generalQuantity || 0)
}

export default function GroceryList({ groceries, meals, sendMessage, householdCode }) {
  const [text, setText] = useState('')

  function handleAdd(e) {
    e.preventDefault()
    if (!text.trim()) return
    // Alle varer fra handleliste blir "Generelt" (ingen mealId)
    sendMessage({ action: 'ADD_ITEM', code: householdCode, text: text.trim(), mealId: null })
    setText('')
  }

  function handleToggle(id) {
    const item = groceries.find(g => g.id === id)
    if (item?.pending) return
    sendMessage({ action: 'TOGGLE_ITEM', code: householdCode, id })
  }

  function handleDelete(id) {
    const item = groceries.find(g => g.id === id)
    if (item?.pending) return
    sendMessage({ action: 'DELETE_ITEM', code: householdCode, id })
  }

  function handleSetPortion(id, mealId, quantity) {
    const item = groceries.find(g => g.id === id)
    if (item?.pending) return
    sendMessage({ action: 'SET_PORTION', code: householdCode, id, mealId: mealId || null, quantity })
  }

  function handleClearChecked() {
    if (!confirm('Merk varer som handlet? De fjernes fra handlelisten.')) return
    sendMessage({ action: 'CLEAR_CHECKED', code: householdCode })
  }

  const mealMap = Object.fromEntries((meals || []).map(m => [m.id, m]))
  const visible = groceries.filter(g => !g.done)
  const unchecked = visible.filter(g => !g.checked)
  const checked = visible.filter(g => g.checked)

  return (
    <div>
      <form className="add-form" onSubmit={handleAdd}>
        <div className="add-form-top">
          <input
            className="input-field"
            placeholder="Legg til vare…"
            value={text}
            onChange={e => setText(e.target.value)}
            autoComplete="off"
          />
          <button className="btn-add" type="submit" aria-label="Legg til">+</button>
        </div>
      </form>

      {visible.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">🛒</span>
          <p>Handlelisten er tom.<br />Legg til din første vare eller bruk middagsplan!</p>
        </div>
      )}

      <div className="grocery-items">
        {unchecked.map(item => (
          <GroceryItem key={item.id} item={item} mealMap={mealMap}
            onToggle={handleToggle} onDelete={handleDelete} onSetPortion={handleSetPortion} />
        ))}
        {checked.length > 0 && unchecked.length > 0 && <div className="checked-separator">Hentet ({checked.length})</div>}
        {checked.length > 0 && unchecked.length === 0 && <div className="checked-separator">Alt hentet! ({checked.length})</div>}
        {checked.map(item => (
          <GroceryItem key={item.id} item={item} mealMap={mealMap}
            onToggle={handleToggle} onDelete={handleDelete} onSetPortion={handleSetPortion} />
        ))}
      </div>

      {checked.length > 0 && (
        <button className="btn-done-floating" onClick={handleClearChecked}>
          ✅ Varer handlet ({checked.length})
        </button>
      )}
    </div>
  )
}

function GroceryItem({ item, mealMap, onToggle, onDelete, onSetPortion }) {
  const total = totalQty(item)
  const portions = item.portions || []
  const hasGeneral = (item.generalQuantity || 0) > 0
  const isGeneral = portions.length === 0

  return (
    <div className={`grocery-item${item.checked ? ' checked' : ''}${item.pending ? ' pending' : ''}`}>
      {item.pending && <span className="pending-badge">⏳</span>}
      <button className="grocery-checkbox" onClick={() => onToggle(item.id)}
        aria-label={item.checked ? 'Merk som ikke hentet' : 'Merk som hentet'}>
        {item.checked ? '✓' : ''}
      </button>

      <div className="grocery-text-wrap">
        <span className="grocery-text">{item.text}</span>
        <div className="meal-tags">
          {portions.map(p => {
            const meal = mealMap[p.mealId]
            if (!meal) return null
            return <span key={p.mealId} className="meal-tag">🍽️ {meal.day} – {meal.note}</span>
          })}
          {isGeneral && <span className="meal-tag general-tag">🛒 Generelt</span>}
        </div>
      </div>

      <div className="quantity-stepper">
        {isGeneral ? (
          <>
            <button className="qty-btn" onClick={() => onSetPortion(item.id, null, (item.generalQuantity || 1) - 1)}>−</button>
            <span className="qty-value">{total}</span>
            <button className="qty-btn" onClick={() => onSetPortion(item.id, null, (item.generalQuantity || 1) + 1)}>+</button>
          </>
        ) : (
          <span className="qty-total">×{total}</span>
        )}
      </div>

      <button className="btn-delete" onClick={() => onDelete(item.id)} aria-label="Slett vare">✕</button>
    </div>
  )
}
