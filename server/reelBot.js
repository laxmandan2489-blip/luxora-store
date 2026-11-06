/*
 * REEL BOT ENGINE (2026-11-06) - used by autopilotDaily.js
 * ------------------------------------------------------------------
 *  1. SONG SUNNA (analyzeSong): the server "listens" to a song once
 *     (no AI, just numbers): its speed (BPM / beat), and the parts where the
 *     song is fullest (chorus). Every reel starts the song at one of those
 *     parts, taking turns - so the same song sounds different each time and
 *     never starts with a quiet intro.
 *  2. BEAT PAR CUT: each photo stays a whole number of beats, so the photo
 *     changes land on the music.
 *  3. HALKI MOVEMENT: each photo slowly slides (left / right / up / down),
 *     so the reel is never a dead slideshow. Cheap on the free Render
 *     server (a crop, not a zoom).
 * Everything here is plain ffmpeg + JavaScript; nothing is uploaded anywhere.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const sharp = require("sharp");

const RATE = 11025; // analysis sample rate
const HOP = 256; // ~23 ms
const HOP_SEC = HOP / RATE;

function run(ffmpegPath, args, { maxBuffer = 8 * 1024 * 1024, encoding = "utf8", timeout = 9 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg nahi mila (npm install chalao)"));
    execFile(ffmpegPath, args, { maxBuffer, encoding, timeout }, (error, stdout, stderr) => {
      if (error) reject(new Error(`ffmpeg: ${String(stderr || error.message).slice(-300)}`));
      else resolve(stdout);
    });
  });
}

/* ---------------- 1. song analysis ---------------- */
async function decodeMono(ffmpegPath, file, maxSeconds = 420) {
  const raw = await run(ffmpegPath, ["-v", "error", "-i", file, "-t", String(maxSeconds), "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], {
    maxBuffer: maxSeconds * RATE * 2 + 1024 * 1024,
    encoding: "buffer",
    timeout: 3 * 60 * 1000,
  });
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  return samples;
}

