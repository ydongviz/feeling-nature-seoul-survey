// src/idle.js
export function startIdleWatch({
  warnAfterMs = 3 * 60 * 1000,
  forceAfterMs = 2 * 60 * 1000,
  onWarn,          // () => Promise<boolean>  (true = leave, false = stay)
  onForceReset     // () => void
} = {}) {
  let warnTimer = null;
  let forceTimer = null;

  const userEvents = ["pointerdown","touchstart","keydown","wheel","scroll"];

  const clearTimers = () => {
    if (warnTimer)  clearTimeout(warnTimer),  warnTimer = null;
    if (forceTimer) clearTimeout(forceTimer), forceTimer = null;
  };

  const schedule = () => {
    clearTimers();
    warnTimer = setTimeout(async () => {
      try {
        const leave = await (onWarn?.() ?? false);
        if (leave) {
          onForceReset?.();
          return; // do not arm forceTimer if leaving now
        }
      } catch {}
      // user chose "No" or dialog dismissed → arm the force timer
      forceTimer = setTimeout(() => onForceReset?.(), forceAfterMs);
    }, warnAfterMs);
  };

  const bump = () => schedule();

  userEvents.forEach(ev => window.addEventListener(ev, bump, { passive: true }));
  schedule();

  return () => {
    clearTimers();
    userEvents.forEach(ev => window.removeEventListener(ev, bump));
  };
}
