const PROMPT_ID = "fn-idle-prompt";

// Remove any existing prompt
export function dismissIdlePrompt() {
  const el = document.getElementById(PROMPT_ID);
  if (el) {
    try { el.remove(); } catch {}
  }
}

// Returns Promise<boolean> that resolves true (leave) or false (stay)
export function showIdlePrompt(message = "Do you want to leave the survey?") {
  // Ensure only one prompt at a time
  dismissIdlePrompt();

  const wrapper = document.createElement("div");
  wrapper.id = PROMPT_ID;
  wrapper.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);
                display:flex;align-items:center;justify-content:center;z-index:99999;">
      <div style="background:#fff;padding:20px 24px;border-radius:12px;
                  max-width:360px;width:90%;font-family:sans-serif;text-align:center">
        <div style="margin-bottom:16px;font-size:16px">${message}</div>
        <div style="display:flex;gap:12px;justify-content:center">
          <button id="idle-yes" style="padding:10px 16px;border-radius:8px;border:0;
                  background:#e11d48;color:#fff">Yes</button>
          <button id="idle-no"  style="padding:10px 16px;border-radius:8px;border:1px solid #ddd;
                  background:#fff">No</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrapper);

  const cleanup = (value) => {
    dismissIdlePrompt();
    // small delay avoids race with route change
    setTimeout(() => resolve(value), 0);
  };

  let resolve;
  const p = new Promise((r) => (resolve = r));

  wrapper.querySelector("#idle-yes").onclick = () => cleanup(true);
  wrapper.querySelector("#idle-no").onclick  = () => cleanup(false);

  return p;
}
