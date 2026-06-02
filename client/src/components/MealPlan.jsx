import { useState } from 'react'

const MEAL_ICONS = ['🍝', '🌮', '🍕', '🍜', '🥗', '🍔', '🍣', '🥘', '🍛', '🥩', '🫕', '🍲']
function getMealIcon(id) { return MEAL_ICONS[id.charCodeAt(0) % MEAL_ICONS.length] }

export default function MealPlan({ meals, groceries, mealTemplates, sendMessage, householdCode }) {
  const [day, setDay] = useState('')
  const [note, setNote] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [expandedMealId, setExpandedMealId] = useState(null)
  const [ingredientText, setIngredientText] = useState('')

  function handleNoteChange(value) {
    setNote(value)
    if (!value.trim()) {
      setSuggestions([])
      return
    }
    // Foreslå tidligere retter som matcher det bruker skriver
    const matches = (mealTemplates || [])
      .filter(t => t.mealName.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 5)
    setSuggestions(matches)
  }

  function handleSelectSuggestion(template) {
    setNote(template.mealName)
    setSuggestions([])

    // Hvis template har ingredienser, spør om gjenbruk
    if (template.ingredients && template.ingredients.length > 0) {
      const shouldUseTemplate = confirm(
        `Vil du bruke de samme varene som forrige gang?\n\n${template.ingredients.map(i => `${i.text} ×${i.quantity}`).join('\n')}`
      )
      setSelectedTemplate({ ...template, useTemplate: shouldUseTemplate })
    } else {
      setSelectedTemplate(null)
    }
  }

  function handleAddMeal(e) {
    e.preventDefault()
    if (!day.trim() || !note.trim()) return

    // Bruk verdien fra selectedTemplate hvis bruker valgte fra forslag
    let useTemplate = selectedTemplate?.useTemplate || false

    // Hvis bruker skrev manuelt (ikke fra forslag), spør igjen
    if (!selectedTemplate) {
      const template = (mealTemplates || []).find(t => t.mealName === note.trim())
      if (template && template.ingredients && template.ingredients.length > 0) {
        useTemplate = confirm(
          `Vil du bruke de samme varene som forrige gang?\n\n${template.ingredients.map(i => `${i.text} ×${i.quantity}`).join('\n')}`
        )
      }
    }

    sendMessage({
      action: 'ADD_MEAL',
      code: householdCode,
      day: day.trim(),
      note: note.trim(),
      useTemplate,
    })
    setDay('')
    setNote('')
    setSuggestions([])
    setSelectedTemplate(null)
  }

  function handleDeleteMeal(id) {
    sendMessage({ action: 'DELETE_MEAL', code: householdCode, id })
    if (expandedMealId === id) setExpandedMealId(null)
  }

  function handleAddIngredient(e, mealId) {
    e.preventDefault()
    if (!ingredientText.trim()) return
    sendMessage({ action: 'ADD_ITEM', code: householdCode, text: ingredientText.trim(), mealId })
    setIngredientText('')
  }

  function handleToggleIngredient(id) {
    sendMessage({ action: 'TOGGLE_ITEM', code: householdCode, id })
  }

  function handleDeleteIngredient(id) {
    sendMessage({ action: 'DELETE_ITEM', code: householdCode, id })
  }

  function handleSetPortion(id, mealId, quantity) {
    sendMessage({ action: 'SET_PORTION', code: householdCode, id, mealId, quantity })
  }

  return (
    <div>
      <form className="meal-add-form" onSubmit={handleAddMeal}>
        <div className="meal-add-row">
          <input className="input-field" placeholder="Dag / anledning (f.eks. Mandag)"
            value={day} onChange={e => setDay(e.target.value)} autoComplete="off" />
        </div>
        <div className="meal-add-row">
          <div className="input-with-suggestions">
            <input className="input-field" placeholder="Hva er til middag? (f.eks. Pasta carbonara)"
              value={note} onChange={e => handleNoteChange(e.target.value)} autoComplete="off" />
            {suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.map(s => (
                  <div key={s.id} className="suggestion-item" onClick={() => handleSelectSuggestion(s)}>
                    <div className="suggestion-name">{s.mealName}</div>
                    {s.ingredients && s.ingredients.length > 0 && (
                      <div className="suggestion-ingredients">{s.ingredients.length} varer</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn-add" type="submit" aria-label="Legg til middag">+</button>
        </div>
      </form>

      {meals.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">🍽️</span>
          <p>Ingen middager planlagt ennå.<br />Legg til din første middag!</p>
        </div>
      )}

      <div className="meal-cards">
        {meals.map(meal => {
          const linked = (groceries || []).filter(g =>
            (g.portions || []).some(p => p.mealId === meal.id)
          )
          const doneCount = linked.filter(g => g.done).length
          const isExpanded = expandedMealId === meal.id

          return (
            <div className="meal-card" key={meal.id}>
              <div className="meal-card-header">
                <span className="meal-card-icon">{getMealIcon(meal.id)}</span>
                <div className="meal-card-body">
                  <div className="meal-card-day">{meal.day}</div>
                  <div className="meal-card-note">{meal.note}</div>
                  {linked.length > 0 && (
                    <div className="meal-progress">{doneCount}/{linked.length} ingredienser hentet</div>
                  )}
                </div>
                <div className="meal-card-actions">
                  <button className={`btn-ingredients${isExpanded ? ' active' : ''}`}
                    onClick={() => { setExpandedMealId(prev => prev === meal.id ? null : meal.id); setIngredientText('') }}>
                    🧺{linked.length > 0 ? ` ${linked.length}` : ''}
                  </button>
                  <button className="btn-delete" onClick={() => handleDeleteMeal(meal.id)} aria-label="Slett middag">✕</button>
                </div>
              </div>

              {isExpanded && (
                <div className="meal-ingredients">
                  {linked.length === 0 && <p className="ingredients-empty">Ingen ingredienser lagt til ennå</p>}

                  {linked.map(item => {
                    const portion = (item.portions || []).find(p => p.mealId === meal.id)
                    const portionQty = portion ? portion.quantity : 1
                    const totalOther = (item.portions || [])
                      .filter(p => p.mealId !== meal.id)
                      .reduce((s, p) => s + p.quantity, 0) + (item.generalQuantity || 0)

                    return (
                      <div key={item.id} className={`ingredient-item${item.checked || item.done ? ' checked' : ''}`}>
                        <button className="grocery-checkbox small"
                          onClick={() => handleToggleIngredient(item.id)} disabled={item.done}>
                          {item.checked || item.done ? '✓' : ''}
                        </button>

                        <span className="ingredient-text">
                          {item.text}
                          {totalOther > 0 && (
                            <span className="ingredient-shared" title={`Brukes også i andre retter (totalt ${portionQty + totalOther} stk)`}>
                              {' '}(delt)
                            </span>
                          )}
                        </span>

                        {item.done
                          ? <span className="done-badge">Hentet</span>
                          : (
                            <div className="quantity-stepper compact">
                              <button className="qty-btn"
                                onClick={() => handleSetPortion(item.id, meal.id, portionQty - 1)}>−</button>
                              <span className="qty-value">{portionQty}</span>
                              <button className="qty-btn"
                                onClick={() => handleSetPortion(item.id, meal.id, portionQty + 1)}>+</button>
                            </div>
                          )
                        }

                        {!item.done && (
                          <button className="btn-delete small" onClick={() => handleDeleteIngredient(item.id)}>✕</button>
                        )}
                      </div>
                    )
                  })}

                  <form className="ingredient-add-form" onSubmit={e => handleAddIngredient(e, meal.id)}>
                    <input className="input-field small" placeholder="Legg til ingrediens…"
                      value={ingredientText} onChange={e => setIngredientText(e.target.value)} autoComplete="off" />
                    <button className="btn-add small" type="submit">+</button>
                  </form>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
