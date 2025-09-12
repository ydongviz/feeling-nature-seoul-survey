const ENDPOINT = process.env.REACT_APP_STATE_ENDPOINT;

// Minimal POST helper
export async function postState(payload) {
  if (!ENDPOINT) {
    console.error('[stateApi] Missing REACT_APP_STATE_ENDPOINT');
    return { ok: false, error: 'No endpoint configured' };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      mode: 'cors',
      cache: 'no-store',
      keepalive: true,
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return data;
  } catch (err) {
    console.error('[stateApi] POST failed', err);
    return { ok: false, error: String(err) };
  }
}

/** Convenience wrappers that match the Lambda actions */
export const tvState = {
  inProgress:   (session_id) => postState({ action: 'in_progress', session_id }),
  countdown:    (session_id, seconds = 3) => postState({ action: 'countdown', session_id, seconds }),
  showResult:   (session_id) => postState({ action: 'show_result', session_id }),
  resetLanding: (session_id) => postState({ action: 'reset', session_id }),
};
