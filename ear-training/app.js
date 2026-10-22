const load = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k)) || {}); } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let S = load('alto-settings', { level: 'basic', dir: 'up', oct: 12, inst: 'alto', ref: 1 }); // key kept so existing settings carry over
let ST = load('alto-stats', {});
if (!INSTRUMENTS[S.inst]) S.inst = 'alto';
const oldKeys = Object.keys(ST).filter(k => k.includes(':'));
if (oldKeys.length) { ST.alto = ST.alto || {}; oldKeys.forEach(k => { ST.alto[k] = ST[k]; delete ST[k]; }); save('alto-stats', ST); }
const stats = () => ST[S.inst] || (ST[S.inst] = {}); // progress is kept separately for each instrument
let view = 'home', drill = null, Q = null, sess = { c: 0, n: 0 }, challenge = null;
const inst = () => INSTRUMENTS[S.inst];
const ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const IC = { back: 'M15 5l-7 7 7 7', chart: 'M5 20V10M12 20V4M19 20v-7', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z' };
const icon = (I, px) => `<svg viewBox="0 0 100 120" width="${px}" height="${Math.round(px * 1.2)}" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I.icon}</svg>`;
function applyTheme() { // each instrument has its own colours (see app.css) so you can tell at a glance which is selected
  document.documentElement.dataset.inst = S.inst;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || m.content;
}

/* ---------- daily challenge: CH_N questions in one drill; finishing counts for the day, whatever the score ---------- */
const CH_N = 10;
let DY = load('ear-daily', { streak: 0, best: 0, last: '', days: 0 });
const dkey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); // local date
const dayBefore = k => { const [y, m, d] = k.split('-').map(Number); return dkey(new Date(y, m - 1, d - 1)); };
const doneToday = (t = dkey()) => DY.last === t;
const liveStreak = (t = dkey()) => (DY.last === t || DY.last === dayBefore(t)) ? DY.streak : 0; // a missed day resets it
function completeDaily(t = dkey()) { // returns true if this completion added to the streak
  if (DY.last === t) return false;
  DY.streak = DY.last === dayBefore(t) ? DY.streak + 1 : 1;
  DY.best = Math.max(DY.best, DY.streak); DY.last = t; DY.days++; save('ear-daily', DY); return true;
}
const streakCard = link => {
  const n = liveStreak(), done = doneToday(), cls = 'streak' + (done ? ' done' : '');
  const body = `${ico(IC.flame)}<div><span class="num">${n}</span> day streak<small>${done ? 'Today’s challenge is done. Best streak: ' + DY.best : n ? 'Do today’s challenge to keep it going.' : 'Do a challenge today to start your streak.'}</small></div>`;
  return link ? `<a class="${cls}" href="#daily">${body}</a>` : `<div class="${cls}">${body}</div>`;
};
const dots = () => `<div class="dots" aria-hidden="true">${Array.from({ length: CH_N }, (_, i) => `<i class="${i < challenge.res.length ? (challenge.res[i] ? 'ok' : 'bad') : i === challenge.res.length ? 'cur' : ''}"></i>`).join('')}</div>`;

