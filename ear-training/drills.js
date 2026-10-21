const DR = {
  intervals: { title: 'Intervals', hint: 'Hear two notes, name the distance.', q: 'What interval did you hear?', items: [
    { id: 'm2', l: 'Minor 2nd', o: [0, 1] }, { id: 'M2', l: 'Major 2nd', o: [0, 2] }, { id: 'm3', l: 'Minor 3rd', o: [0, 3], b: 1 }, { id: 'M3', l: 'Major 3rd', o: [0, 4], b: 1 },
    { id: 'P4', l: 'Perfect 4th', o: [0, 5], b: 1 }, { id: 'TT', l: 'Tritone', o: [0, 6] }, { id: 'P5', l: 'Perfect 5th', o: [0, 7], b: 1 }, { id: 'm6', l: 'Minor 6th', o: [0, 8] },
    { id: 'M6', l: 'Major 6th', o: [0, 9] }, { id: 'm7', l: 'Minor 7th', o: [0, 10] }, { id: 'M7', l: 'Major 7th', o: [0, 11] }, { id: 'P8', l: 'Octave', o: [0, 12], b: 1 }] },
  chords: { title: 'Chords', hint: 'Hear an arpeggio, then the chord. Name the quality.', q: 'What chord quality is this?', items: [
    { id: 'maj', l: 'Major', o: [0, 4, 7], b: 1 }, { id: 'min', l: 'Minor', o: [0, 3, 7], b: 1 }, { id: 'dim', l: 'Diminished', o: [0, 3, 6], b: 1 }, { id: 'aug', l: 'Augmented', o: [0, 4, 8], b: 1 },
    { id: 'dom7', l: 'Dominant 7th', o: [0, 4, 7, 10] }, { id: 'maj7', l: 'Major 7th', o: [0, 4, 7, 11] }, { id: 'min7', l: 'Minor 7th', o: [0, 3, 7, 10] }, { id: 'hdim', l: 'Half-diminished', o: [0, 3, 6, 10] }] },
  scales: { title: 'Scales and modes', hint: 'Hear a scale going up. Name the mode.', q: 'Which scale is this?', items: [
    { id: 'ion', l: 'Major', o: [0, 2, 4, 5, 7, 9, 11, 12], b: 1 }, { id: 'aeo', l: 'Natural minor', o: [0, 2, 3, 5, 7, 8, 10, 12], b: 1 },
    { id: 'dor', l: 'Dorian', o: [0, 2, 3, 5, 7, 9, 10, 12], b: 1 }, { id: 'mix', l: 'Mixolydian', o: [0, 2, 4, 5, 7, 9, 10, 12], b: 1 },
    { id: 'lyd', l: 'Lydian', o: [0, 2, 4, 6, 7, 9, 11, 12] }, { id: 'phr', l: 'Phrygian', o: [0, 1, 3, 5, 7, 8, 10, 12] },
    { id: 'hm', l: 'Harmonic minor', o: [0, 2, 3, 5, 7, 8, 11, 12] }, { id: 'mm', l: 'Melodic minor', o: [0, 2, 3, 5, 7, 9, 11, 12] }] }
};

const pool = (d, level) => DR[d].items.filter(i => level === 'all' || i.b);

// Items you miss more often are asked more often; unseen items get a middling weight.
function choose(d, level, ST) {
  const p = pool(d, level), w = p.map(i => { const s = ST[d + ':' + i.id]; return s && s.n ? 1 + 4 * (s.n - s.c) / s.n : 2; });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let k = 0; k < p.length; k++) { r -= w[k]; if (r <= 0) return p[k]; }
  return p[p.length - 1];
}

// Builds one question with every note inside the instrument's written range.
function make(d, inst, S, ST) {
  const it = choose(d, S.level, ST); let off = it.o.slice();
  if (d === 'intervals') { const dir = S.dir === 'mixed' ? (Math.random() < .5 ? 'up' : 'down') : S.dir; if (dir === 'down') off = off.map(x => -x); }
  const lo = Math.min(...off), hi = Math.max(...off), min = inst.lo - lo, max = inst.hi - hi;
  const root = min + Math.floor(Math.random() * (max - min + 1)), notes = off.map(x => root + x);
  let ev;
  if (d === 'intervals') ev = notes.map((m, i) => ({ n: [m], t: i * .8, d: .7 }));
  else if (d === 'scales') ev = notes.map((m, i) => ({ n: [m], t: i * .4, d: .42 }));
  else ev = [...notes.map((m, i) => ({ n: [m], t: i * .45, d: .42 })), { n: notes, t: notes.length * .45 + .3, d: 1.6 }];
  return { it, root, ev, done: false, played: false, pick: null };
}
