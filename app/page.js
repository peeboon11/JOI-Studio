"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LENGTHS, historyApi as api, playChime, notify } from "@/lib/shared";

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
const TRANSLATE_LANGS = ["ไทย (Thai)", "日本語 (Japanese)", "中文 (Chinese)", "한국어 (Korean)", "Español (Spanish)", "Tiếng Việt (Vietnamese)", "Bahasa Indonesia"];
const SFX_SITES = [
  { name: "Freesound", url: "https://freesound.org", note: "ฟรี ต้องเช็ค license แต่ละไฟล์ (CC0 ใช้ได้เลย)" },
  { name: "Pixabay Sound Effects", url: "https://pixabay.com/sound-effects/", note: "ฟรี ใช้เชิงพาณิชย์ได้" },
  { name: "Pixabay Music", url: "https://pixabay.com/music/", note: "เพลงพื้นหลังฟรี" },
  { name: "Mixkit", url: "https://mixkit.co/free-sound-effects/", note: "ฟรี ไม่ต้องสมัคร" },
  { name: "Zapsplat", url: "https://www.zapsplat.com", note: "ฟรี (ต้องให้เครดิต) / แบบจ่ายไม่ต้อง" },
  { name: "YouTube Audio Library", url: "https://studio.youtube.com", note: "ฟรี เพลง+SFX" },
  { name: "Epidemic Sound", url: "https://www.epidemicsound.com", note: "เสียเงิน คุณภาพสูง" },
];
// performer actions to describe in [ACTION: ...] directions
const ACTS = [
  { label: "จูบ / เล้าโลม", value: "kissing and foreplay" },
  { label: "ถอดเสื้อผ้า", value: "undressing" },
  { label: "ใช้มือ (Handjob)", value: "handjob" },
  { label: "ใช้ปาก (Blowjob)", value: "blowjob / oral" },
  { label: "เสียบหี (Vaginal)", value: "vaginal sex" },
  { label: "เสียบตูด (Anal)", value: "anal sex" },
  { label: "เปลี่ยนท่า", value: "position changes (missionary, cowgirl, doggy, etc.)" },
  { label: "แตกที่ไหน", value: "where/how the finish happens" },
];
const TONES = ["Seductive", "Sweet & caring", "Bossy / strict", "Playful", "Mysterious", "Encouraging"];
// words ≈ spoken minutes × ~120 wpm (JOI has pauses and countdowns)
const BILLING_URL = "https://console.anthropic.com/settings/billing";
const USAGE_URL = "https://console.anthropic.com/usage";

// Rough expectations for the progress bar: ~6 chars/word + metadata, ~70 output tokens/s, ~20s thinking
const expectedChars = (words) => words * 6 + 1500;
const estimateSeconds = (words) => Math.round(20 + (words * 1.4 + 500) / 70);
const fmtTime = (s) => (s >= 60 ? `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วิ` : `${Math.max(0, Math.round(s))} วิ`);

