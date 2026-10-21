// Everything instrument-specific lives here. To add an instrument, add an entry.
//  lo/hi  written range as MIDI numbers (60 = middle C)
//  off    semitones the instrument sounds BELOW its written pitch (alto sax 9, flute 0)
//  lift   true if a "phone-friendly" octave-up playback option makes sense (low instruments)
//  icon   SVG markup drawn in a 100x120 box with currentColor (shown on the instrument picker)
//  tone   synth recipe: oscillators [type, detune cents, level, optional frequency multiplier], filter Q,
//         filter cutoff multipliers [start, peak, end], attack seconds, vibrato [Hz, cents],
//         optional pluck = decay time constant in seconds (struck/plucked sound that fades by itself)
const NAMES = ['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const nm = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

const INSTRUMENTS = {
  alto: {
    name: 'Alto sax', lo: 58, hi: 90, off: 9, lift: true,
    sub: 'Notes are shown in written pitch for E♭ alto sax.',
    icon: '<path d="M28 14C42 8 48 16 48 30V86C48 104 58 110 70 108C82 106 86 94 84 80"/><path d="M28 14L14 10"/><path d="M77 80L72 62M91 80L96 62"/><ellipse cx="84" cy="60" rx="13" ry="4"/><g fill="currentColor" stroke="none"><circle cx="62" cy="42" r="4"/><circle cx="62" cy="56" r="4"/><circle cx="62" cy="70" r="4"/></g>',
    tone: { waves: [['sawtooth', 0, 1], ['square', 5, .35]], q: 1.5, cut: [2, 5, 3], atk: .04, vib: [5.2, 7] }
  },
  flute: {
    name: 'Flute', lo: 60, hi: 96, off: 0, lift: false,
    sub: 'Notes are shown at concert pitch, which is the same as written for flute.',
    icon: '<path d="M12 100L88 28"/><path d="M12 100L28 85" stroke-width="12"/><g fill="currentColor" stroke="none"><circle cx="48.6" cy="77.7" r="3.5"/><circle cx="60" cy="66.9" r="3.5"/><circle cx="71.4" cy="56.1" r="3.5"/><circle cx="82.8" cy="45.3" r="3.5"/></g>',
    tone: { waves: [['sine', 0, 1], ['triangle', 0, .2]], q: .7, cut: [5, 7, 6], atk: .06, vib: [5, 5] }
  },
  piano: {
    name: 'Piano', lo: 48, hi: 84, off: 0, lift: true,
    sub: 'Notes are shown at concert pitch, which is the same as written for piano.',
    icon: '<g stroke-width="4"><rect x="6" y="34" width="88" height="62" rx="5"/><path d="M18.6 34V96M31.1 34V96M43.7 34V96M56.3 34V96M68.9 34V96M81.4 34V96"/></g><g fill="currentColor" stroke="none"><rect x="14.1" y="34" width="9" height="36" rx="1.5"/><rect x="26.6" y="34" width="9" height="36" rx="1.5"/><rect x="52.3" y="34" width="9" height="36" rx="1.5"/><rect x="64.4" y="34" width="9" height="36" rx="1.5"/><rect x="76.9" y="34" width="9" height="36" rx="1.5"/></g>',
    tone: { waves: [['triangle', 0, .8], ['sine', 0, .25, 2], ['sine', 0, .1, 3], ['triangle', 6, .25]], q: .7, cut: [8, 4, 2], atk: .005, vib: [0, 0], pluck: .55 }
  }
};
