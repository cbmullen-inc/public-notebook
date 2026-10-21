const load = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k)) || {}); } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let S = load('alto-settings', { level: 'basic', dir: 'up', oct: 12, inst: 'alto', ref: 1 }); // key kept so existing settings carry over
let ST = load('alto-stats', {});
if (!INSTRUMENTS[S.inst]) S.inst = 'alto';
const oldKeys = Object.keys(ST).filter(k => k.includes(':'));
if (oldKeys.length) { ST.alto = ST.alto || {}; oldKeys.forEach(k => { ST.alto[k] = ST[k]; delete ST[k]; }); save('alto-stats', ST); }
const stats = () => ST[S.inst] || (ST[S.inst] = {}); // progress is kept separately for each instrument
let view = 'home', drill = null, Q = null, sess = { c: 0, n: 0 };
const inst = () => INSTRUMENTS[S.inst];
const ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const IC = { back: 'M15 5l-7 7 7 7', chart: 'M5 20V10M12 20V4M19 20v-7', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' };
const icon = (I, px) => `<svg viewBox="0 0 100 120" width="${px}" height="${Math.round(px * 1.2)}" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I.icon}</svg>`;
function applyTheme() { // each instrument has its own colours (see app.css) so you can tell at a glance which is selected
  document.documentElement.dataset.inst = S.inst;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || m.content;
}

function answer(id) {
  if (!Q || Q.done || !Q.played) return;
  Q.done = true; Q.pick = id; const ok = id === Q.it.id, k = drill + ':' + Q.it.id;
  const T = stats(), s = T[k] || (T[k] = { c: 0, n: 0 }); s.n++; if (ok) s.c++; save('alto-stats', ST);
  sess.n++; if (ok) sess.c++; render();
}
function next() { stop(); Q = make(drill, inst(), S, stats()); render(); }
function route() {
  stop(); const h = location.hash.slice(1);
  if (DR[h]) { if (drill !== h || view !== 'drill') { drill = h; sess = { c: 0, n: 0 }; Q = make(h, inst(), S, stats()); } view = 'drill'; }
  else view = h === 'progress' ? 'stats' : 'home';
  render(); scrollTo(0, 0);
}

const acc = d => { let c = 0, n = 0; DR[d].items.forEach(i => { const s = stats()[d + ':' + i.id]; if (s) { c += s.c; n += s.n; } }); return { c, n }; };
const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-act="set" data-k="${k}" data-v="${v}" aria-pressed="${String(S[k]) === String(v)}">${l}</button>`).join('')}</div>`;

function render() {
  const el = document.getElementById('app'), I = inst(); let h = '';
  applyTheme();
  if (view === 'home') {
    h = `<h1>Ear training</h1><p class="sub">${I.sub} Use headphones or turn the volume up.</p>
    <div class="insts" role="group" aria-label="Instrument">${Object.entries(INSTRUMENTS).map(([k, v]) => `<button class="inst" data-act="set" data-k="inst" data-v="${k}" aria-pressed="${S.inst === k}">${icon(v, 38)}<span>${v.name}</span></button>`).join('')}</div>
    <div class="drills">${Object.entries(DR).map(([k, D]) => { const a = acc(k); return `<a class="drill" href="#${k}"><strong>${D.title}</strong><span>${D.hint}</span><em>${a.n ? Math.round(100 * a.c / a.n) + '% correct over ' + a.n + ' answers' : 'Not started'}</em></a>`; }).join('')}</div>
    <h2>Settings</h2>
    <div class="row"><span>Difficulty</span>${seg('level', [['basic', 'Basic'], ['all', 'All']])}</div>
    <div class="row"><span>Reference C for notes</span>${seg('ref', [[1, 'On'], [0, 'Off']])}</div>
    <div class="row"><span>Interval direction</span>${seg('dir', [['up', 'Up'], ['down', 'Down'], ['mixed', 'Mixed']])}</div>
    ${I.lift ? `<div class="row"><span>Playback pitch</span>${seg('oct', [[12, 'Phone-friendly'], [0, 'As it sounds']])}</div>` : ''}
    <div class="actions"><a class="btn" href="#progress">${ico(IC.chart)}View progress</a><button class="btn danger" data-act="reset">${ico(IC.trash)}Clear progress</button></div>`;
  } else if (view === 'stats') {
    h = `<div class="bar"><a class="btn" href="#">${ico(IC.back)}Back</a></div><h1>Progress</h1><p class="sub">Showing ${I.name}. Change instrument in settings on the home screen.</p>`;
    for (const [k, D] of Object.entries(DR)) {
      h += `<h2>${D.title}</h2>` + D.items.map(i => { const s = stats()[k + ':' + i.id], p = s && s.n ? Math.round(100 * s.c / s.n) : 0;
        return `<div class="stat"><span>${i.l}</span><div class="meter"><i style="width:${p}%"></i></div><span>${s && s.n ? p + '%' : '–'}</span></div>`; }).join('');
    }
    h += `<div class="actions one"><button class="btn danger" data-act="reset">${ico(IC.trash)}Clear ${I.name} progress</button></div>`;
  } else {
    const D = DR[drill], p = pool(drill, S.level);
    const where = I.off ? `written ${nm(Q.root)}, concert ${nm(Q.root - I.off)}` : nm(Q.root);
    h = `<div class="bar"><a class="btn" href="#">${ico(IC.back)}Back</a><span class="who"><span class="ic">${icon(I, 22)}</span>${I.name}: ${sess.c} of ${sess.n} correct</span></div>
    <button class="play" data-act="replay" aria-label="Play">▶</button><p class="prompt">${Q.played ? (drill === 'notes' && S.ref ? 'You heard a reference C, then the note. Which is it?' : D.q) : 'Tap play to hear the question.'}</p>
    <div class="grid${drill === 'notes' ? ' g3' : ''}">${p.map(i => `<button class="ans ${Q.played ? '' : 'wait '}${Q.done ? (i.id === Q.it.id ? 'ok' : i.id === Q.pick ? 'bad' : '') : ''}" data-act="ans" data-id="${i.id}">${i.l}</button>`).join('')}</div>
    <div class="fb" aria-live="polite">${Q.done ? `<b>${Q.pick === Q.it.id ? 'Correct' : 'That was ' + Q.it.l}</b><small>${drill === 'notes' ? 'The note was' : 'Starting note:'} ${where}</small>` : ''}</div>
    ${Q.done ? '<button class="next" data-act="next">Next</button>' : ''}`;
  }
  el.innerHTML = h;
}

document.getElementById('app').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (d.act === 'ans') answer(d.id);
  else if (d.act === 'next') next();
  else if (d.act === 'replay') { if (Q) { const first = !Q.played; Q.played = true; play(Q.ev, inst(), S.oct === 12); if (first) render(); } }
  else if (d.act === 'set') { S[d.k] = d.k === 'oct' || d.k === 'ref' ? +d.v : d.v; save('alto-settings', S); render(); }
  else if (d.act === 'reset') { if (confirm('Clear your ' + inst().name + ' progress on this device?')) { ST[S.inst] = {}; save('alto-stats', ST); render(); } }
});

addEventListener('hashchange', route); route();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
