/* Public deployment configuration. Never put API secrets in this file.
 * Empty apiBaseUrl uses the same origin (recommended behind a reverse proxy).
 * For a separate backend, set an HTTPS origin, without a trailing slash.
 * sttUrl must be a WSS endpoint in production. Blank = same-origin WebSocket.
 */
window.AKK_CONFIG = Object.freeze({
  apiBaseUrl: '',
  sttUrl: 'wss://imperial-pushing-advantage-trackback.trycloudflare.com/v1/ws/realtime-speech',
});
