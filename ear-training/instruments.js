// Everything instrument-specific lives here. To add an instrument, add an entry.
//  lo/hi  written range as MIDI numbers (60 = middle C)
//  off    semitones the instrument sounds BELOW its written pitch (alto sax 9, flute 0)
//  lift   true if a "phone-friendly" octave-up playback option makes sense (low instruments)
//  tone   synth recipe: oscillators [type, detune cents, level], filter Q, filter cutoff multipliers
//         [start, peak, end], attack seconds, vibrato [Hz, cents]
const NAMES = ['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const nm = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

const INSTRUMENTS = {
  alto: {
    name: 'Alto sax', lo: 58, hi: 90, off: 9, lift: true,
    sub: 'Notes are shown in written pitch for E♭ alto sax.',
    tone: { waves: [['sawtooth', 0, 1], ['square', 5, .35]], q: 1.5, cut: [2, 5, 3], atk: .04, vib: [5.2, 7] }
  },
  flute: {
    name: 'Flute', lo: 60, hi: 96, off: 0, lift: false,
    sub: 'Notes are shown at concert pitch, which is the same as written for flute.',
    tone: { waves: [['sine', 0, 1], ['triangle', 0, .2]], q: .7, cut: [5, 7, 6], atk: .06, vib: [5, 5] }
  }
};
