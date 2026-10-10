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
