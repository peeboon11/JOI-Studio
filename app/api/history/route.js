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

// GET ?page=1&size=10 → { items: summaries (newest first), total, page, size }
// GET ?id=<id>        → full entry
export async function GET(req) {
  if (!redis) return notConfigured();
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (id) {
    const entry = await redis.get(key(id));
    return entry ? Response.json(entry) : Response.json({ error: "ไม่พบบทนี้" }, { status: 404 });
  }
  const size = Math.min(Math.max(parseInt(params.get("size")) || 10, 1), 50);
  const page = Math.max(parseInt(params.get("page")) || 1, 1);
  const start = (page - 1) * size;
  const [total, ids] = await Promise.all([
    redis.zcard(INDEX),
    redis.zrange(INDEX, start, start + size - 1, { rev: true }),
  ]);
  const entries = ids.length ? await redis.mget(...ids.map(key)) : [];
  return Response.json({ items: entries.filter(Boolean).map(summary), total, page, size });
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

// PATCH {id, out?, translation?: {lang, text}} → update script text / add a translation
export async function PATCH(req) {
  if (!redis) return notConfigured();
  const { id, out, translation } = await req.json();
  const entry = await redis.get(key(id));
  if (!entry) return Response.json({ error: "ไม่พบบทนี้" }, { status: 404 });
  const next = { ...entry };
  if (out !== undefined) next.out = out;
  if (translation) next.translations = { ...entry.translations, [translation.lang]: translation.text };
  await redis.set(key(id), next);
  return Response.json({ ok: true });
}

// DELETE ?id=<id>        → one entry
// DELETE {ids: [...]}    → several entries
// DELETE ?all=1          → everything
export async function DELETE(req) {
  if (!redis) return notConfigured();
  const params = new URL(req.url).searchParams;
  let ids;
  if (params.get("all") === "1") {
    ids = await redis.zrange(INDEX, 0, -1);
  } else if (params.get("id")) {
    ids = [params.get("id")];
  } else {
    ids = (await req.json().catch(() => ({}))).ids ?? [];
  }
  if (ids.length) {
    await redis.del(...ids.map(key));
    await redis.zrem(INDEX, ...ids);
  }
  return Response.json({ ok: true, deleted: ids.length });
}
