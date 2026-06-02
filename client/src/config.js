// Sentralt sted for backend-URL.
// I produksjon settes VITE_API_URL (se .env.production) til Render-URL-en.
// Lokalt er den tom → API-kall går via Vite-proxy, WS mot localhost:3001.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const WS_URL = API_URL
  ? API_URL.replace(/^http/, 'ws') // https:// → wss://, http:// → ws://
  : `ws://${window.location.hostname}:3001`

export { API_URL, WS_URL }
