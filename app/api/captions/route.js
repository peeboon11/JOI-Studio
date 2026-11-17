import Anthropic from "@anthropic-ai/sdk";
import { usageCost } from "@/lib/pricing";
import { STYLE_EXAMPLES } from "@/lib/subtitleStyle";

export const runtime = "nodejs";
export const maxDuration = 300;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `You turn adult JOI (jerk-off instruction) video scripts, written for consenting adults, into timed on-screen captions for video editing, matching the creator's own hand-made caption style.
Keep the original order and language; don't soften or censor. You may trim filler words so captions stay short, but keep the voice.

Two tracks:
- "main": the spoken lines, one after another. "duration" = seconds on screen, "pause_after" = silent gap before the next main caption. Set "offset" to 0.
- "cue": big overlay instructions shown on top of the main captions — speed/action cues taken from [ACTION]/[stage directions] and beat cues, written as 1-3 punchy words (e.g. "Fast", "Slow...", "Slower...", "Hold..", "STOP", "LUBE", "REST", "Rest No touching"), plus an occasional teasing word layered over a line (e.g. "usually", "haha.."). "offset" = seconds after the start of the previous main caption that the cue appears (it does not push the main captions later). A rest/no-touching cue stays up for the whole rest (e.g. 30-75 s) while main captions keep going underneath. Set "pause_after" to 0.
Never put [brackets], [PREP]/[ACTION] labels, section headings or notes into caption text.

The creator's pacing (measured from their real 47-minute video) — follow it closely:
- Very short captions: usually 1-4 words, rarely more than 7; split sentences into phrases. Max ~60 characters.
- Slow and lingering: 1-2 word captions stay ~2-3 s (opening/teasing lines up to 4-7 s), 3-4 words ~4 s, 5-7 words ~4-5.5 s, longer ~6-8 s.
- Gaps between main captions are typically 0.5-2 s; ~2-3 s after a punchline or the end of a beat; 5-7 s between the spoken numbers of big countdowns (30, 25, 20, 15).
- Countdowns: always digits ("10", "9" — never words). One caption per number. Fast countdown: ~2 s each with ~0.5-1 s gaps. Edging/teasing countdown: ~2.6 s each with 3-6 s gaps, and she may restart or repeat numbers ("10", "9", "10", "10", "8"). Slow countdown: ~3.7 s each with ~1 s gaps. Big counts can carry words: "30 Fast. Go!!", "25... keep that pace...".
- Repeat a line for emphasis when it fits ("Don't look at me like that" twice).
- Punctuation like spoken teasing: ".." or "..." for drawn-out/teasing words ("Hehe..", "I don't bite...", "Hold.."), "." for blunt beats ("Come. Now.", "I'll know. I always know"), "!!" for excitement, "?" for questions. Never use em/en dashes.

Examples from the creator's own video (one JSON object per caption, in order):
${STYLE_EXAMPLES.map((e) => JSON.stringify({ offset: 0, pause_after: 0, ...e })).join("\n")}`;

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
        required: ["text", "track", "duration", "pause_after", "offset"],
        properties: {
          text: { type: "string" },
          track: { type: "string", enum: ["main", "cue"] },
          duration: { type: "number" },
          pause_after: { type: "number" },
          offset: { type: "number" },
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
