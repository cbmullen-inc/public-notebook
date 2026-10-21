let ctx, master;

function voice(m, t, d, v, tn) {
  const f = 440 * 2 ** ((m - 69) / 12), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = tn.q;
  lp.frequency.setValueAtTime(f * tn.cut[0], t);
  lp.frequency.linearRampToValueAtTime(f * tn.cut[1], t + .07);
  lp.frequency.linearRampToValueAtTime(f * tn.cut[2], t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + tn.atk);
  let end = t + d + .05;
  if (tn.pluck) { // struck sound: decays on its own, then is damped when the note ends
    g.gain.setTargetAtTime(.0001, t + tn.atk, tn.pluck); g.gain.setTargetAtTime(0, t + d, .15); end = t + d + 1.2;
  } else { g.gain.setValueAtTime(v, t + d - .12); g.gain.linearRampToValueAtTime(.0001, t + d); }
  lp.connect(g); g.connect(master);
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = tn.vib[0]; lg.gain.value = tn.vib[1]; lfo.connect(lg);
  tn.waves.forEach(([type, detune, level, mult]) => {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = type; o.frequency.value = f * (mult || 1); o.detune.value = detune; og.gain.value = level;
    lg.connect(o.detune); o.connect(og); og.connect(lp); o.start(t); o.stop(end);
  });
  lfo.start(t); lfo.stop(end);
}

function stop() {
  if (ctx && master) {
    const old = master; old.gain.setTargetAtTime(0, ctx.currentTime, .03);
    setTimeout(() => old.disconnect(), 400); master = null;
  }
}

// ev: [{n:[written MIDI notes], t: start seconds, d: duration}]. lift: play an octave up (if the instrument allows).
function play(ev, inst, lift) {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  stop();
  master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
  const t0 = ctx.currentTime + .05, shift = (inst.lift && lift ? 12 : 0) - inst.off;
  ev.forEach(e => e.n.forEach(m => voice(m + shift, t0 + e.t, e.d, e.n.length > 1 ? .28 : .6, inst.tone)));
}