function answer(id) {
  if (!Q || Q.done || !Q.played) return;
  Q.done = true; Q.pick = id; const ok = id === Q.it.id, k = drill + ':' + Q.it.id;
  const T = stats(), s = T[k] || (T[k] = { c: 0, n: 0 }); s.n++; if (ok) s.c++; save('alto-stats', ST);
  sess.n++; if (ok) sess.c++;
  if (challenge) { challenge.res.push(ok); if (sess.n >= CH_N) { challenge.score = sess.c; challenge.counted = completeDaily(); } }
  render();
}
function next() { stop(); if (challenge && sess.n >= CH_N) { view = 'result'; render(); scrollTo(0, 0); return; } Q = make(drill, inst(), S, stats()); render(); }
function route() {
  stop(); const [a, b] = location.hash.slice(1).split('/'); challenge = null;
  if (a === 'daily' && DR[b]) { challenge = { res: [], score: 0, counted: false }; drill = b; sess = { c: 0, n: 0 }; Q = make(b, inst(), S, stats()); view = 'drill'; }
  else if (a === 'daily') view = 'daily';
  else if (DR[a]) { drill = a; sess = { c: 0, n: 0 }; Q = make(a, inst(), S, stats()); view = 'drill'; }
  else view = a === 'progress' ? 'stats' : 'home';
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
    ${streakCard(true)}
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
  } else if (view === 'daily') {
    h = `<div class="bar"><a class="btn" href="#">${ico(IC.back)}Back</a></div><h1>Daily challenge</h1>
    <p class="sub">${CH_N} questions in one drill. Finish them and the day counts toward your streak, whatever your score.</p>
    ${streakCard(false)}<h2>Choose today’s drill</h2>
    <div class="drills">${Object.entries(DR).map(([k, D]) => `<a class="drill" href="#daily/${k}"><strong>${D.title}</strong><span>${D.hint}</span></a>`).join('')}</div>`;
  } else if (view === 'result') {
    const C = challenge;
    h = `<h1 class="center">Challenge complete</h1><p class="score">${C.score}/${CH_N}</p><p class="center sub">${DR[drill].title} on ${I.name}</p>
    ${streakCard(false)}<p class="center sub">${C.counted ? 'That’s today counted. Come back tomorrow to keep the streak going.' : 'Today was already counted, so your streak stays the same.'}</p>
    <div class="actions"><button class="btn" data-act="again">Same drill again</button><a class="btn" href="#">Home</a></div>`;
  } else {
    const D = DR[drill], p = pool(drill, S.level);
    const where = I.off ? `written ${nm(Q.root)}, concert ${nm(Q.root - I.off)}` : nm(Q.root);
    h = `<div class="bar"><a class="btn" href="#">${ico(IC.back)}Back</a><span class="who"><span class="ic">${icon(I, 22)}</span>${challenge ? 'Daily: question ' + Math.min(sess.n + (Q.done ? 0 : 1), CH_N) + ' of ' + CH_N : I.name + ': ' + sess.c + ' of ' + sess.n + ' correct'}</span></div>${challenge ? dots() : ''}
    <button class="play" data-act="replay" aria-label="Play">▶</button><p class="prompt">${Q.played ? (drill === 'notes' && S.ref ? 'You heard a reference C, then the note. Which is it?' : D.q) : 'Tap play to hear the question.'}</p>
    <div class="grid${drill === 'notes' ? ' g3' : drill === 'minors' ? ' g1' : ''}">${p.map(i => `<button class="ans ${Q.played ? '' : 'wait '}${Q.done ? (i.id === Q.it.id ? 'ok' : i.id === Q.pick ? 'bad' : '') : ''}" data-act="ans" data-id="${i.id}">${i.l}</button>`).join('')}</div>
    <div class="fb" aria-live="polite">${Q.done ? `<b>${Q.pick === Q.it.id ? 'Correct' : 'That was ' + Q.it.l}</b><small>${drill === 'notes' ? 'The note was' : 'Starting note:'} ${where}</small>${Q.it.tip ? '<small>' + Q.it.tip + '</small>' : ''}` : ''}</div>
    ${Q.done ? `<button class="next" data-act="next">${challenge && sess.n >= CH_N ? 'See results' : 'Next'}</button>` : ''}`;
  }
  el.innerHTML = h;
}

document.getElementById('app').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (d.act === 'ans') answer(d.id);
  else if (d.act === 'next') next();
  else if (d.act === 'again') route();
  else if (d.act === 'replay') { if (Q) { const first = !Q.played; Q.played = true; play(Q.ev, inst(), S.oct === 12); if (first) render(); } }
  else if (d.act === 'set') { S[d.k] = d.k === 'oct' || d.k === 'ref' ? +d.v : d.v; save('alto-settings', S); render(); }
  else if (d.act === 'reset') { if (confirm('Clear your ' + inst().name + ' progress on this device?')) { ST[S.inst] = {}; save('alto-stats', ST); render(); } }
});

addEventListener('hashchange', route); route();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