function analyzePcm(samples) {
  const frames = Math.floor(samples.length / HOP);
  const dur = samples.length / RATE;
  if (frames < 200) return { dur, bpm: 0, beat: 0, phase: 0, starts: [0], peak60: 0 };
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * HOP;
    for (let i = 0; i < HOP; i++) {
      const v = samples[base + i] / 32768;
      sum += v * v;
    }
    rms[f] = Math.sqrt(sum / HOP);
  }
  // onset strength = rise in log energy
  const onset = new Float32Array(frames);
  let prev = Math.log(1e-4 + rms[0]);
  for (let f = 1; f < frames; f++) {
    const cur = Math.log(1e-4 + rms[f]);
    onset[f] = Math.max(0, cur - prev);
    prev = cur;
  }
  // tempo: autocorrelation of the onset curve (first 90 s), 70-180 BPM,
  // gently preferring 90-130 (calm-classy reels)
  const n = Math.min(frames, Math.round(90 / HOP_SEC));
  let mean = 0;
  for (let i = 0; i < n; i++) mean += onset[i];
  mean /= n;
  const minLag = Math.round(60 / 180 / HOP_SEC);
  const maxLag = Math.round(60 / 70 / HOP_SEC);
  let bestLag = 0;
  let bestScore = -Infinity;
  const acf = {};
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < n; i++) acc += (onset[i] - mean) * (onset[i + lag] - mean);
    acf[lag] = acc / (n - lag);
    if (lag < minLag || lag > maxLag) continue;
    const bpm = 60 / (lag * HOP_SEC);
    const weight = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 112) / 0.6, 2));
    const score = acf[lag] * (0.6 + 0.4 * weight);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  // fine tempo: parabola through the peak and its neighbours
  const a0 = acf[bestLag - 1];
  const a1 = acf[bestLag];
  const a2 = acf[bestLag + 1];
  const bend = a0 - 2 * a1 + a2;
  const exactLag = bend < 0 ? bestLag + Math.max(-0.5, Math.min(0.5, (0.5 * (a0 - a2)) / bend)) : bestLag;
  // beat phase: which offset inside one beat collects the most onsets
  let phaseIdx = 0;
  let phaseBest = -1;
  for (let p = 0; p < bestLag; p++) {
    let acc = 0;
    for (let i = p; i < n; i += bestLag) acc += onset[i];
    if (acc > phaseBest) {
      phaseBest = acc;
      phaseIdx = p;
    }
  }
  const beat = exactLag * HOP_SEC;
  // strongest hit near a time (so a start lands exactly on a beat)
  const snap = (t) => {
    const c = Math.round(t / HOP_SEC);
    const r = Math.round(bestLag / 2);
    let best = c;
    for (let f = Math.max(1, c - r); f <= Math.min(frames - 1, c + r); f++) if (onset[f] > onset[best]) best = f;
    return best * HOP_SEC;
  };
  const phase = snap(phaseIdx * HOP_SEC) % beat;
  // fullest parts: 20 s windows with the highest average energy, on the beat
  // grid, at least 12 s apart, not in the last 4 s (fade out)
  const prefix = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f++) prefix[f + 1] = prefix[f] + rms[f];
  const windowFor = (sec) => Math.max(1, Math.min(frames, Math.round(sec / HOP_SEC)));
  const scoreAt = (startFrame, len) => (prefix[Math.min(frames, startFrame + len)] - prefix[startFrame]) / len;
  const candidates = [];
  const w20 = windowFor(Math.min(20, Math.max(6, dur - 4)));
  for (let t = phase; t + w20 * HOP_SEC <= dur - 2; t += beat * 2) {
    const f = Math.round(t / HOP_SEC);
    candidates.push({ t, score: scoreAt(f, w20) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const starts = [];
  for (const c of candidates) {
    if (starts.length >= 3) break;
    const t = snap(c.t);
    if (starts.every((s) => Math.abs(s - t) >= 12)) starts.push(Number(t.toFixed(3)));
  }
  if (!starts.length) starts.push(Number(phase.toFixed(3)));
  // best 60 s part (to keep when the song is made small)
  let peak60 = 0;
  if (dur > 70) {
    const w60 = windowFor(60);
    let best = -1;
    for (let t = phase; t + 60 <= dur - 1; t += beat * 4) {
      const s = scoreAt(Math.round(t / HOP_SEC), w60);
      if (s > best) {
        best = s;
        peak60 = t;
      }
    }
    // start a little before the full part so it builds in
    peak60 = Math.max(0, snap(Math.max(0, peak60 - beat * 8)));
  }
  return { dur: Number(dur.toFixed(2)), bpm: Math.round(60 / beat), beat: Number(beat.toFixed(4)), phase: Number(phase.toFixed(3)), starts, peak60: Number(peak60.toFixed(2)) };
}

async function analyzeSong(ffmpegPath, buffer, ext = "mp3") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beat-"));
  try {
    const file = path.join(dir, `in.${ext || "mp3"}`);
    fs.writeFileSync(file, buffer);
    const samples = await decodeMono(ffmpegPath, file);
    return analyzePcm(samples);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ---------------- 2. beat timing ---------------- */
// photo time -> whole number of beats (slow songs: 1 beat units, fast: 2)
function onBeat(seconds, beat) {
  if (!beat || beat <= 0) return seconds;
  const unit = beat < 0.42 ? beat * 2 : beat;
  return Math.max(unit, Math.round(seconds / unit) * unit);
}

/* ---------------- 3. render with movement ---------------- */
// (2026-11-07) 720x1280 output - free Render server was getting stuck on 1080p
const W = 720;
const H = 1280;
const PAD = 1.07; // photo is 7% bigger, the frame slides over it
const MOTIONS = ["left", "right", "up", "down"];

function motionExpr(motion, D) {
  const p = `min(t/${D.toFixed(2)}\\,1)`;
  const cx = `(iw-${W})/2`;
  const cy = `(ih-${H})/2`;
  if (motion === "left") return { x: `(iw-${W})*${p}`, y: cy };
  if (motion === "right") return { x: `(iw-${W})*(1-${p})`, y: cy };
  if (motion === "up") return { x: cx, y: `(ih-${H})*(1-${p})` };
  if (motion === "down") return { x: cx, y: `(ih-${H})*${p}` };
  return { x: cx, y: cy };
}

/*
 * frames: [{ image (1080x1920 jpeg), seconds, motion?: "left"|"right"|"up"|"down"|"none" }]
 * music:  { buffer, start } or null
 * transitions: list of ffmpeg xfade names (taken in turn)
 */
async function renderVideo(ffmpegPath, frames, music, { transitions = ["fade"], fade = 0.35, crf = 21 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel2-"));
  try {
    const args = ["-y", "-loglevel", "error"];
    const BW = Math.round((W * PAD) / 2) * 2;
    const BH = Math.round((H * PAD) / 2) * 2;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const file = path.join(dir, `f${i}.jpg`);
      const motion = frame.motion || MOTIONS[i % MOTIONS.length];
      const big = await sharp(frame.image).resize(motion === "none" ? W : BW, motion === "none" ? H : BH, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
      fs.writeFileSync(file, big);
      args.push("-loop", "1", "-framerate", "30", "-t", (frame.seconds + fade).toFixed(3), "-i", file);
    }
    const total = frames.reduce((sum, f) => sum + f.seconds, 0) + fade;
    const audioIndex = frames.length;
    if (music && music.buffer) {
      const musicFile = path.join(dir, "music");
      fs.writeFileSync(musicFile, music.buffer);
      args.push("-stream_loop", "-1", "-i", musicFile);
    } else {
      args.push("-f", "lavfi", "-t", total.toFixed(3), "-i", "anullsrc=r=44100:cl=stereo");
    }
    const parts = frames.map((f, i) => {
      const motion = f.motion || MOTIONS[i % MOTIONS.length];
      if (motion === "none") return `[${i}:v]scale=${W}:${H},setsar=1,fps=30,format=yuv420p[v${i}]`;
      const { x, y } = motionExpr(motion, f.seconds + fade);
      return `[${i}:v]crop=${W}:${H}:x='${x}':y='${y}',setsar=1,fps=30,format=yuv420p[v${i}]`;
    });
    let last = "v0";
    let offset = 0;
    for (let i = 1; i < frames.length; i++) {
      offset += frames[i - 1].seconds;
      const out = i === frames.length - 1 ? "vout" : `x${i}`;
      const name = frames[i].transition || transitions[(i - 1) % transitions.length];
      parts.push(`[${last}][v${i}]xfade=transition=${name}:duration=${fade}:offset=${offset.toFixed(3)}[${out}]`);
      last = out;
    }
    if (frames.length === 1) parts.push("[v0]null[vout]");
    const start = music && music.buffer ? Math.max(0, Number(music.start) || 0) : 0;
    parts.push(
      `[${audioIndex}:a]atrim=start=${start.toFixed(3)}:duration=${total.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st=${Math.max(0, total - 1.4).toFixed(2)}:d=1.4,volume=0.9[aout]`
    );
    const outFile = path.join(dir, "reel.mp4");
    args.push(
      "-filter_complex", parts.join(";"),
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "superfast", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
      "-t", total.toFixed(3), "-movflags", "+faststart", "-threads", "1",
      outFile
    );
    await run(ffmpegPath, args, { timeout: 6 * 60 * 1000 });
    return { video: fs.readFileSync(outFile), seconds: total };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/*
 * Song on a ready video (Admin > Reel Maker): the phone makes the silent
 * video, the server only lays the song under it. The picture is copied as
 * it is (no re-encode), so this takes a few seconds even on free Render.
 */
async function addSongToVideo(ffmpegPath, videoBuffer, music) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mux-"));
  try {
    const inFile = path.join(dir, "in.mp4");
    const musicFile = path.join(dir, "music");
    const outFile = path.join(dir, "out.mp4");
    fs.writeFileSync(inFile, videoBuffer);
    fs.writeFileSync(musicFile, music.buffer);
    // video length from ffmpeg's own report
    const info = await new Promise((resolve) => {
      execFile(ffmpegPath, ["-i", inFile], (error, stdout, stderr) => resolve(String(stderr || "")));
    });
    const m = info.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 15;
    const start = Math.max(0, Number(music.start) || 0);
    const copyOk = /Video:\s*h264/i.test(info);
    await run(ffmpegPath, [
      "-y", "-loglevel", "error",
      "-i", inFile,
      "-stream_loop", "-1", "-i", musicFile,
      "-filter_complex", `[1:a]atrim=start=${start.toFixed(3)}:duration=${seconds.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st=${Math.max(0, seconds - 1.4).toFixed(2)}:d=1.4,volume=0.9[aout]`,
      "-map", "0:v:0", "-map", "[aout]",
      ...(copyOk ? ["-c:v", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-threads", "1"]),
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
      "-t", seconds.toFixed(3), "-movflags", "+faststart",
      outFile,
    ]);
    // first frame as the cover photo
    const coverFile = path.join(dir, "cover.jpg");
    await run(ffmpegPath, ["-y", "-loglevel", "error", "-ss", "0.6", "-i", outFile, "-frames:v", "1", "-q:v", "3", coverFile]).catch(() => null);
    return { video: fs.readFileSync(outFile), cover: fs.existsSync(coverFile) ? fs.readFileSync(coverFile) : null, seconds };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { analyzeSong, analyzePcm, onBeat, renderVideo, addSongToVideo, MOTIONS };
