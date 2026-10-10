"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LENGTHS, historyApi as api } from "@/lib/shared";

const STYLES = [
  "Girlfriend experience (GFE)", "Femdom / dominant", "Gentle & sensual", "Teasing / denial",
  "Countdown game", "Edging challenge", "Roleplay (adult scenario)", "Humorous / playful", "ASMR whisper",
];
const GAMES = [
  { label: "นับถอยหลัง 10 วิ", value: "10-second countdowns (count 10→1 out loud)" },
  { label: "นับถอยหลัง 30 วิ", value: "30-second countdowns" },
  { label: "Edging", value: "Edging: bring close to the edge, then stop and hold, repeat several rounds" },
  { label: "CEI", value: "CEI (cum eating instruction) ending" },
  { label: "จังหวะเร็ว-ช้า", value: "Speed changes: alternate slow and fast stroke tempo with clear cues" },
  { label: "Beat / จังหวะเคาะ", value: "Stroke-to-the-beat cues (e.g. [beat: slow], [beat: fast])" },
  { label: "ห้ามเสร็จ (Denial)", value: "Denial: no release allowed at the end" },
  { label: "ทอยเต๋า / สุ่ม", value: "Dice / random game: outcomes decide the next instruction" },
  { label: "Ruined orgasm", value: "Ruined orgasm ending" },
  { label: "นับรอบ (Strokes count)", value: "Exact stroke counts (e.g. 'give me 20 strokes')" },
];
const SFX_SITES = [
  { name: "Freesound", url: "https://freesound.org", note: "ฟรี ต้องเช็ค license แต่ละไฟล์ (CC0 ใช้ได้เลย)" },
  { name: "Pixabay Sound Effects", url: "https://pixabay.com/sound-effects/", note: "ฟรี ใช้เชิงพาณิชย์ได้" },
  { name: "Pixabay Music", url: "https://pixabay.com/music/", note: "เพลงพื้นหลังฟรี" },
  { name: "Mixkit", url: "https://mixkit.co/free-sound-effects/", note: "ฟรี ไม่ต้องสมัคร" },
  { name: "Zapsplat", url: "https://www.zapsplat.com", note: "ฟรี (ต้องให้เครดิต) / แบบจ่ายไม่ต้อง" },
  { name: "YouTube Audio Library", url: "https://studio.youtube.com", note: "ฟรี เพลง+SFX" },
  { name: "Epidemic Sound", url: "https://www.epidemicsound.com", note: "เสียเงิน คุณภาพสูง" },
];
const TONES = ["Seductive", "Sweet & caring", "Bossy / strict", "Playful", "Mysterious", "Encouraging"];
// words ≈ spoken minutes × ~120 wpm (JOI has pauses and countdowns)
const BILLING_URL = "https://console.anthropic.com/settings/billing";
const USAGE_URL = "https://console.anthropic.com/usage";

// Rough expectations for the progress bar: ~6 chars/word + metadata, ~70 output tokens/s, ~20s thinking
const expectedChars = (words) => words * 6 + 1500;
const estimateSeconds = (words) => Math.round(20 + (words * 1.4 + 500) / 70);
const fmtTime = (s) => (s >= 60 ? `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วิ` : `${Math.max(0, Math.round(s))} วิ`);

const EMPTY = { text: "", styles: [], games: [], tone: TONES[0], persona: "", intensity: 3, length: LENGTHS[1].value, extra: "" };

function loadCredit() {
  try {
    return { total: JSON.parse(localStorage.getItem("credit"))?.total ?? 0 };
  } catch {
    return { total: 0 };
  }
}
function saveCredit(c) {
  try { localStorage.setItem("credit", JSON.stringify(c)); } catch {}
}
function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota full or storage blocked
  }
}

