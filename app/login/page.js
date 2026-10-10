"use client";

import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) {
      window.location.href = "/";
    } else {
      setErr((await r.json()).error);
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>JOI Script Studio</h1>
        <label>รหัสผ่าน</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <button disabled={loading || !password}>{loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}</button>
        {err && <div className="err">{err}</div>}
      </form>
    </div>
  );
}