const EMPTY = { text: "", styles: [], games: [], directions: false, acts: [], tone: TONES[0], persona: "", intensity: 3, length: LENGTHS[1].value, extra: "" };

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

  // ---- translations of the English script: { [lang]: text } ----
  const [translations, setTranslations] = useState({});
  const [view, setView] = useState("en"); // "en" or a language name from TRANSLATE_LANGS
  const [tLang, setTLang] = useState(TRANSLATE_LANGS[0]);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    const d = loadJSON("draft", null);
    if (d) {
      setForm({ ...EMPTY, ...d.form });
      setOut(d.out ?? "");
      setSavedOut(d.out ?? "");
      setMeta(d.meta ?? null);
      setCurrentId(d.currentId ?? null);
      setTranslations(d.translations ?? {});
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
    const ok = saveJSON("draft", { form, out, meta, currentId, translations });
    setStorageWarn(ok ? "" : "บันทึกร่างในเครื่องไม่สำเร็จ (พื้นที่เต็ม)");
  }, [form, out, meta, currentId, translations, loaded]);

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
      setTranslations(entry.translations ?? {});
      setView("en");
      setErr("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setCloudErr(e.message);
    }
  }
  async function translate() {
    const lang = tLang;
    setTranslating(true);
    setErr("");
    setView(lang);
    setTranslations((t) => ({ ...t, [lang]: "" }));
    let text = "";
    try {
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: out, lang }),
      });
      if (r.status === 401) return (window.location.href = "/login");
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
          if (ev.type === "delta") {
            text += ev.text;
            setTranslations((t) => ({ ...t, [lang]: text }));
          } else if (ev.type === "error") throw new Error(ev.error);
          else if (ev.type === "done") {
            setLastUsage(ev.usage);
            addSpend(ev.usage.cost);
            if (currentId) {
              api("PATCH", { id: currentId, translation: { lang, text } }).catch((e) =>
                setCloudErr("บันทึกคำแปลขึ้นคลาวด์ไม่สำเร็จ: " + e.message)
              );
            }
            alertDone(true, "แปลเสร็จแล้ว 🌐", lang);
          }
        }
      }
    } catch (e) {
      setErr("แปลไม่สำเร็จ: " + e.message);
      alertDone(false, "แปลไม่สำเร็จ", e.message);
      if (!text) {
        setTranslations((t) => { const n = { ...t }; delete n[lang]; return n; });
        setView("en");
      }
    } finally {
      setTranslating(false);
    }
  }

  // start a fresh script but keep the current settings; the old one stays in history
  function newScript() {
    setOut("");
    setSavedOut("");
    setMeta(null);
    setCurrentId(null);
    setTranslations({});
    setView("en");
    setErr("");
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

  // ---- finish alerts: chime + background-tab notification + tab title ----
  const [sound, setSound] = useState(true);
  useEffect(() => setSound(loadJSON("sound", true)), []);
  function toggleSound() {
    const next = !sound;
    setSound(next);
    saveJSON("sound", next);
    if (next) {
      playChime(true); // preview, and unlocks audio on browsers that need a user gesture
      if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
    }
  }
  function alertDone(ok, title, body) {
    if (!sound) return;
    playChime(ok);
    notify(title, body);
    if (document.visibilityState !== "visible") {
      const orig = "JOI Script Studio";
      document.title = (ok ? "✅ " : "⚠️ ") + title;
      const back = () => { document.title = orig; document.removeEventListener("visibilitychange", back); };
      document.addEventListener("visibilitychange", back);
    }
  }

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
            setTranslations({});
            setView("en");
            setLastUsage(ev.usage);
            addSpend(ev.usage.cost);
            addHistory(ev.result, form, ev.usage);
            alertDone(true, "สร้างบทเสร็จแล้ว ✨", ev.result.title);
          }
        }
      }
    } catch (e) {
      setErr(e.message);
      alertDone(false, "สร้างบทไม่สำเร็จ", e.message);
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

  const shown = view === "en" ? out : translations[view] ?? "";
  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([shown], { type: "text/plain" }));
    a.download = view === "en" ? "joi-script.txt" : `joi-script-${view}.txt`;
    a.click();
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <h1>JOI Script Studio</h1>
        <nav>
          <Link href="/" className="active">✍️ สร้างบท</Link>
          <Link href="/history">📚 ประวัติ</Link>
          <button type="button" className="sound-btn" onClick={toggleSound}
            title={sound ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"}>
            {sound ? "🔔" : "🔕"}
          </button>
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
          <label className="check directions-toggle">
            <input type="checkbox" checked={form.directions}
              onChange={(e) => setForm((f) => ({ ...f, directions: e.target.checked }))} />
            🎬 ใส่คำบรรยายฉากเซ็กส์ในเรื่อง (ตัวละครทำอะไรกับผู้ชม เอาเข้า/ออกตอนไหน)
          </label>
          {form.directions && (
            <>
              <small className="muted">เลือกสิ่งที่จะให้บรรยาย (ไม่เลือก = ให้ AI เลือกตามแนว)</small>
              <div className="tags">
                {ACTS.map((a) => (
                  <button key={a.value} type="button" className={"tag" + (form.acts.includes(a.value) ? " on" : "")}
                    onClick={() => toggle(a.value, "acts")}>
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
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
            <button onClick={generate} disabled={loading || translating || !form.text.trim()}>
              {loading ? "กำลังเขียนบท..." : out ? "🔄 สร้างบทใหม่ (ตั้งค่าเดิม)" : "✨ สร้างบท"}
            </button>
            <button className="ghost" disabled={loading} title="เริ่มบทใหม่ เก็บการตั้งค่าไว้ (บทเดิมยังอยู่ในประวัติ)"
              onClick={newScript}>＋ บทใหม่</button>
            <button className="ghost" disabled={loading} title="ล้างทุกช่องรวมการตั้งค่า"
              onClick={() => { newScript(); setForm(EMPTY); setCustom(""); }}>ล้างทั้งหมด</button>
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
          <div className="view-tabs">
            <button className={view === "en" ? "on" : ""} onClick={() => setView("en")}>English (แก้ไขได้)</button>
            {Object.keys(translations).map((l) => (
              <button key={l} className={view === l ? "on" : ""} onClick={() => setView(l)}>
                🌐 {l}{translating && tLang === l ? " …" : ""}
              </button>
            ))}
          </div>
          {view === "en" ? (
            <textarea className="out" value={out} onChange={(e) => setOut(e.target.value)} placeholder="ผลลัพธ์จะแสดงที่นี่" />
          ) : (
            <textarea className="out translated" value={translations[view] ?? ""} readOnly
              placeholder="กำลังแปล..." />
          )}
          <div className="actions">
            <button className="ghost" disabled={!shown}
              onClick={() => navigator.clipboard.writeText(shown)}>📋 คัดลอก</button>
            <button className="ghost" onClick={download} disabled={!shown}>⬇ ดาวน์โหลด .txt</button>
          </div>
          <div className="translate-bar">
            <select value={tLang} onChange={(e) => setTLang(e.target.value)} disabled={translating}>
              {TRANSLATE_LANGS.map((l) => <option key={l}>{l}</option>)}
            </select>
            <button onClick={translate} disabled={!out || translating || loading}>
              {translating ? "กำลังแปล..." : translations[tLang] ? "🌐 แปลใหม่" : "🌐 แปลบทนี้"}
            </button>
          </div>
          {view !== "en" && (
            <small className="muted">คำแปลไว้อ่านทำความเข้าใจ — ถ้าแก้บทภาษาอังกฤษ ให้กด “แปลใหม่” เพื่ออัปเดต</small>
          )}
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

          {meta.equipment?.length > 0 && (
            <>
              <label>🧴 อุปกรณ์ที่ควรเตรียม</label>
              <div className="sfx">
                {meta.equipment.map((q) => (
                  <div key={q.item} className="sfx-item">
                    <b>{q.item}</b>
                    <span>ใช้ทำอะไร: {q.why}</span>
                    <span>ใช้ตอน: {q.when}</span>
                  </div>
                ))}
              </div>
              <div className="actions">
                <button className="ghost"
                  onClick={() => navigator.clipboard.writeText(meta.equipment.map((q) => `- ${q.item}: ${q.why}`).join("\n"))}>
                  📋 คัดลอกรายการอุปกรณ์
                </button>
              </div>
            </>
          )}

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