export default function Home() {
  const [form, setForm] = useState(EMPTY);
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [custom, setCustom] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggle = (tag, key = "styles") =>
    setForm((f) => ({ ...f, [key]: f[key].includes(tag) ? f[key].filter((t) => t !== tag) : [...f[key], tag] }));
  const addCustom = () => {
    const t = custom.trim();
    if (t && !form.styles.includes(t)) setForm((f) => ({ ...f, styles: [...f.styles, t] }));
    setCustom("");
  };

  const [progress, setProgress] = useState(null); // { start, chars, words, now }
  const [lastUsage, setLastUsage] = useState(null);
  const [credit, setCredit] = useState({ total: 0 });
  useEffect(() => setCredit(loadCredit()), []);

  // ---- draft autosave (this browser) + history (cloud, shared across devices) ----
  const [currentId, setCurrentId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [storageWarn, setStorageWarn] = useState("");
  const [cloudErr, setCloudErr] = useState("");
  const [savedOut, setSavedOut] = useState(""); // last script text known to be in the cloud

  useEffect(() => {
    const d = loadJSON("draft", null);
    if (d) {
      setForm({ ...EMPTY, ...d.form });
      setOut(d.out ?? "");
      setSavedOut(d.out ?? "");
      setMeta(d.meta ?? null);
      setCurrentId(d.currentId ?? null);
    }
    setLoaded(true);

    (async () => {
      // one-time move of the old browser-only history into the cloud
      const local = loadJSON("history", []);
      if (local.length) {
        try {
          for (const e of local) await api("POST", e);
          localStorage.removeItem("history");
        } catch (e) {
          setCloudErr("ย้ายประวัติเก่าขึ้นคลาวด์ไม่สำเร็จ: " + e.message);
        }
      }
      // opened from the history page: /?open=<id>
      const openId = new URLSearchParams(window.location.search).get("open");
      if (openId) {
        await openHistory(openId);
        window.history.replaceState(null, "", "/");
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const ok = saveJSON("draft", { form, out, meta, currentId });
    setStorageWarn(ok ? "" : "บันทึกร่างในเครื่องไม่สำเร็จ (พื้นที่เต็ม)");
  }, [form, out, meta, currentId, loaded]);

  // push edits to the script up to its cloud entry, debounced
  useEffect(() => {
    if (!loaded || !currentId || out === savedOut) return;
    const t = setTimeout(async () => {
      try {
        await api("PATCH", { id: currentId, out });
        setSavedOut(out);
      } catch (e) {
        setCloudErr("บันทึกการแก้ไขขึ้นคลาวด์ไม่สำเร็จ: " + e.message);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [out, currentId, savedOut, loaded]);

  // warn before leaving while a script is being generated
  useEffect(() => {
    if (!loading) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [loading]);

  async function addHistory(result, usedForm, usage) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: Date.now(),
      title: result.title,
      form: usedForm,
      out: result.script,
      meta: result,
      cost: usage?.cost ?? 0,
    };
    setCurrentId(entry.id);
    setSavedOut(entry.out);
    try {
      await api("POST", entry);
      setCloudErr("");
    } catch (e) {
      setCloudErr("บันทึกขึ้นคลาวด์ไม่สำเร็จ (บทยังอยู่ในหน้านี้ — ดาวน์โหลดเก็บไว้ก่อน): " + e.message);
    }
  }
  async function openHistory(id) {
    try {
      const entry = await api("GET", null, `?id=${encodeURIComponent(id)}`);
      setForm({ ...EMPTY, ...entry.form });
      setOut(entry.out);
      setSavedOut(entry.out);
      setMeta(entry.meta);
      setCurrentId(entry.id);
      setErr("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setCloudErr(e.message);
    }
  }
  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  // tick the clock while generating so elapsed/ETA keep moving during the thinking phase
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setProgress((p) => p && { ...p, now: Date.now() }), 500);
    return () => clearInterval(id);
  }, [loading]);

  function addSpend(cost) {
    setCredit((c) => {
      const next = { total: c.total + cost };
      saveCredit(next);
      return next;
    });
  }

  async function generate() {
    const len = LENGTHS.find((l) => l.value === form.length) ?? LENGTHS[1];
    setLoading(true);
    setErr("");
    setProgress({ start: Date.now(), now: Date.now(), chars: 0, words: len.words });
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, targetWords: len.words }),
      });
      if (!r.ok) throw new Error((await r.json()).error);

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "progress") setProgress((p) => ({ ...p, chars: ev.chars, now: Date.now() }));
          else if (ev.type === "error") throw new Error(ev.error);
          else if (ev.type === "done") {
            setOut(ev.result.script);
            setMeta(ev.result);
            setLastUsage(ev.usage);
            addSpend(ev.usage.cost);
            addHistory(ev.result, form, ev.usage);
          }
        }
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  // progress numbers
  let pct = 0, elapsed = 0, eta = 0, phase = "";
  if (progress) {
    elapsed = (progress.now - progress.start) / 1000;
    const total = estimateSeconds(progress.words);
    if (progress.chars === 0) {
      phase = "กำลังวางโครงเรื่อง (คิด)...";
      pct = Math.min(8, (elapsed / 20) * 8);
      eta = Math.max(total - elapsed, 5);
    } else {
      phase = "กำลังเขียนบท...";
      const frac = Math.min(progress.chars / expectedChars(progress.words), 0.99);
      pct = 8 + frac * 91;
      eta = frac > 0.02 ? (elapsed / frac) * (1 - frac) : total - elapsed;
    }
  }
  const selectedLen = LENGTHS.find((l) => l.value === form.length) ?? LENGTHS[1];

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([out], { type: "text/plain" }));
    a.download = "joi-script.txt";
    a.click();
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <h1>JOI Script Studio</h1>
        <nav>
          <Link href="/" className="active">✍️ สร้างบท</Link>
          <Link href="/history">📚 ประวัติ</Link>
        </nav>
      </div>
      <p className="sub">พิมพ์ไอเดียหรือบทร่างภาษาอะไรก็ได้ → ได้บทภาษาอังกฤษตามแนวที่เลือก (สำหรับผู้ใหญ่ 18+)</p>
      <div className="grid">
        <div className="card">
          <label>ไอเดีย / บทร่าง (ภาษาใดก็ได้)</label>
          <textarea rows={9} value={form.text} onChange={set("text")}
            placeholder="เช่น: อยากได้บทแนวพี่สาวข้างห้องใจดี ค่อย ๆ นับถอยหลัง..." />
          <label>แนว / ธีม (เลือกได้หลายแท็ก)</label>
          <div className="tags">
            {[...STYLES, ...form.styles.filter((t) => !STYLES.includes(t))].map((t) => (
              <button key={t} type="button" className={"tag" + (form.styles.includes(t) ? " on" : "")} onClick={() => toggle(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="tag-add">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="เพิ่มแท็กเอง เช่น Office, Gamer girl"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
            <button type="button" className="ghost" onClick={addCustom}>+ เพิ่ม</button>
          </div>
          <label>โทนเสียง</label>
          <select value={form.tone} onChange={set("tone")}>{TONES.map((s) => <option key={s}>{s}</option>)}</select>
          <div className="row">
            <div>
              <label>ผู้พูด (persona)</label>
              <input value={form.persona} onChange={set("persona")} placeholder="เช่น Female, 20s, confident" />
            </div>
            <div>
              <label>ความยาว</label>
              <select value={form.length} onChange={set("length")}>
                {LENGTHS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>
          <label>ความเข้มข้น: {form.intensity}/5</label>
          <input type="range" min={1} max={5} value={form.intensity} onChange={set("intensity")} />
          <label>เกม / คำสั่งพิเศษ (เลือกได้หลายอัน)</label>
          <div className="tags">
            {GAMES.map((g) => (
              <button key={g.value} type="button" className={"tag" + (form.games.includes(g.value) ? " on" : "")}
                onClick={() => toggle(g.value, "games")}>
                {g.label}
              </button>
            ))}
          </div>
          <label>คำสั่งเพิ่มเติม</label>
          <input value={form.extra} onChange={set("extra")} placeholder="เช่น ทำ 3 รอบก่อนจบ, เรียกว่า 'good boy'" />
          <div className="actions">
            <button onClick={generate} disabled={loading || !form.text.trim()}>
              {loading ? "กำลังเขียนบท..." : "✨ สร้างบท"}
            </button>
            <button className="ghost" onClick={() => { setForm(EMPTY); setCustom(""); setOut(""); setMeta(null); setCurrentId(null); setErr(""); }}>ล้าง</button>
          </div>
          {!loading && (
            <div className="hint">
              เวลาโดยประมาณ ~{fmtTime(estimateSeconds(selectedLen.words))} · ค่าใช้จ่ายประมาณ $
              {((selectedLen.words * 1.4 + 1500) * 20 / 1e6 + 0.01).toFixed(2)}
            </div>
          )}
          {progress && (
            <div className="progress">
              <div className="progress-head">
                <span>{phase}</span>
                <b>{Math.floor(pct)}%</b>
              </div>
              <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
              <div className="progress-foot">
                <span>ผ่านไป {fmtTime(elapsed)}</span>
                <span>เหลืออีกประมาณ {fmtTime(eta)}</span>
              </div>
            </div>
          )}
          {err && <div className="err">{err}</div>}
        </div>
        <div className="card">
          <label>บทภาษาอังกฤษ (แก้ไขได้)</label>
          <textarea className="out" value={out} onChange={(e) => setOut(e.target.value)} placeholder="ผลลัพธ์จะแสดงที่นี่" />
          <div className="actions">
            <button className="ghost" onClick={() => navigator.clipboard.writeText(out)} disabled={!out}>📋 คัดลอก</button>
            <button className="ghost" onClick={download} disabled={!out}>⬇ ดาวน์โหลด .txt</button>
          </div>
        </div>
      </div>

      {meta && (
        <div className="card meta">
          <label>ชื่อคลิป</label>
          <div className="title-row">
            <h2>{meta.title}</h2>
            <button className="ghost" onClick={() => navigator.clipboard.writeText(meta.title)}>📋</button>
          </div>
          {meta.alt_titles?.length > 0 && (
            <ul className="alts">{meta.alt_titles.map((t) => <li key={t}>{t}</li>)}</ul>
          )}

          <label>แนว</label>
          <div className="tags">{meta.genres.map((g) => <span key={g} className="tag on">{g}</span>)}</div>

          <label>Tags</label>
          <div className="tags">{meta.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
          <div className="actions">
            <button className="ghost" onClick={() => navigator.clipboard.writeText(meta.tags.join(", "))}>📋 คัดลอก tags</button>
          </div>

          <label>Sound effects / เพลงที่แนะนำ</label>
          <div className="sfx">
            {meta.sound_effects.map((s) => (
              <div key={s.name} className="sfx-item">
                <b>{s.name}</b>
                <span>ใช้ตอน: {s.when}</span>
                <span>คำค้น: <code>{s.search_keywords}</code></span>
              </div>
            ))}
          </div>

          <label>หา sound effect ได้ที่</label>
          <ul className="sites">
            {SFX_SITES.map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> — {s.note}</li>
            ))}
          </ul>
        </div>
      )}

      {(storageWarn || cloudErr) && <div className="err">{storageWarn || cloudErr}</div>}

      <footer className="credit-bar">
        <span>
          ใช้ไปแล้ว <b>${credit.total.toFixed(3)}</b>
          {lastUsage && <> · ครั้งล่าสุด <b>${lastUsage.cost.toFixed(3)}</b></>}
        </span>
        <span className="credit-links">
          <a href={USAGE_URL} target="_blank" rel="noreferrer">ดูยอดคงเหลือ</a>
          <a href={BILLING_URL} target="_blank" rel="noreferrer">💳 เติมเครดิต</a>
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>ออกจากระบบ</a>
        </span>
      </footer>
    </div>
  );
}
