export function startIdleWatch({
    warnAfterMs = 3 * 60 * 1000,
    forceAfterMs = 2 * 60 * 1000,
    onWarn,          // () => Promise<boolean>  (true = leave, false = stay)
    onForceReset     // () => void
  } = {}) {
    let warnTimer = null;
    let forceTimer = null;
  
    const userEvents = ["pointerdown", "touchstart", "keydown", "wheel", "scroll"];
  
    const clearTimers = () => {
      if (warnTimer) {
        clearTimeout(warnTimer);
        warnTimer = null;
      }
      if (forceTimer) {
        clearTimeout(forceTimer);
        forceTimer = null;
      }
    };
  
    const schedule = () => {
      clearTimers();
  
      warnTimer = setTimeout(async () => {
        let leave = false;
        try {
          if (typeof onWarn === "function") {
            // onWarn should resolve true (leave) or false (stay)
            leave = Boolean(await onWarn());
          }
        } catch {
          leave = false;
        }
  
        if (leave) {
          // user chose to leave now
          if (typeof onForceReset === "function") onForceReset();
          return;
        }
  
        // user stayed or dialog dismissed → arm force timer
        forceTimer = setTimeout(() => {
          if (typeof onForceReset === "function") onForceReset();
        }, forceAfterMs);
      }, warnAfterMs);
    };
  
    const bump = () => schedule();
  
    // Listen for any user activity to reset the idle timer
    userEvents.forEach((ev) => {
      window.addEventListener(ev, bump, { passive: true });
    });
  
    // initial arm
    schedule();
  
    // return cleanup function
    return () => {
      clearTimers();
      userEvents.forEach((ev) => {
        window.removeEventListener(ev, bump);
      });
    };
  }
  