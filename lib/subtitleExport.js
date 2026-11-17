// Turns AI captions [{text, track, duration, pause_after, offset}] into timed clips,
// then into .srt (main track) or FCPXML (Text clips on two lanes) for DaVinci Resolve.

const FPS = 24;
const frames = (s) => Math.max(0, Math.round(s * FPS));

// spoken-style text: no em/en dashes (the creator's ".." / "..." / "." are kept on purpose)
const clean = (s) =>
  s.split("\n")
    .map((l) => l.replace(/\s*[—–]+\s*/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n");

// → [{text, track, start, end}] in frames, sorted by start
export function layoutCaptions(captions) {
  const clips = [];
  let cursor = 0;      // frame where the next main caption starts
  let lastMain = 0;    // start frame of the previous main caption
  for (const c of captions) {
    const text = clean(c.text);
    const dur = frames(Math.max(0.8, c.duration));
    if (c.track === "cue") {
      if (text) {
        const start = lastMain + frames(c.offset);
        clips.push({ text, track: "cue", start, end: start + dur });
      }
    } else {
      if (!text) continue;
      clips.push({ text, track: "main", start: cursor, end: cursor + dur });
      lastMain = cursor;
      cursor += dur + frames(c.pause_after);
    }
  }
  return clips.sort((a, b) => a.start - b.start);
}

export const totalSeconds = (clips) => Math.max(0, ...clips.map((c) => c.end)) / FPS;

export function toSrt(clips) {
  const ts = (f) => {
    const ms = Math.round((f / FPS) * 1000);
    const p = (n, w = 2) => String(n).padStart(w, "0");
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return clips
    .filter((c) => c.track === "main")
    .map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`)
    .join("\n");
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const t = (f) => `${f}/${FPS}s`;

// Same look as the creator's own Text clips: Alte Haas Grotesk bold 96,
// white with a teal outline for speech, yellow with an orange outline for cues.
const STYLES = {
  main: 'font="Alte Haas Grotesk" fontSize="96" bold="1" italic="0" alignment="center" lineSpacing="0" fontColor="1 1 1 1" strokeColor="0.0352941 0.368627 0.466667 1" strokeWidth="4"',
  cue: 'font="Alte Haas Grotesk" fontSize="96" bold="1" italic="0" alignment="center" lineSpacing="0" fontColor="1 1 0.572549 1" strokeColor="1 0.666667 0 1" strokeWidth="2"',
};

export function toFcpxml(clips, name = "JOI Subtitles") {
  const total = Math.max(FPS, ...clips.map((c) => c.end));
  const titles = clips
    .map((c, i) => {
      const lane = c.track === "cue" ? 2 : 1;
      return `            <title ref="r2" lane="${lane}" offset="${t(c.start)}" duration="${t(c.end - c.start)}" start="0s" name="${esc(c.text.replace(/\n/g, " ").slice(0, 40))}">
              <text><text-style ref="ts${i}">${esc(c.text)}</text-style></text>
              <text-style-def id="ts${i}"><text-style ${STYLES[c.track]}/></text-style-def>
            </title>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat1080p24" frameDuration="1/24s" width="1920" height="1080"/>
    <effect id="r2" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti"/>
  </resources>
  <library>
    <event name="${esc(name)}">
      <project name="${esc(name)}">
        <sequence format="r1" duration="${t(total)}" tcStart="0s" tcFormat="NDF">
          <spine>
          <gap name="Gap" offset="0s" start="0s" duration="${t(total)}">
${titles}
          </gap>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}
