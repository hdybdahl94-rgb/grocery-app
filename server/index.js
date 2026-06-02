const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Helse-sjekk / rot-rute
app.get('/', (req, res) => res.send('Handleliste-server kjører ✅'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===== Database (Supabase / Postgres) =====
// Setter DATABASE_URL i miljøet i produksjon. Lokalt uten DB → ren in-memory.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

async function initDb() {
  if (!pool) {
    console.warn('⚠️  Ingen DATABASE_URL satt – kjører in-memory (data forsvinner ved omstart)');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS households (
      code TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('✅ Database tilkoblet og tabell klar');
}

// In-memory cache (for hastighet + sanntidssync). Speiles til databasen.
const households = {};
const clientHousehold = new Map();

function normalize(data) {
  data.groceries = data.groceries || [];
  data.meals = data.meals || [];
  data.mealTemplates = data.mealTemplates || [];
  return data;
}

// Hent husstand: fra cache, ellers fra databasen, ellers opprett tom.
async function ensureHousehold(code) {
  if (households[code]) return households[code];

  let data = { groceries: [], meals: [], mealTemplates: [] };
  if (pool) {
    try {
      const r = await pool.query('SELECT data FROM households WHERE code = $1', [code]);
      if (r.rows.length) {
        data = normalize(r.rows[0].data || {});
      } else {
        await pool.query(
          'INSERT INTO households(code, data) VALUES($1, $2) ON CONFLICT (code) DO NOTHING',
          [code, data]
        );
      }
    } catch (err) {
      console.error('DB-lesing feilet:', err.message);
    }
  }
  households[code] = normalize(data);
  return households[code];
}

// Lagre husstanden til databasen (write-through).
function persist(code) {
  if (!pool) return;
  const hh = households[code];
  if (!hh) return;
  pool
    .query(
      `INSERT INTO households(code, data, updated_at) VALUES($1, $2, now())
       ON CONFLICT (code) DO UPDATE SET data = $2, updated_at = now()`,
      [code, hh]
    )
    .catch(err => console.error('DB-lagring feilet:', err.message));
}

async function codeExists(code) {
  if (households[code]) return true;
  if (!pool) return false;
  try {
    const r = await pool.query('SELECT 1 FROM households WHERE code = $1', [code]);
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function broadcast(code, data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && clientHousehold.get(client) === code)
      client.send(msg);
  });
}

// Send oppdatert tilstand til alle klienter OG lagre til databasen.
function broadcastState(code) {
  const hh = households[code];
  if (!hh) return;
  broadcast(code, { type: 'STATE', groceries: hh.groceries, meals: hh.meals, mealTemplates: hh.mealTemplates || [] });
  persist(code);
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

// ===== REST =====
app.get('/api/household/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const hh = await ensureHousehold(code);
  res.json({ code, groceries: hh.groceries, meals: hh.meals, mealTemplates: hh.mealTemplates });
});

app.post('/api/household/create', async (req, res) => {
  let code;
  do { code = generateCode(); } while (await codeExists(code));
  await ensureHousehold(code);
  persist(code);
  res.json({ code });
});

// ===== WebSocket =====
wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { action, code: rawCode } = msg;
    const code = rawCode ? rawCode.toUpperCase() : null;
    if (!code) return;

    // Sørg for at husstanden er lastet fra databasen før vi gjør noe
    const hh = await ensureHousehold(code);

    switch (action) {
      case 'JOIN': {
        clientHousehold.set(ws, code);
        ws.send(JSON.stringify({ type: 'STATE', ...hh }));
        break;
      }

      case 'ADD_ITEM': {
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
        const item = hh.groceries.find(g => g.id === msg.id);
        if (item) item.checked = !item.checked;
        broadcastState(code);
        break;
      }

      case 'DELETE_ITEM': {
        const toDelete = hh.groceries.find(g => g.id === msg.id);
        const affectedMealIds = toDelete ? (toDelete.portions || []).map(p => p.mealId) : [];
        hh.groceries = hh.groceries.filter(g => g.id !== msg.id);
        affectedMealIds.forEach(mid => syncTemplate(hh, mid));
        broadcastState(code);
        break;
      }

      case 'CLEAR_CHECKED': {
        hh.groceries.forEach(item => {
          if (item.checked) { item.done = true; item.checked = false; }
        });
        broadcastState(code);
        break;
      }

      case 'ADD_MEAL': {
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

        syncTemplate(hh, newMeal.id);
        broadcastState(code);
        break;
      }

      case 'DELETE_MEAL': {
        hh.meals = hh.meals.filter(m => m.id !== msg.id);
        hh.groceries.forEach(g => {
          g.portions = (g.portions || []).filter(p => p.mealId !== msg.id);
        });
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
initDb().finally(() => {
  server.listen(PORT, () => console.log(`Server kjører på http://localhost:${PORT}`));
});
