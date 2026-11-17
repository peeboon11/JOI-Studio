import Anthropic from "@anthropic-ai/sdk";
import { usageCost } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 300;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `You turn adult JOI (jerk-off instruction) video scripts, written for consenting adults, into a timed subtitle track for video editing.
Split the SPOKEN lines into short on-screen captions, in the original order and the original language, without rewriting, softening or censoring the wording.
Rules:
- Each caption: 1-2 short lines, max ~42 characters per line (join two lines with "\\n"); split long sentences at natural pauses.
- Do not put [stage directions], [ACTION: ...], [PREP: ...], section labels or notes into caption text — but use them for timing: give that caption a "pause_after" in seconds for pauses, holds, edging stops, and so on.
- Countdowns and stroke counts: ALWAYS write the numbers as digits ("10", "9", "8" — never "ten", "nine", "eight"), converting spelled-out numbers in any language (e.g. Thai "สิบ" → "10"). One caption per number, e.g. "10", "9", ... "1", each ~1 s (duration ~0.8, pause_after ~0.2) unless the script sets another pace; keep the surrounding words in their own captions.
- Write captions the way people normally see spoken subtitles: no period at the end of a caption, no ellipsis ("..."), and no em/en dashes ("—", "–") anywhere — split the caption there or use a comma instead. Keep "?" and "!".
- "duration": how long the caption stays on screen, at a calm, sensual speaking pace (~2.3 words per second for English; similar natural pace for other languages), minimum 0.8 s.
- "pause_after": silent gap before the next caption (0 when there is none).`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["captions"],
  properties: {
    captions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "duration", "pause_after"],
        properties: {
          text: { type: "string" },
          duration: { type: "number" },
          pause_after: { type: "number" },
        },
      },
    },
  },
};

// POST {text} → NDJSON stream: {type:"progress", chars} … {type:"done", captions, usage} | {type:"error", error}
export async function POST(req) {
  const { text } = await req.json();
  if (!text?.trim()) return Response.json({ error: "ยังไม่มีบทให้ทำซับ" }, { status: 400 });

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const stream = client.beta.messages.stream({
          model: "claude-sonnet-5-5",
          max_tokens: 64000,
          thinking: { type: "adaptive" },
          output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          messages: [{ role: "user", content: `<script>\n${text}\n</script>` }],
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
        if (msg.stop_reason === "refusal") send({ type: "error", error: "โมเดลปฏิเสธคำขอนี้" });
        else if (msg.stop_reason === "max_tokens") send({ type: "error", error: "บทยาวเกินขีดจำกัด" });
        else {
          const raw = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
          send({ type: "done", ...JSON.parse(raw), usage: usageCost(msg) });
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
