import Anthropic from "@anthropic-ai/sdk";
import { usageCost } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 300;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `You translate adult JOI (jerk-off instruction) video scripts written for consenting adults, so the creator can understand exactly what their English script says.
Translate the whole script into the requested language, line by line, keeping the same structure, line breaks and [stage directions] (translate the text inside brackets too).
Use natural, spoken wording in the target language with the same tone and intensity — do not soften, censor, summarize or add commentary.
Output only the translated script text itself — no quotes, tags, headings or notes around it.`;

// POST {text, lang} → NDJSON stream: {type:"delta", text} … {type:"done", usage} | {type:"error", error}
export async function POST(req) {
  const { text, lang } = await req.json();
  if (!text?.trim()) return Response.json({ error: "ยังไม่มีบทให้แปล" }, { status: 400 });

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const stream = client.beta.messages.stream({
          model: "claude-opus-5-5",
          max_tokens: 64000,
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          messages: [{ role: "user", content: `Target language: ${lang || "Thai"}\n\n<script>\n${text}\n</script>` }],
        });
        stream.on("text", (delta) => send({ type: "delta", text: delta }));

        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") send({ type: "error", error: "โมเดลปฏิเสธการแปลนี้" });
        else send({ type: "done", usage: usageCost(msg) });
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
