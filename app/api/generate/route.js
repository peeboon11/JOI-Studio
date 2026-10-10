import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Hobby max; 30-60 min scripts may need Pro (raise to 800)

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `You are a professional script writer for adult JOI (jerk-off instruction) videos made by and for consenting adults.
The user gives you a draft or idea in ANY language. Your job:
1. Understand the meaning, then write the final script in natural, fluent ENGLISH (never just a literal translation).
2. Apply the requested style, tone, persona, intensity and length.
3. Format as a performable script: short spoken lines, with [stage directions / pace cues / countdowns] in square brackets where useful.
Hard rules: all characters are adults (18+); no minors or age-play implying minors, no non-consent, no incest, no real identifiable people. If the input asks for that, rewrite it into a compliant adult version and add a one-line note.
Put the script (plus the optional note) in "script". Also fill in:
- "title": a catchy English clip title; "alt_titles": 3 more options.
- "genres": the main genres/themes of this clip.
- "tags": 10-20 short search tags suitable for adult video sites (lowercase).
- "sound_effects": background music / SFX that would fit, each with when to use it in the script and English search keywords to find it in a sound library.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "alt_titles", "genres", "tags", "sound_effects", "script"],
  properties: {
    title: { type: "string" },
    alt_titles: { type: "array", items: { type: "string" } },
    genres: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    sound_effects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "when", "search_keywords"],
        properties: {
          name: { type: "string" },
          when: { type: "string" },
          search_keywords: { type: "string" },
        },
      },
    },
    script: { type: "string" },
  },
};

// USD per 1M tokens [input, output]; fallbacks may answer with another model
const PRICES = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-fable-5-1": [10, 50],
};

export async function POST(req) {
  const { text, styles, games, tone, persona, intensity, length, targetWords, extra } = await req.json();
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ในไฟล์ .env.local (แก้แล้วต้องรีสตาร์ท npm run dev)" },
      { status: 500 }
    );
  }
  if (!text?.trim()) return Response.json({ error: "กรุณาใส่ข้อความ" }, { status: 400 });

  const prompt = `Draft / idea (any language):
"""
${text}
"""

Settings:
- Styles / themes (blend ALL of these together): ${styles?.length ? styles.join(", ") : "default"}
- Games / instruction mechanics (include ALL, with clear spoken cues): ${games?.length ? games.join("; ") : "none"}
- Tone:${tone || "default"}
- Speaker persona: ${persona || "default"}
- Intensity (1-5): ${intensity || 3}
- Target length: ${length || "medium (~2-3 minutes spoken)"}${targetWords ? ` — the script MUST be about ${targetWords} words. For long scripts, structure it in clearly labelled sections/phases with a build-up, multiple rounds and a finale; do not stop early or summarize.` : ""}
- Extra instructions: ${extra || "none"}`;

  // Stream NDJSON lines to the browser: {type:"progress"|"done"|"error", ...}
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const stream = client.beta.messages.stream({
          model: "claude-opus-5-5",
          max_tokens: 64000,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          messages: [{ role: "user", content: prompt }],
        });

        let chars = 0;
        let last = 0;
        stream.on("text", (delta) => {
          chars += delta.length;
          const now = Date.now();
          if (now - last > 250) {
            last = now;
            send({ type: "progress", chars });
          }
        });

        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") {
          send({ type: "error", error: "โมเดลปฏิเสธคำขอนี้ ลองปรับเนื้อหาใหม่" });
        } else if (msg.stop_reason === "max_tokens") {
          send({ type: "error", error: "บทยาวเกินขีดจำกัด ลองลดความยาวลง" });
        } else {
          const raw = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
          const [pin, pout] = PRICES[msg.model] ?? PRICES["claude-opus-5-5"];
          const { input_tokens, output_tokens } = msg.usage;
          const cost = (input_tokens * pin + output_tokens * pout) / 1e6;
          send({ type: "done", result: JSON.parse(raw), usage: { model: msg.model, input_tokens, output_tokens, cost } });
        }
      } catch (err) {
        console.error(err);
        send({ type: "error", error: err.message || "เกิดข้อผิดพลาด" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
