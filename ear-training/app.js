const load = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k)) || {}); } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let S = load('alto-settings', { level: 'basic', dir: 'up', oct: 12, inst: 'alto', ref: 1 }); // key kept so existing settings carry over
let ST = load('alto-stats', {});
let DAILY = load('ear-daily', { date: '', drill: 'notes', answered: 0, correct: 0, complete: false, lastCompleted: '', streak: 0, bestStreak: 0 });
DAILY.bestStreak = Math.max(DAILY.bestStreak || 0, DAILY.streak || 0);
if (!DR[S.dailyDrill]) S.dailyDrill = 'notes';
if (!INSTRUMENTS[S.inst]) S.inst = 'alto';
const oldKeys = Object.keys(ST).filter(k => k.includes(':'));
if (oldKeys.length) { ST.alto = ST.alto || {}; oldKeys.forEach(k => { ST.alto[k] = ST[k]; delete ST[k]; }); save('alto-stats', ST); }
const stats = () => ST[S.inst] || (ST[S.inst] = {}); // progress is kept separately for each instrument
let view = 'home', drill = null, Q = null, sess = { c: 0, n: 0 };
const inst = () => INSTRUMENTS[S.inst];
const dateKey = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const today = () => dateKey(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dateKey(d); };
const currentStreak = () => DAILY.lastCompleted === today() || DAILY.lastCompleted === yesterday() ? DAILY.streak : 0;
const streakMilestones = [
  { days: 7, label: '1 week', gem: '💎', name: 'Diamond' },
  { days: 30, label: '1 month', gem: '🌟', name: 'Star' },
  { days: 90, label: '3 months', gem: '🟢', name: 'Emerald' },
  { days: 180, label: '6 months', gem: '🔵', name: 'Sapphire' },
  { days: 365, label: '1 year', gem: '👑', name: 'Crown' },
  { days: 730, label: '2 years', gem: '🌈', name: 'Rainbow' },
  { days: 1825, label: '5 years', gem: '🏆', name: 'Super star' }
];
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
  sess.n++; if (ok) sess.c++;
  if (view === 'daily') {
    DAILY.answered++; if (ok) DAILY.correct++;
    if (DAILY.answered === 10) {
      DAILY.complete = true;
      DAILY.streak = DAILY.lastCompleted === yesterday() ? DAILY.streak + 1 : DAILY.lastCompleted === today() ? DAILY.streak : 1;
      DAILY.lastCompleted = today();
      DAILY.bestStreak = Math.max(DAILY.bestStreak || 0, DAILY.streak);
    }
    save('ear-daily', DAILY);
  }
  render();
}
function next() { stop(); Q = make(drill, inst(), S, stats()); render(); }
function route() {
  stop(); const h = location.hash.slice(1);
  if (DR[h]) { if (drill !== h || view !== 'drill') { drill = h; sess = { c: 0, n: 0 }; Q = make(h, inst(), S, stats()); } view = 'drill'; }
  else if (h === 'daily' && DAILY.date === today() && DR[DAILY.drill]) {
    if (drill !== DAILY.drill || view !== 'daily') { drill = DAILY.drill; sess = { c: DAILY.correct, n: DAILY.answered }; Q = DAILY.complete ? null : make(drill, inst(), S, stats()); }
    view = 'daily';
  }
  else view = h === 'progress' ? 'stats' : 'home';
  render(); scrollTo(0, 0);
}

const acc = d => { let c = 0, n = 0; DR[d].items.forEach(i => { const s = stats()[d + ':' + i.id]; if (s) { c += s.c; n += s.n; } }); return { c, n }; };
const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-act="set" data-k="${k}" data-v="${v}" aria-pressed="${String(S[k]) === String(v)}">${l}</button>`).join('')}</div>`;

