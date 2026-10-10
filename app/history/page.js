"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LENGTHS, historyApi as api } from "@/lib/shared";

const PAGE_SIZE = 10;

export default function History() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const data = await api("GET", null, `?page=${p}&size=${PAGE_SIZE}`);
      // the page may have emptied after deletes — step back
      if (!data.items.length && p > 1 && data.total > 0) return load(p - 1);
      setItems(data.items);
      setTotal(data.total);
      setPage(p);
      setSelected(new Set());
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const p = parseInt(new URLSearchParams(window.location.search).get("page")) || 1;
    load(p);
  }, [load]);

  function go(p) {
    window.history.replaceState(null, "", p > 1 ? `?page=${p}` : "/history");
    load(p);
  }

  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  const allOnPage = items.length > 0 && items.every((i) => selected.has(i.id));
  function toggleAll() {
    setSelected(allOnPage ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function remove(ids, label) {
    if (!confirm(`ลบ${label}? (ลบจากทุกเครื่อง กู้คืนไม่ได้)`)) return;
    try {
      await api("DELETE", { ids });
      load(page);
    } catch (e) {
      setErr(e.message);
    }
  }
  async function removeAll() {
    if (!confirm(`ลบประวัติทั้งหมด ${total} บท? (กู้คืนไม่ได้)`)) return;
    if (!confirm("แน่ใจนะ? ลบทั้งหมดจริง ๆ")) return;
    try {
      await api("DELETE", null, "?all=1");
      load(1);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <h1>JOI Script Studio</h1>
        <nav>
          <Link href="/">✍️ สร้างบท</Link>
          <Link href="/history" className="active">📚 ประวัติ</Link>
        </nav>
      </div>

      <div className="card history">
        <div className="history-head">
          <label>☁️ บทที่เคยสร้าง ทั้งหมด {total} บท · เปิดได้ทุกเครื่อง</label>
          <button className="ghost" onClick={() => load(page)} disabled={loading}>
            {loading ? "กำลังโหลด..." : "↻ รีเฟรช"}
          </button>
        </div>

        {items.length > 0 && (
          <div className="bulk-bar">
            <label className="check">
              <input type="checkbox" checked={allOnPage} onChange={toggleAll} /> เลือกทั้งหน้า
            </label>
            <div className="bulk-actions">
              <button className="ghost danger" disabled={!selected.size}
                onClick={() => remove([...selected], `ที่เลือก ${selected.size} บท`)}>
                🗑 ลบที่เลือก ({selected.size})
              </button>
              <button className="ghost danger" onClick={removeAll}>ลบทั้งหมด</button>
            </div>
          </div>
        )}

        {err && <div className="err">{err}</div>}

        {!loading && items.length === 0 ? (
          <div className="muted">ยังไม่มีบท — ไปที่หน้า <Link href="/">สร้างบท</Link> แล้วบทจะถูกเก็บไว้ที่นี่</div>
        ) : (
          <ul className={"history-list" + (loading ? " dim" : "")}>
            {items.map((h, i) => (
              <li key={h.id} className={selected.has(h.id) ? "current" : ""}>
                <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)} />
                <span className="num">{(page - 1) * PAGE_SIZE + i + 1}</span>
                <div className="history-info">
                  <b>{h.title || "(ไม่มีชื่อ)"}</b>
                  <small>
                    {new Date(h.at).toLocaleString("th-TH")} ·{" "}
                    {LENGTHS.find((l) => l.value === h.length)?.label ?? ""} · {(h.words ?? 0).toLocaleString()} คำ
                  </small>
                </div>
                <div className="history-actions">
                  <Link className="btn-link" href={`/?open=${encodeURIComponent(h.id)}`}>เปิด</Link>
                  <button className="ghost" onClick={() => remove([h.id], ` "${h.title}"`)}>ลบ</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <div className="pager">
            <button className="ghost" onClick={() => go(1)} disabled={page === 1 || loading}>«</button>
            <button className="ghost" onClick={() => go(page - 1)} disabled={page === 1 || loading}>‹ ก่อนหน้า</button>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
              .map((p, i, arr) => (
                <span key={p} className="pager-group">
                  {i > 0 && p - arr[i - 1] > 1 && <span className="muted">…</span>}
                  <button className={p === page ? "" : "ghost"} onClick={() => go(p)} disabled={loading}>{p}</button>
                </span>
              ))}
            <button className="ghost" onClick={() => go(page + 1)} disabled={page === pages || loading}>ถัดไป ›</button>
            <button className="ghost" onClick={() => go(pages)} disabled={page === pages || loading}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}
