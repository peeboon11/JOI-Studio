import { Redis } from "@upstash/redis";

// Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash account sets UPSTASH_REDIS_REST_*
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const INDEX = "scripts:index"; // sorted set of ids, score = created time
const key = (id) => `script:${id}`;

const notConfigured = () =>
  Response.json({ error: "ยังไม่ได้ตั้งค่า Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN)" }, { status: 503 });

const summary = (e) => ({
  id: e.id,
  at: e.at,
  title: e.title,
  length: e.form?.length,
  words: e.out ? e.out.split(/\s+/).length : 0,
});

// GET            → list of summaries (newest first)
// GET ?id=<id>   → full entry
export async function GET(req) {
  if (!redis) return notConfigured();
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const entry = await redis.get(key(id));
    return entry ? Response.json(entry) : Response.json({ error: "ไม่พบบทนี้" }, { status: 404 });
  }
  const ids = await redis.zrange(INDEX, 0, -1, { rev: true });
  if (!ids.length) return Response.json([]);
  const entries = await redis.mget(...ids.map(key));
  return Response.json(entries.filter(Boolean).map(summary));
}

// POST {entry} → create or replace
export async function POST(req) {
  if (!redis) return notConfigured();
  const entry = await req.json();
  if (!entry?.id) return Response.json({ error: "missing id" }, { status: 400 });
  await redis.set(key(entry.id), entry);
  await redis.zadd(INDEX, { score: entry.at ?? Date.now(), member: entry.id });
  return Response.json(summary(entry));
}

// PATCH {id, out} → update the script text after edits
export async function PATCH(req) {
  if (!redis) return notConfigured();
  const { id, out } = await req.json();
  const entry = await redis.get(key(id));
  if (!entry) return Response.json({ error: "ไม่พบบทนี้" }, { status: 404 });
  await redis.set(key(id), { ...entry, out });
  return Response.json({ ok: true });
}

// DELETE ?id=<id>
export async function DELETE(req) {
  if (!redis) return notConfigured();
  const id = new URL(req.url).searchParams.get("id");
  await redis.del(key(id));
  await redis.zrem(INDEX, id);
  return Response.json({ ok: true });
}