function render() {
  const el = document.getElementById('app'), I = inst(); let h = '';
  applyTheme();
  if (view === 'home') {
    const activeToday = DAILY.date === today(), completedToday = activeToday && DAILY.complete;
    const bestStreak = DAILY.bestStreak || 0;
    const nextMilestone = streakMilestones.find(m => m.days > bestStreak);
    const previousMilestone = [...streakMilestones].reverse().find(m => m.days <= bestStreak);
    const progressStart = previousMilestone ? previousMilestone.days : 0;
    const progress = nextMilestone ? Math.round(100 * (bestStreak - progressStart) / (nextMilestone.days - progressStart)) : 100;
    h = `<div class="insts" role="group" aria-label="Instrument">${Object.entries(INSTRUMENTS).map(([k, v]) => `<button class="inst" data-act="set" data-k="inst" data-v="${k}" aria-pressed="${S.inst === k}">${icon(v, 38)}<span>${v.name}</span></button>`).join('')}</div>
    <h1>Ear training</h1><p class="sub">${I.sub} Use headphones or turn the volume up.</p>
    <section class="daily">
      <div class="streak-heading"><h2>Daily challenge</h2><div class="streak-count" aria-label="Current streak: ${currentStreak()} days">🔥 ${currentStreak()} <span>${currentStreak() === 1 ? 'day' : 'days'} in a row</span></div></div>
      <p class="daily-note">Complete 10 questions each day to build your streak. Any score counts!</p>
      <div class="streak-best">Personal best: <strong>${bestStreak}</strong> ${bestStreak === 1 ? 'day' : 'days'}</div>
      <div class="streak-progress" role="progressbar" aria-label="Progress to ${nextMilestone ? nextMilestone.label : 'all streak gems'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${progress}%"></i></div>
      <div class="gem-timeline" aria-label="Streak gem milestones">${streakMilestones.map(m => {
        const earned = bestStreak >= m.days;
        return `<div class="gem-step${earned ? ' earned' : ''}" aria-label="${m.name} ${m.label} gem ${earned ? 'earned' : 'locked'}"><span class="gem">${m.gem}</span><strong>${m.label}</strong><small>${earned ? 'Earned!' : m.days + ' days'}</small></div>`;
      }).join('')}</div>
      <label for="daily-drill">Choose a selection</label>
      <select id="daily-drill" ${activeToday ? 'disabled' : ''}>${Object.entries(DR).map(([k, D]) => `<option value="${k}" ${S.dailyDrill === k ? 'selected' : ''}>${D.title}</option>`).join('')}</select>
      ${completedToday
        ? `<p class="daily-result">Today's challenge complete: ${DAILY.correct} of 10 correct! 🎉</p>`
        : activeToday
          ? `<p class="daily-result">${DAILY.answered} of 10 questions answered.</p><a class="btn daily-start" href="#daily">Resume challenge</a>`
          : '<button class="btn daily-start" data-act="daily-start">Start today&#39;s challenge</button>'}
    </section>
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
  } else if (view === 'daily' && DAILY.complete) {
    h = `<div class="bar"><a class="btn" href="#">${ico(IC.back)}Back</a><span class="who">Daily challenge</span></div>
    <h1>Challenge complete</h1><p class="sub">You answered all 10 questions. Your score does not affect your streak.</p>
    <div class="daily-complete"><strong>${DAILY.correct} of 10 correct</strong><span>Current streak: ${currentStreak()} ${currentStreak() === 1 ? 'day' : 'days'}</span></div>`;
  } else {
    const D = DR[drill], p = pool(drill, S.level);
    const where = I.off ? `written ${nm(Q.root)}, concert ${nm(Q.root - I.off)}` : nm(Q.root);
    h = `<div class="bar"><a class="btn" href="#">${ico(IC.back)}Back</a><span class="who">${view === 'daily' ? `Daily challenge · ${DAILY.answered} of 10` : `<span class="ic">${icon(I, 22)}</span>${I.name}: ${sess.c} of ${sess.n} correct`}</span></div>
    <button class="play" data-act="replay" aria-label="Play">▶</button><p class="prompt">${Q.played ? (drill === 'notes' && S.ref ? 'You heard a reference C, then the note. Which is it?' : D.q) : 'Tap play to hear the question.'}</p>
    <div class="grid${drill === 'notes' ? ' g3' : drill === 'minors' ? ' g1' : ''}">${p.map(i => `<button class="ans ${Q.played ? '' : 'wait '}${Q.done ? (i.id === Q.it.id ? 'ok' : i.id === Q.pick ? 'bad' : '') : ''}" data-act="ans" data-id="${i.id}">${i.l}</button>`).join('')}</div>
    <div class="fb" aria-live="polite">${Q.done ? `<b>${Q.pick === Q.it.id ? 'Correct' : 'That was ' + Q.it.l}</b><small>${drill === 'notes' ? 'The note was' : 'Starting note:'} ${where}</small>${Q.it.tip ? '<small>' + Q.it.tip + '</small>' : ''}` : ''}</div>
    ${Q.done && view === 'daily' ? `<p class="daily-result">${DAILY.answered === 10 ? `Challenge complete: ${DAILY.correct} of 10 correct. Streak: ${currentStreak()} ${currentStreak() === 1 ? 'day' : 'days'}.` : `Question ${DAILY.answered} of 10 complete.`}</p>` : ''}
    ${Q.done && !(view === 'daily' && DAILY.complete) ? '<button class="next" data-act="next">Next</button>' : ''}`;
  }
  el.innerHTML = h;
}

document.getElementById('app').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (d.act === 'ans') answer(d.id);
  else if (d.act === 'next') next();
  else if (d.act === 'daily-start') {
    DAILY = { ...DAILY, date: today(), drill: S.dailyDrill, answered: 0, correct: 0, complete: false };
    save('ear-daily', DAILY);
    location.hash = 'daily';
  }
  else if (d.act === 'replay') { if (Q) { const first = !Q.played; Q.played = true; play(Q.ev, inst(), S.oct === 12); if (first) render(); } }
  else if (d.act === 'set') { S[d.k] = d.k === 'oct' || d.k === 'ref' ? +d.v : d.v; save('alto-settings', S); render(); }
  else if (d.act === 'reset') { if (confirm('Clear your ' + inst().name + ' progress on this device?')) { ST[S.inst] = {}; save('alto-stats', ST); render(); } }
});

document.getElementById('app').addEventListener('change', e => {
  if (e.target.id === 'daily-drill') { S.dailyDrill = e.target.value; save('alto-settings', S); }
});

addEventListener('hashchange', route); route();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
