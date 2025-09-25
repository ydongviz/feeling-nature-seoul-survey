// src/stateApi.js
// Keeps your existing endpoint and behavior, adds gated event header.
const ENDPOINT = process.env.REACT_APP_STATE_ENDPOINT;
// Prefer Vite env if present; otherwise CRA-style:
const EVENT_KEY =
  (typeof import !== 'undefined' && import.meta?.env?.VITE_EVENT_KEY) ||
  process.env.REACT_APP_EVENT_KEY;

// Adjust this import path if your App.js is under /pages:
import { isEventUnlocked } from './pages/App';

async function post(payload) {
  if (!ENDPOINT) throw new Error('[stateApi] REACT_APP_STATE_ENDPOINT not set');

  // Base headers
  const headers = { 'content-type': 'application/json' };

  // Add the event header ONLY when the device is unlocked and a key exists
  if (isEventUnlocked() && EVENT_KEY) {
    headers['x-event-key'] = EVENT_KEY;
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    mode: 'cors',
    cache: 'no-store',
    keepalive: true,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

// API you’ll call from components:
export const tvState = {
  inProgress:   (session_id)         => post({ action: 'in_progress', session_id }),
  countdown:    (session_id, secs=3) => post({ action: 'countdown',   session_id, seconds: secs }),
  // NOTE: show_result should be called by your recompute Lambda (it has the ETag)
  // showResult: (session_id, current_etag) => post({ action: 'show_result', session_id, current_etag }),
  resetLanding: (session_id)         => post({ action: 'landing',     session_id }),
};

// One-liner session id helper (shared):
export function getSessionId() {
  let v = window.localStorage.getItem('fn_session_id');
  if (!v) {
    v = (crypto?.randomUUID?.() || `s-${Date.now()}`);
    window.localStorage.setItem('fn_session_id', v);
  }
  return v;
}
