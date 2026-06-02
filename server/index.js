const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const households = {};
const clientHousehold = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function ensureHousehold(code) {
  if (!households[code]) households[code] = { groceries: [], meals: [], mealTemplates: [] };
  return households[code];
}

function broadcast(code, data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && clientHousehold.get(client) === code)
      client.send(msg);
  });
}

function broadcastState(code) {
  const hh = households[code];
  if (hh) broadcast(code, { type: 'STATE', groceries: hh.groceries, meals: hh.meals, mealTemplates: hh.mealTemplates || [] });
}

// Synkroniser malen for en rett: lagrer gjeldende ingredienser per rettnavn (upsert)
function syncTemplate(hh, mealId) {
  const meal = hh.meals.find(m => m.id === mealId);
  if (!meal) return;

  const ingredients = hh.groceries
    .filter(g => (g.portions || []).some(p => p.mealId === mealId))
    .map(g => {
      const portion = g.portions.find(p => p.mealId === mealId);
      return { text: g.text, quantity: portion.quantity };
    });

  // Ikke overskriv en lagret oppskrift med tom liste (f.eks. ved ny tom rett)
  if (ingredients.length === 0) return;

  if (!hh.mealTemplates) hh.mealTemplates = [];
  let template = hh.mealTemplates.find(t => t.mealName.toLowerCase() === meal.note.toLowerCase());

  if (template) {
    template.ingredients = ingredients;
    template.mealName = meal.note;
    template.mealDay = meal.day;
  } else {
    hh.mealTemplates.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      mealName: meal.note,
      mealDay: meal.day,
      ingredients,
      createdAt: new Date().toISOString(),
    });
  }
}

// Totalt antall for en vare = sum av alle porsjoner + eventuelt generelt antall
function totalQuantity(item) {
  const portionSum = (item.portions || []).reduce((sum, p) => sum + p.quantity, 0);
  return portionSum + (item.generalQuantity || 0);
}

app.get('/api/household/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const hh = ensureHousehold(code);
  res.json({ code, groceries: hh.groceries, meals: hh.meals });
});

app.post('/api/household/create', (req, res) => {
  let code;
  do { code = generateCode(); } while (households[code]);
  ensureHousehold(code);
  res.json({ code });
});

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { action, code: rawCode } = msg;
    const code = rawCode ? rawCode.toUpperCase() : null;
    const hh = code ? households[code] : null;

    switch (action) {
      case 'JOIN': {
        if (!code) return;
        ensureHousehold(code);
        clientHousehold.set(ws, code);
        ws.send(JSON.stringify({ type: 'STATE', ...households[code] }));
        break;
      }

      case 'ADD_ITEM': {
        if (!hh) return;
        const normalizedText = msg.text.trim().toLowerCase();
        const mealId = msg.mealId || null;
        const qty = msg.quantity || 1;

        const existing = hh.groceries.find(
          g => g.text.trim().toLowerCase() === normalizedText && !g.done
        );

        if (existing) {
          if (mealId) {
            const portion = (existing.portions || []).find(p => p.mealId === mealId);
            if (portion) portion.quantity += qty;
            else existing.portions = [...(existing.portions || []), { mealId, quantity: qty }];
          } else {
            existing.generalQuantity = (existing.generalQuantity || 0) + qty;
          }
        } else {
          hh.groceries.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            text: msg.text.trim(),
            checked: false,
            done: false,
            portions: mealId ? [{ mealId, quantity: qty }] : [],
            generalQuantity: mealId ? 0 : qty,
          });
        }

        if (mealId) syncTemplate(hh, mealId);
        broadcastState(code);
        break;
      }

      case 'SET_PORTION': {
        // Endre antall for en spesifikk rett (eller generelt)
        if (!hh) return;
        const item = hh.groceries.find(g => g.id === msg.id);
        if (!item) return;

        if (msg.mealId) {
          const portion = (item.portions || []).find(p => p.mealId === msg.mealId);
          if (portion) {
            if (msg.quantity <= 0) item.portions = item.portions.filter(p => p.mealId !== msg.mealId);
            else portion.quantity = msg.quantity;
          }
          syncTemplate(hh, msg.mealId);
        } else {
          item.generalQuantity = Math.max(0, msg.quantity);
        }
        broadcastState(code);
        break;
      }

      case 'TOGGLE_ITEM': {
        if (!hh) return;
        const item = hh.groceries.find(g => g.id === msg.id);
        if (item) item.checked = !item.checked;
        broadcastState(code);
        break;
      }

      case 'DELETE_ITEM': {
        if (!hh) return;
        const toDelete = hh.groceries.find(g => g.id === msg.id);
        const affectedMealIds = toDelete ? (toDelete.portions || []).map(p => p.mealId) : [];
        hh.groceries = hh.groceries.filter(g => g.id !== msg.id);
        affectedMealIds.forEach(mid => syncTemplate(hh, mid));
        broadcastState(code);
        break;
      }

      case 'CLEAR_CHECKED': {
        if (!hh) return;
        hh.groceries.forEach(item => {
          if (item.checked) { item.done = true; item.checked = false; }
        });
        broadcastState(code);
        break;
      }

      case 'ADD_MEAL': {
        if (!hh) return;
        const newMeal = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          day: msg.day,
          note: msg.note,
        };

        hh.meals.push(newMeal);

        // Hvis useTemplate er satt, kopier ingredienser fra tidligere mal
        if (msg.useTemplate) {
          const template = (hh.mealTemplates || []).find(
            t => t.mealName.toLowerCase() === msg.note.toLowerCase()
          );
          if (template && template.ingredients) {
            template.ingredients.forEach(ing => {
              hh.groceries.push({
                id: Date.now().toString() + Math.random().toString(36).slice(2),
                text: ing.text,
                checked: false,
                done: false,
                portions: [{ mealId: newMeal.id, quantity: ing.quantity }],
                generalQuantity: 0,
              });
            });
          }
        }

        // Synk malen (oppretter tom mal hvis ny rett, eller beholder eksisterende)
        syncTemplate(hh, newMeal.id);
        broadcastState(code);
        break;
      }

      case 'DELETE_MEAL': {
        if (!hh) return;
        hh.meals = hh.meals.filter(m => m.id !== msg.id);
        // Fjern porsjoner knyttet til denne retten
        hh.groceries.forEach(g => {
          g.portions = (g.portions || []).filter(p => p.mealId !== msg.id);
        });
        // Slett varer som nå ikke er knyttet til noe og har 0 generelt
        hh.groceries = hh.groceries.filter(g =>
          (g.portions || []).length > 0 || (g.generalQuantity || 0) > 0
        );
        broadcastState(code);
        break;
      }

      default: break;
    }
  });

  ws.on('close', () => clientHousehold.delete(ws));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server kjører på http://localhost:${PORT}`));
