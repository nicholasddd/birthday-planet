// Background music, composed in code (no audio files needed).
//   waiting — a slow, dreamy night lullaby for the countdown and the opening story
//   planet  — a light, bouncy marimba tune for exploring
//   ending  — a music-box "Happy Birthday" (public domain) for the finale
// Any track can be replaced by a real recording via CONFIG.music.{waiting,planet,ending}.

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

export function createMusic(ctx, files = {}) {
  // ---- mixing: tracks -> music bus -> (dry + soft reverb) -> master -> speakers
  const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const bus = ctx.createGain(); bus.gain.value = 0.32;
  const verb = ctx.createConvolver(), wet = ctx.createGain(); wet.gain.value = 0.35;
  {
    const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ir;
  }
  bus.connect(master); bus.connect(verb); verb.connect(wet); wet.connect(master);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

  // ---- instruments (each note = a couple of oscillators, so it stays light)
  function voice(out, type, freq, t, a, peak, d, filterHz) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    if (filterHz) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz; o.connect(f).connect(g); } else o.connect(g);
    g.connect(out); o.start(t); o.stop(t + a + d + 0.05);
  }
  const pluck = (out, m, t, vol = 0.2, dur = 0.8) => {           // marimba-ish
    voice(out, 'triangle', mtof(m), t, 0.004, vol, dur, 3000);
    voice(out, 'sine', mtof(m) * 4, t, 0.002, vol * 0.18, dur * 0.15);
  };
  const bell = (out, m, t, vol = 0.12, dur = 2.4) => {           // celesta / music box
    voice(out, 'sine', mtof(m), t, 0.003, vol, dur);
    voice(out, 'sine', mtof(m) * 2.76, t, 0.002, vol * 0.22, dur * 0.35);
    voice(out, 'sine', mtof(m) * 5.4, t, 0.001, vol * 0.07, dur * 0.15);
  };
  const bass = (out, m, t, dur = 0.5, vol = 0.22) => voice(out, 'sine', mtof(m), t, 0.01, vol, dur);
  function pad(out, notes, t, dur, vol = 0.03, bright = 900) {   // soft, slow-blooming chord
    for (const m of notes) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = bright;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(1.2, dur * 0.4));
      g.gain.setValueAtTime(vol, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 1.4);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 1.5);
    }
  }
  function shaker(out, t, vol = 0.015) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.08);
  }

  // ---- the three pieces. Each `segment(out, t0, n)` schedules one loop section and returns its length (s).
  const TRACKS = {
    waiting: {   // 60 bpm, Fmaj7 – Em7 – Dm7 – Cmaj7, pads + twinkling celesta
      segment(out, t0, n) {
        const beat = 1, r = rng(97 + n * 13);
        const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
        chords.forEach((ch, k) => {
          const t = t0 + k * 4 * beat;
          pad(out, ch, t, 4 * beat, 0.022, 700);
          bass(out, ch[0] - 12, t, 3.6, 0.09);
          for (let j = 0; j < 5; j++) {
            const when = t + Math.floor(r() * 8) * 0.5 * beat;
            bell(out, ch[Math.floor(r() * ch.length)] + (r() < 0.5 ? 12 : 24), when, 0.05 + r() * 0.05, 3);
          }
        });
        return 16 * beat;
      },
    },
    planet: {   // 104 bpm, F – Dm – Bb – C, bouncy marimba melody, soft bass, pads and a little shaker
      segment(out, t0, n) {
        const beat = 60 / 104;
        const chords = [[53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55]];
        const roots = [41, 38, 34, 36];
        const A = [[0, 72], [0.5, 77], [1, 81], [2, 79], [2.5, 77], [3, 79], [4, 74], [4.5, 77], [5, 81], [6, 79], [7, 77],
          [8, 70], [8.5, 74], [9, 77], [10, 79], [11, 81], [12, 79], [12.5, 77], [13, 76], [14, 77]];
        const B = [[0, 81], [0.5, 79], [1, 77], [1.5, 72], [2, 77], [3, 81], [4, 86], [5, 84], [5.5, 81], [6, 77], [7, 74],
          [8, 82], [8.5, 81], [9, 77], [10, 74], [11, 77], [12, 79], [12.5, 76], [13, 72], [14, 76], [14.5, 79], [15, 84]];
        const mel = n % 4 === 3 ? null : n % 2 ? B : A;   // every 4th pass, a gentler bar with no lead
        chords.forEach((ch, k) => {
          const t = t0 + k * 4 * beat;
          pad(out, ch.map(m => m + 12), t, 4 * beat, 0.012, 1200);
          bass(out, roots[k], t, beat * 0.9); bass(out, roots[k] + 7, t + 1.5 * beat, beat * 0.5, 0.14); bass(out, roots[k], t + 2 * beat, beat * 0.9);
          for (const b of [1, 3]) for (const m of ch) pluck(out, m + 12, t + b * beat, 0.035, 0.4);   // soft comping
          for (let h = 0; h < 4; h++) shaker(out, t + (h + 0.5) * beat);
        });
        if (mel) for (const [b, m] of mel) pluck(out, m, t0 + b * beat, 0.13, 0.9);
        return 16 * beat;
      },
    },
    ending: {   // music-box Happy Birthday (3/4), then a soft arpeggiated interlude, looping
      segment(out, t0, n) {
        const beat = 60 / 84;
        if (n % 2 === 0) {
          const mel = [[67, .75], [67, .25], [69, 1], [67, 1], [72, 1], [71, 2], [67, .75], [67, .25], [69, 1], [67, 1], [74, 1], [72, 2],
            [67, .75], [67, .25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2], [77, .75], [77, .25], [76, 1], [72, 1], [74, 1], [72, 3]];
          let b = 0;
          for (const [m, d] of mel) { bell(out, m + 12, t0 + b * beat, 0.14, 2.2); b += d; }
          const chords = [[0, [48, 52, 55]], [3, [43, 47, 50, 53]], [6, [43, 47, 50, 53]], [9, [48, 52, 55]], [13, [48, 52, 55]], [16, [53, 57, 60]], [19, [48, 52, 55]], [22, [43, 47, 50]], [25, [48, 52, 55]]];
          chords.forEach(([cb, ch], k) => {
            const len = ((chords[k + 1]?.[0] ?? 28) - cb) * beat;
            pad(out, ch.map(m => m + 12), t0 + cb * beat, len, 0.018, 900);
            bass(out, ch[0] - 12, t0 + cb * beat, len * 0.9, 0.1);
          });
          return 28 * beat;
        }
        const prog = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];   // C – Am – F – G, gently arpeggiated
        prog.forEach((ch, k) => {
          const t = t0 + k * 3 * beat;
          pad(out, ch.map(m => m + 12), t, 3 * beat, 0.016, 800);
          bass(out, ch[0] - 12, t, 3 * beat * 0.9, 0.09);
          [0, 1, 2, 1, 2, 0].forEach((ix, j) => bell(out, ch[ix] + 24, t + j * 0.5 * beat, 0.07, 1.8));
        });
        return 12 * beat;
      },
    },
  };

  // ---- playback: a small look-ahead scheduler + crossfades between tracks
  let current = null;
  function stopCurrent(fade = 2.5) {
    if (!current) return;
    const c = current; current = null;
    clearInterval(c.timer);
    c.gain.gain.cancelScheduledValues(ctx.currentTime);
    c.gain.gain.setValueAtTime(c.gain.gain.value, ctx.currentTime);
    c.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    setTimeout(() => { c.gain.disconnect(); c.audio?.pause(); }, fade * 1000 + 3000);
  }
  function play(name, fade = 2.5) {
    if (current?.name === name) return;
    stopCurrent(fade);
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(bus);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fade);
    const c = { name, gain, next: ctx.currentTime + 0.15, n: 0 };
    if (files[name]) {   // a real recording was supplied: just loop it
      const audio = new Audio(files[name]); audio.loop = true; audio.crossOrigin = 'anonymous';
      ctx.createMediaElementSource(audio).connect(gain);
      audio.play().catch(() => {});
      c.audio = audio;
    } else {
      const tick = () => { while (c.next < ctx.currentTime + 1.2) { c.next += TRACKS[name].segment(gain, c.next, c.n++); } };
      tick(); c.timer = setInterval(tick, 250);
    }
    current = c;
  }
  return {
    play, stop: stopCurrent,
    setMuted(m) { master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.15); },
    get track() { return current?.name; },
  };
}
