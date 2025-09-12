const ENDPOINT = process.env.REACT_APP_STATE_ENDPOINT;

async function post(payload) {
  if (!ENDPOINT) throw new Error('[stateApi] REACT_APP_STATE_ENDPOINT not set');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
  inProgress:   (session_id)        => post({ action: 'in_progress', session_id }),
  countdown:    (session_id, secs=3)=> post({ action: 'countdown',   session_id, seconds: secs }),
  // NOTE: show_result should be called by your recompute Lambda (it has the ETag)
  // showResult: (session_id, current_etag) => post({ action: 'show_result', session_id, current_etag }),
  resetLanding: (session_id)        => post({ action: 'landing',     session_id }),
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
