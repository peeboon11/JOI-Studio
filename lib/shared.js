// Client-side helpers shared by the studio page and the history page.

// words ≈ spoken minutes × ~120 wpm (JOI has pauses and countdowns)
export const LENGTHS = [
  { label: "สั้น ~1 นาที", value: "short (~1 minute spoken)", words: 120 },
  { label: "กลาง ~2-3 นาที", value: "medium (~2-3 minutes spoken)", words: 300 },
  { label: "ยาว ~5 นาที", value: "long (~5 minutes spoken)", words: 600 },
  { label: "ยาวมาก ~10 นาที", value: "very long (~10 minutes spoken)", words: 1200 },
  { label: "30 นาที", value: "30 minutes spoken", words: 3600 },
  { label: "1 ชั่วโมง", value: "60 minutes spoken", words: 7200 },
];

// Short synthesized chime (no audio file needed). ok=false plays a low two-note "error" tone.
export function playChime(ok = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = ok ? [659.25, 783.99, 1046.5] : [392, 311.13]; // E5 G5 C6 | G4 Eb4
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

// Desktop notification when the tab is in the background (needs permission once).
export function notify(title, body) {
  try {
    if (document.visibilityState === "visible" || Notification.permission !== "granted") return;
    new Notification(title, { body, icon: "/icon.svg" });
  } catch {}
}

// Calls /api/history; sends the user to /login when the session has expired.
export async function historyApi(method, body, query = "") {
  const r = await fetch(`/api/history${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) {
    window.location.href = "/login";
    throw new Error("กรุณาเข้าสู่ระบบใหม่");
  }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
