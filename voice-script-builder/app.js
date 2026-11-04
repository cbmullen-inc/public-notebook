"use strict";
// Keep only the root address, in case a path like /rest/v1 was pasted into config.js.
const db = supabase.createClient(new URL(CONFIG.SUPABASE_URL.trim()).origin, CONFIG.SUPABASE_ANON_KEY.trim());
const MAX_SECONDS = 120, MAX_BYTES = 5 * 1024 * 1024;
const MIMES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view"), note = $("#note");
let currentProject = null, lastUid = null, rec = null;
// Usernames are mapped to placeholder emails. example.com is reserved, so nothing can ever be delivered there.
const EMAIL_DOMAIN = "users.example.com";
function toEmail(u) {
  u = String(u).trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(u)) throw new Error("Usernames are 3 to 20 letters, numbers or underscores.");
  return `${u}@${EMAIL_DOMAIN}`;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function say(msg, bad = false) { note.textContent = msg; note.className = bad ? "bad" : ""; note.hidden = !msg; }
async function guard(fn) { try { say(""); await fn(); } catch (e) { say(e.message || String(e), true); console.error(e); } }
const must = r => { if (r.error) throw r.error; return r.data; };
const clock = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// ---------- Routing ----------
// The open project lives in the URL hash (#p-<id>) so refresh, back and bookmarks keep your place.
const HASH_RE = /^#p-([0-9a-f-]{36})(?:\/(scripts|section-([0-9a-f-]{36})))?$/i;
function setUrl(id, page = null) {
  const want = id ? `#p-${id}${page ? `/${page}` : ""}` : "";
  if (location.hash !== want) history.pushState(null, "", location.pathname + location.search + want);
}
window.addEventListener("popstate", () => {
  cancelRec();
  guard(route);
});

async function route() {
  const { data: { session } } = await db.auth.getSession();
  $("#who").innerHTML = session ? `${esc((session.user.email || "").split("@")[0])} <button class="link" data-act="signout" style="color:#fff">Sign out</button>` : "";
  if (!session) return renderAuth();
  const m = location.hash.match(HASH_RE);
  currentProject = m ? m[1].toLowerCase() : null;
  if (currentProject) {
    try {
      if (m[2] === "scripts") return await renderScripts(currentProject);
      return await renderProject(currentProject, m[3]?.toLowerCase());
    }
    catch (e) { console.error(e); currentProject = null; say("Couldn't open that project. It may have been deleted, or you may not be a member.", true); }
  }
  return renderHome();
}
db.auth.onAuthStateChange((ev, session) => {
  const uid = session?.user?.id ?? null;
  if (uid === lastUid) return;           // ignore token refreshes so a recording is never interrupted
  lastUid = uid; if (!uid) { currentProject = null; setUrl(null); }
  guard(route);
});

// ---------- Screens ----------
const EYE = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 5.1A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22"/></svg>`;
function renderAuth() {
  view.innerHTML = `<div class="panel"><h2>Sign in</h2>
  <form data-form="auth"><label for="user">Username</label>
  <input id="user" name="user" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" required>
  <p class="muted">Letters, numbers and underscores.</p>
  <label for="pw">Password (8+ characters)</label><div class="pw"><input id="pw" name="pw" type="password" minlength="8" autocomplete="current-password" required>
  <button type="button" class="eye" data-act="togglepw" aria-label="Show password" aria-pressed="false">${EYE}</button></div>
  <div class="actions"><button class="primary" name="mode" value="signin">Sign in</button><button name="mode" value="signup">Create account</button></div></form>
  <p class="muted">Forgot your password? Ask the project owner to reset it.</p></div>`;
}

async function renderHome() {
  stopPlay();
  currentProject = null; setUrl(null);
  const projects = must(await db.from("projects").select("id,name").order("created_at"));
  view.innerHTML = `<h2>Your projects</h2>
  ${projects.length ? `<div class="panel"><ul>${projects.map(p => `<li><button class="link" data-act="open" data-id="${p.id}">${esc(p.name)}</button></li>`).join("")}</ul></div>` : `<p class="muted">No projects yet. Create one or join with an invite code.</p>`}
  <div class="panel"><h3>New project</h3><form data-form="new"><label for="pn">Project name</label><input id="pn" name="name" maxlength="100" required>
  <div class="actions"><button class="primary">Create project</button></div></form></div>
  <div class="panel"><h3>Join a project</h3><form data-form="join"><label for="jc">Invite code</label><input id="jc" name="code" autocapitalize="characters" required>
  <label for="jn">Your name in this project</label><input id="jn" name="name" maxlength="50" required>
  <div class="actions"><button class="primary">Join project</button></div></form></div>`;
}

let castFilter = null, statusFilter = "all", page = 0, summaryEdit = false, peopleOpen = false, summary = { items: [] }, playRun = null;
const svg = inner => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON_DONE = svg('<circle cx="12" cy="12" r="10"/><path d="M8 12.5l3 3 5-6"/>');
const ICON_PENDING = svg('<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>');
const ICON_PAUSE = svg('<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>');
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function setPlayUI(playing, text = "") {
  const q = id => $(id);
  if (q("#pa-status")) q("#pa-status").textContent = text;
  if (q("#pa-stop")) q("#pa-stop").hidden = !playing;
  if (q("#pa-go")) q("#pa-go").hidden = playing;
  if (!playing) document.querySelectorAll(".now").forEach(n => n.classList.remove("now"));
}
function markNow(id) {
  document.querySelectorAll(".now").forEach(n => n.classList.remove("now"));
  const n = document.querySelector(`[data-item="${id}"]`); if (!n) return;
  n.classList.add("now");
  n.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
function stopPlay() {
  if (!playRun) return;
  const r = playRun; playRun = null; r.stop = true; clearTimeout(r.timer);
  const a = $("#pa-audio"); if (a) { a.onerror = null; a.pause(); }
  r.resolve?.(); setPlayUI(false, "Stopped.");
}
async function playAll(startId) {
  stopPlay();
  const audio = $("#pa-audio");
  document.querySelectorAll(".take audio").forEach(a => a.pause());
  audio.src = SILENT; audio.play().catch(() => {});      // unlock audio inside the tap (iOS Safari needs this)
  const items = summary.items, first = startId ? items.findIndex(i => i.id === startId) : 0;
  const todo = items.slice(first).filter(i => i.path);
  if (!todo.length) throw new Error("There are no recorded sections to play yet.");
  const signed = must(await db.storage.from("recordings").createSignedUrls(todo.map(i => i.path), 3600));
  const url = Object.fromEntries(signed.map(u => [u.path, u.signedUrl]));
  const run = playRun = { stop: false };
  setPlayUI(true, "Starting…");
  try {
    for (const it of items.slice(first)) {
      if (run.stop) break;
      markNow(it.id);
      if (it.kind === "pause") {
        $("#pa-status").textContent = `Pause (${it.pause_ms / 1000} s)`;
        await new Promise(res => { run.resolve = res; run.timer = setTimeout(res, it.pause_ms); });
      } else if (it.path) {
        $("#pa-status").textContent = `Playing: ${it.title}`;
        audio.src = url[it.path];
        await new Promise((res, rej) => { run.resolve = res; audio.onended = res; audio.onerror = () => rej(new Error(`Couldn't play "${it.title}".`)); audio.play().catch(rej); });
      }
    }
  } finally {
    if (playRun === run) { playRun = null; setPlayUI(false, "Finished."); }
  }
}

const renumber = rows => Promise.all(rows.map((r, k) => r.position === k ? null : db.from("sections").update({ position: k }).eq("id", r.id).then(must)));
async function moveItem(id, dir, onlySections) {
  const rows = must(await db.from("sections").select("id,position,kind").eq("project_id", currentProject).order("position").order("id"));
  const i = rows.findIndex(r => r.id === id); if (i < 0) return;
  let j = i + dir; while (onlySections && rows[j] && rows[j].kind !== "section") j += dir;   // pauses keep their place
  if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await renumber(rows); await renderProject(currentProject);
}
async function insertPause(afterId) {
  const rows = must(await db.from("sections").select("id,position").eq("project_id", currentProject).order("position").order("id"));
  const i = afterId === "start" ? -1 : rows.findIndex(r => r.id === afterId);
  await Promise.all(rows.map((r, k) => { const np = k <= i ? k : k + 1; return r.position === np ? null : db.from("sections").update({ position: np }).eq("id", r.id).then(must); }));
  must(await db.from("sections").insert({ project_id: currentProject, kind: "pause", title: "Pause", body: "", pause_ms: 2000, position: i + 1 }));
  await renderProject(currentProject);
}

async function sectionCount(pid) {   // real sections only, so pauses don't affect numbering
  const { count, error } = await db.from("sections").select("id", { count: "exact", head: true }).eq("project_id", pid).eq("kind", "section");
  if (error) throw error; return count ?? 0;
}
function setPeople(open) {
  peopleOpen = open;
  $("#drawer")?.classList.toggle("open", open); $("#drawer-back, .drawer-back")?.classList.toggle("open", open);
  const d = $("#drawer"); if (d) d.inert = !open;
  const b = $("#people-btn"); if (b) b.setAttribute("aria-expanded", open);
  if (open) d?.querySelector("button")?.focus(); else b?.focus();
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && peopleOpen) setPeople(false); });

function busy() { if (rec) throw new Error("Finish or discard your recording first."); }

async function nextPos(pid) {
  const r = must(await db.from("sections").select("position").eq("project_id", pid).order("position", { ascending: false }).limit(1));
  return r.length ? r[0].position + 1 : 0;
}
async function drawInvites(id) {
  const el = $("#invite-list"); if (!el) return;
  const rows = must(await db.rpc("list_invites", { p_project: id }));
  el.innerHTML = rows.length ? rows.map(r => `<li class="row"><span class="muted">Unused code, expires ${esc(new Date(r.expires_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }))}</span><button class="link" data-act="revoke" data-id="${r.id}">Revoke</button></li>`).join("") : `<li class="muted">No unused codes.</li>`;
}

async function renderProject(id, sectionId = null) {
  if (currentProject !== id) { castFilter = null; statusFilter = "all"; page = 0; summaryEdit = false; peopleOpen = false; }
  stopPlay();
  currentProject = id; setUrl(id, sectionId ? `section-${sectionId}` : null);
  const uid = (await db.auth.getUser()).data.user.id;
  const [p, members, sections, takes] = await Promise.all([
    db.from("projects").select("id,name").eq("id", id).single().then(must),
    db.from("members").select("id,user_id,role,display_name,color").eq("project_id", id).then(must),
    db.from("sections").select("id,position,title,body,assignee_id,kind,pause_ms").eq("project_id", id).order("position").order("id").then(must),
    db.from("recordings").select("section_id,storage_path,duration_ms,uploader_id").eq("project_id", id).eq("is_current", true).then(must),
  ]);
  const me = members.find(m => m.user_id === uid), owner = me?.role === "owner";
  const byId = Object.fromEntries(members.map(m => [m.id, m]));
  const take = Object.fromEntries(takes.map(t => [t.section_id, t]));
  const real = sections.filter(s => s.kind === "section");
  const done = real.filter(s => take[s.id]).length;
  summary = { items: sections.map(s => s.kind === "pause" ? { id: s.id, kind: "pause", pause_ms: s.pause_ms } : { id: s.id, kind: "section", title: s.title, path: take[s.id]?.storage_path || null }) };

  if (sectionId) {
    castFilter = "all"; statusFilter = "all";
    page = Math.floor(Math.max(0, sections.findIndex(s => s.id === sectionId)) / 10);
  }
  if (castFilter === null) castFilter = owner ? "all" : (me?.id || "all");
  if (castFilter !== "all" && castFilter !== "none" && !byId[castFilter]) castFilter = "all";
  const filtering = castFilter !== "all" || statusFilter !== "all";
  const list = !filtering ? sections : real.filter(s =>
    (castFilter === "all" || (castFilter === "none" ? !s.assignee_id : s.assignee_id === castFilter)) &&
    (statusFilter === "all" || (statusFilter === "pending" ? !take[s.id] : !!take[s.id])));
  const PAGE = 10, pages = Math.max(1, Math.ceil(list.length / PAGE));
  page = Math.min(page, pages - 1);
  const pageItems = list.slice(page * PAGE, page * PAGE + PAGE);

  const addBtn = after => owner && summaryEdit && !filtering ? `<div class="sum-add"><button class="link" data-act="addpause" data-after="${after}">＋ Add pause here</button></div>` : "";
  const itemHTML = s => {
    if (s.kind === "pause") return `<div class="sum-pause" data-item="${s.id}">${ICON_PAUSE}<span>Pause</span>${owner && summaryEdit
      ? `<label class="inl">seconds <input type="number" min="0.1" max="60" step="0.1" value="${s.pause_ms / 1000}" data-pause="${s.id}"></label>
         <button class="link" data-act="pup" data-id="${s.id}">Move up</button><button class="link" data-act="pdown" data-id="${s.id}">Move down</button><button class="link" data-act="delpause" data-id="${s.id}">Remove</button>`
      : `<span>${s.pause_ms / 1000} s</span>`}</div>${addBtn(s.id)}`;
    const a = byId[s.assignee_id], t = take[s.id], canRec = owner || a?.user_id === uid, i = real.indexOf(s);
    return `<article id="section-${s.id}" class="sum-item" data-sec="${s.id}" data-item="${s.id}" style="--c:${a?.color || "#d5dbd9"}">
      <div class="row"><span class="sum-title"><span class="ico ${t ? "done" : "pending"}">${t ? ICON_DONE : ICON_PENDING}<span class="sr">${t ? "Recorded" : "Pending"}</span></span> <strong>${esc(s.title)}</strong></span>
      <span class="muted">${a ? `<span class="dot" style="--c:${a.color}"></span>${esc(a.display_name)}` : "Unassigned"}</span></div>
      ${s.body ? `<div class="script">${esc(s.body)}</div>` : ""}
      ${owner ? `<label>Assigned to<select data-assign="${s.id}"><option value="">Nobody</option>${members.map(m => `<option value="${m.id}" ${m.id === s.assignee_id ? "selected" : ""}>${esc(m.display_name)}</option>`).join("")}</select></label>` : ""}
      ${t ? `<div class="take"><button data-act="play" data-path="${esc(t.storage_path)}" data-total="${clock(t.duration_ms)}" data-label="Play take (${clock(t.duration_ms)})">Play take (${clock(t.duration_ms)})</button>
        ${owner || t.uploader_id === uid ? `<button class="link" data-act="deltake">Delete take</button>` : ""}<audio hidden></audio></div>` : ""}
      ${canRec ? `<div data-rec data-has="${t ? 1 : 0}">${idleHTML(!!t)}</div>` : ""}
      ${canRec && !owner ? `<details class="edit"><summary>Edit text</summary><form data-form="edittext" data-id="${s.id}">
        <label>Script text<textarea name="body" rows="6" maxlength="20000" required>${esc(s.body)}</textarea></label>
        <p class="muted">Changing the text deletes your current take for this section.</p>
        <div class="actions"><button class="primary">Save text</button></div></form></details>` : ""}
      ${owner ? `<details class="edit"><summary>Edit section</summary><form data-form="editsec" data-id="${s.id}">
        <label>Title<input name="title" value="${esc(s.title)}" maxlength="100" required></label>
        <label>Script text<textarea name="body" rows="6" maxlength="20000">${esc(s.body)}</textarea></label>
        <p class="muted">Changing the script text deletes this section's current take.</p>
        <div class="actions"><button class="primary">Save changes</button>
        <button type="button" data-act="up" ${i === 0 ? "disabled" : ""}>Move up</button><button type="button" data-act="down" ${i === real.length - 1 ? "disabled" : ""}>Move down</button>
        <button type="button" class="link" data-act="delsec">Delete section</button></div></form></details>` : ""}</article>${addBtn(s.id)}`;
  };

  view.innerHTML = `<button class="link" data-act="home">‹ All projects</button>
  <div class="row"><h2>${esc(p.name)}</h2><div class="actions"><a class="button-link" href="#p-${id}/scripts" data-act="scripts">Scripts</a><button id="people-btn" data-act="people" aria-expanded="${peopleOpen}" aria-controls="drawer">People (${members.length})</button></div></div>
  <p class="muted">${done} of ${real.length} sections recorded</p>
  <div class="drawer-back ${peopleOpen ? "open" : ""}" data-act="people-close"></div>
  <aside id="drawer" class="drawer ${peopleOpen ? "open" : ""}" aria-label="People" ${peopleOpen ? "" : "inert"}>
  <div class="row"><h3>People</h3><button data-act="people-close" aria-label="Close people panel">✕</button></div><ul>${members.map(m => `<li><span class="dot" style="--c:${m.color}"></span>${esc(m.display_name)} <span class="muted">${m.role}</span>
    ${owner && m.role === "cast" ? `<button class="link" data-act="remove" data-id="${m.id}" data-name="${esc(m.display_name)}">Remove</button>` : ""}
    ${m.user_id === uid && m.role === "cast" ? `<button class="link" data-act="leave" data-id="${m.id}">Leave project</button>` : ""}</li>`).join("")}</ul>
  ${me ? `<details class="edit"><summary>Your name and color</summary><form data-form="profile" data-id="${me.id}">
    <label>Name<input name="name" value="${esc(me.display_name)}" maxlength="50" required></label>
    <label>Highlight color<input name="color" type="color" value="${esc(me.color)}"></label>
    <div class="actions"><button class="primary">Save</button></div></form></details>` : ""}
  ${owner ? `<details class="edit"><summary>Invite codes</summary>
    <label>Code is valid for<select id="inv-hours"><option value="24">1 day</option><option value="168" selected>7 days</option><option value="720">30 days</option></select></label>
    <div class="actions"><button data-act="invite" data-id="${id}">Create invite code</button></div><p id="invite-out"></p>
    <p class="muted">Codes can't be shown again after you leave this screen. Revoke any you no longer need.</p><ul id="invite-list"></ul></details>` : ""}</aside>
  <div class="panel"><div class="actions"><button class="primary" id="pa-go" data-act="playall">▶ Play all recorded</button><button id="pa-stop" data-act="stopplay" hidden>■ Stop</button>
    ${owner ? `<button data-act="sumedit" aria-pressed="${summaryEdit}">Edit pauses</button>` : ""}</div>
    <p id="pa-status" class="muted" role="status"></p><audio id="pa-audio" hidden></audio>
    ${real.length ? `<div class="filters">
      <label>Cast<select data-filter="cast"><option value="all">Everyone</option>${members.map(m => `<option value="${m.id}" ${castFilter === m.id ? "selected" : ""}>${esc(m.display_name)}</option>`).join("")}<option value="none" ${castFilter === "none" ? "selected" : ""}>Unassigned</option></select></label>
      <label>Status<select data-filter="status"><option value="all">All</option><option value="pending" ${statusFilter === "pending" ? "selected" : ""}>Pending recording</option><option value="recorded" ${statusFilter === "recorded" ? "selected" : ""}>Recorded</option></select></label></div>` : ""}
    ${owner && summaryEdit && filtering ? `<p class="muted">Clear the filters to add or move pauses.</p>` : ""}</div>
  ${page === 0 ? addBtn("start") : ""}
  ${pageItems.map(itemHTML).join("") || `<p class="muted">${real.length ? "No sections match these filters." : "No sections yet."}</p>`}
  ${pages > 1 ? `<div class="pager"><button data-act="page" data-v="-1" ${page === 0 ? "disabled" : ""}>‹ Previous</button><span class="muted">Page ${page + 1} of ${pages}</span><button data-act="page" data-v="1" ${page >= pages - 1 ? "disabled" : ""}>Next ›</button></div>` : ""}
  ${owner ? `<details class="panel edit"><summary>Project settings</summary><div class="danger-box"><h3>Delete this project</h3><p class="muted">Permanently deletes the sections and every recording, for everyone. This can't be undone.</p>
    <form data-form="delproject" data-name="${esc(p.name)}"><label for="dc">Type the project name to confirm</label><input id="dc" name="confirm" autocomplete="off" required>
    <div class="actions"><button class="rec">Delete project</button></div></form></div></details>` : ""}`;
  if (owner) await drawInvites(id);
  if (sectionId) document.getElementById(`section-${sectionId}`)?.scrollIntoView();
}

async function renderScripts(id) {
  stopPlay();
  currentProject = id; setUrl(id, "scripts");
  const uid = (await db.auth.getUser()).data.user.id;
  const [p, members, scripts, sections] = await Promise.all([
    db.from("projects").select("id,name").eq("id", id).single().then(must),
    db.from("members").select("id,user_id,role").eq("project_id", id).then(must),
    db.from("scripts").select("id,title,source_name,source_text,created_at").eq("project_id", id).order("created_at").then(must),
    db.from("sections").select("id,title,body,script_id,script_position").eq("project_id", id).not("script_id", "is", null).order("script_position").then(must),
  ]);
  const owner = members.some(m => m.user_id === uid && m.role === "owner");
  const grouped = sections.reduce((out, s) => ((out[s.script_id] ||= []).push(s), out), {});
  view.innerHTML = `<div class="row"><h2>${esc(p.name)} scripts</h2><a class="button-link" href="#p-${id}" data-act="open-project">‹ Record sections</a></div>
  <p class="muted">Script sections show the current text; edits on the recording page appear here. The original import is kept for reference.</p>
  ${owner ? `<div class="panel"><h3>Import a script</h3><form data-form="import">
    <label for="script-title">Script name</label><input id="script-title" name="title" maxlength="100" value="Imported script" required>
    <label for="script">Paste your script, or load a .txt file<textarea id="script" name="text" rows="8" placeholder="Paste script here…"></textarea></label>
    <input type="hidden" name="source_name" value="Pasted text"><input type="file" accept=".txt,text/plain">
    <p class="muted">Put the cursor where a new section should start and tap Insert split. Sections are cut at lines containing only ---</p>
    <div class="actions"><button type="button" data-act="splitmark">Insert split</button><button class="primary">Save script and create sections</button></div></form></div>
  <div class="panel"><h3>Add a section</h3><form data-form="section"><label for="st">Title (optional)</label><input id="st" name="title" maxlength="100" placeholder="Section name">
    <label for="sb">Script text</label><textarea id="sb" name="body" rows="4" maxlength="20000" required></textarea>
    <div class="actions"><button class="primary">Add section</button></div></form></div>` : ""}
  ${scripts.length ? scripts.map(script => `<article class="panel"><h3>${esc(script.title)}</h3>
    <p class="muted">${esc(script.source_name)} · Imported ${esc(new Date(script.created_at).toLocaleDateString())}</p>
    ${(grouped[script.id] || []).length ? (grouped[script.id] || []).map(s => `<section class="script-part">
      <h4><a href="#p-${id}/section-${s.id}" data-act="open-section">${esc(s.title)} ↗</a></h4><div class="script">${esc(s.body)}</div></section>`).join("") : `<p class="muted">No sections remain linked to this script.</p>`}
    <details><summary>Original imported text</summary><pre class="source-text">${esc(script.source_text)}</pre></details></article>`).join("") : `<p class="muted">No imported scripts yet.</p>`}`;
}

// ---------- Actions ----------
view.addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target, d = Object.fromEntries(new FormData(f)), mode = e.submitter?.value;
  guard(async () => {
    if (f.dataset.form === "auth") {
      const email = toEmail(d.user);
      const r = mode === "signup" ? await db.auth.signUp({ email, password: d.pw }) : await db.auth.signInWithPassword({ email, password: d.pw });
      if (r.error) {
        if (/invalid login/i.test(r.error.message)) throw new Error("Username or password is incorrect.");
        if (/already registered/i.test(r.error.message)) throw new Error("That username is taken. Pick another, or sign in.");
        throw r.error;
      }
      if (mode === "signup" && !r.data.session) say("Account created, but Supabase is still asking for email confirmation. Turn off 'Confirm email' (see SETUP.md), then sign in.", true);
    } else if (f.dataset.form === "new") {
      const p = must(await db.from("projects").insert({ name: d.name }).select("id").single());
      must(await db.from("sections").insert({ project_id: p.id, title: "Test clip", position: 0 }));
      await renderProject(p.id);
    } else if (f.dataset.form === "join") {
      currentProject = must(await db.rpc("redeem_invite", { p_code: d.code, p_name: d.name }));
      await renderProject(currentProject);
    } else if (f.dataset.form === "delproject") {
      if (d.confirm.trim() !== f.dataset.name) throw new Error("That doesn't match the project name. Nothing was deleted.");
      await deleteProject(currentProject);
    } else if (f.dataset.form === "import") {
      const parts = d.text.split(/^[ \t]*---[ \t]*$/m).map(x => x.trim()).filter(Boolean);
      if (!parts.length) throw new Error("Paste or load some script text first.");
      if (new Blob([d.text]).size > 200000) throw new Error("That script is too large (200 KB max).");
      if (parts.some(body => body.length > 20000)) throw new Error("Each section must be no more than 20,000 characters.");
      must(await db.rpc("import_script", {
        p_project: currentProject, p_title: d.title.trim(), p_source_name: d.source_name,
        p_source_text: d.text, p_sections: parts,
      }));
      await renderScripts(currentProject); say(`${parts.length} section${parts.length > 1 ? "s" : ""} created and saved.`);
    } else if (f.dataset.form === "editsec" || f.dataset.form === "edittext") {
      if (rec) throw new Error("Finish or discard your recording first.");
      const id = f.dataset.id, newBody = d.body.trim();
      const cur = must(await db.from("sections").select("title,body").eq("id", id).single());
      const changed = newBody !== (cur.body || "").trim();
      let had = false;
      if (changed) {
        had = must(await db.from("recordings").select("id").eq("section_id", id).eq("is_current", true)).length > 0;
        if (had && !confirm("Changing the text will delete the current take for this section, and it will need to be recorded again. Continue?")) return;
        await removeTakes(id, true);                                           // audio first; stops here if a file can't be deleted
        must(await db.rpc("update_section_text", { p_section: id, p_body: newBody }));   // saves text and retires any take left over
      }
      if (f.dataset.form === "editsec" && d.title.trim() !== cur.title)
        must(await db.from("sections").update({ title: d.title.trim() }).eq("id", id).select("id"));
      await renderProject(currentProject);
      say(changed ? (had ? "Text saved. The take was deleted, so this section needs recording again." : "Text saved.") : "Section saved.");
    } else if (f.dataset.form === "profile") {
      must(await db.from("members").update({ display_name: d.name.trim(), color: d.color }).eq("id", f.dataset.id).select("id"));
      await renderProject(currentProject); say("Saved.");
    } else if (f.dataset.form === "section") {
      const n = await sectionCount(currentProject);
      must(await db.from("sections").insert({ project_id: currentProject, position: await nextPos(currentProject), title: d.title.trim() || `Section ${n + 1}`, body: d.body.trim() }));
      await renderProject(currentProject);
    }
  });
});

view.addEventListener("change", e => {
  if (e.target.type === "file") {
    const file = e.target.files[0]; if (!file) return;
    return guard(async () => {
      if (file.size > 200000) throw new Error("That file is too large for a script (200 KB max).");
      $("#script").value = await file.text();
      $('input[name="source_name"]').value = file.name;
      $("#script-title").value = file.name.replace(/\.txt$/i, "").slice(0, 100) || "Imported script";
    });
  }
  if (e.target.dataset.filter) {
    const which = e.target.dataset.filter;
    return guard(async () => {
      try { busy(); } catch (err) { e.target.value = which === "cast" ? castFilter : statusFilter; throw err; }
      if (which === "cast") castFilter = e.target.value; else statusFilter = e.target.value;
      page = 0; await renderProject(currentProject);
    });
  }
  if (e.target.dataset.pause) {
    const v = parseFloat(e.target.value), id = e.target.dataset.pause;
    return guard(async () => {
      if (!(v >= 0.1 && v <= 60)) throw new Error("A pause can be 0.1 to 60 seconds.");
      must(await db.from("sections").update({ pause_ms: Math.round(v * 1000) }).eq("id", id).select("id"));
      const it = summary.items.find(i => i.id === id); if (it) it.pause_ms = Math.round(v * 1000);
      say("Pause saved.");
    });
  }
  const sid = e.target.dataset.assign; if (!sid) return;
  guard(async () => { must(await db.from("sections").update({ assignee_id: e.target.value || null }).eq("id", sid)); await renderProject(currentProject); });
});

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, sec = b.closest("[data-sec]")?.dataset.sec;
  if (act === "scripts" || act === "open-project" || act === "open-section") {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
  }
  guard(async () => {
    if (act === "togglepw") {
      const i = b.parentElement.querySelector("input"), show = i.type === "password";
      i.type = show ? "text" : "password"; b.innerHTML = show ? EYE_OFF : EYE;
      b.setAttribute("aria-pressed", show); b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    }
    else if (act === "remove" || act === "leave") {
      const msg = act === "leave" ? "Leave this project? Your saved takes stay in it unless the owner deletes them." : `Remove ${b.dataset.name} from this project? Their saved takes stay.`;
      if (!confirm(msg)) return;
      const r = must(await db.from("members").delete().eq("id", b.dataset.id).select("id"));
      if (!r.length) throw new Error("Couldn't remove that person.");
      if (act === "leave") { currentProject = null; await renderHome(); say("You left the project."); } else await renderProject(currentProject);
    }
    else if (act === "signout") { cancelRec(); await db.auth.signOut(); }
    else if (act === "open") await renderProject(b.dataset.id);
    else if (act === "home") { cancelRec(); currentProject = null; await renderHome(); }
    else if (act === "invite") {
      const c = must(await db.rpc("create_invite", { p_project: b.dataset.id, p_hours: Number($("#inv-hours").value) }));
      $("#invite-out").innerHTML = `Share this code directly with one person:<br><span class="code">${esc(c)}</span>`; await drawInvites(currentProject);
    }
    else if (act === "revoke") { must(await db.rpc("revoke_invite", { p_id: b.dataset.id })); await drawInvites(currentProject); }
    else if (act === "people") setPeople(!peopleOpen);
    else if (act === "people-close") setPeople(false);
    else if (act === "page") { busy(); page = Math.max(0, page + Number(b.dataset.v)); await renderProject(currentProject); scrollTo(0, 0); }
    else if (act === "scripts") { busy(); await renderScripts(currentProject); }
    else if (act === "open-project") await renderProject(currentProject);
    else if (act === "open-section") await renderProject(currentProject, b.hash.match(/section-([0-9a-f-]{36})$/i)[1].toLowerCase());
    else if (act === "playall") await playAll();
    else if (act === "playfrom") await playAll(b.dataset.id);
    else if (act === "stopplay") stopPlay();
    else if (act === "sumedit") { busy(); summaryEdit = !summaryEdit; await renderProject(currentProject); }
    else if (act === "addpause") await insertPause(b.dataset.after);
    else if (act === "pup" || act === "pdown") await moveItem(b.dataset.id, act === "pup" ? -1 : 1, false);
    else if (act === "delpause") { must(await db.from("sections").delete().eq("id", b.dataset.id).select("id")); await renderProject(currentProject); }
    else if (act === "splitmark") {
      const t = $("#script"), i = t.selectionStart ?? t.value.length;
      t.value = t.value.slice(0, i).replace(/[ \t]+$/, "") + "\n---\n" + t.value.slice(i).replace(/^\s+/, ""); t.focus();
    }
    else if (act === "up" || act === "down") await moveItem(sec, act === "up" ? -1 : 1, true);
    else if (act === "delsec") {
      if (!confirm("Delete this section and all of its recordings? This can't be undone.")) return;
      await removeTakes(sec, true); must(await db.from("sections").delete().eq("id", sec));
      await renderProject(currentProject); say("Section deleted.");
    }
    else if (act === "play") {
      stopPlay();
      const a = b.parentElement.querySelector("audio");
      document.querySelectorAll("audio").forEach(o => { if (o !== a) o.pause(); });
      if (a.src && !a.paused) { a.pause(); return; }
      if (!a.src) {
        a.src = b.dataset.src || must(await db.storage.from("recordings").createSignedUrl(b.dataset.path, 300)).signedUrl;
        const total = b.dataset.total, base = b.dataset.label;
        a.ontimeupdate = () => { b.textContent = `Pause (${clock(a.currentTime * 1000)} of ${total})`; };
        a.onpause = () => { if (!a.ended) b.textContent = `Resume (${clock(a.currentTime * 1000)} of ${total})`; };
        a.onended = () => { a.currentTime = 0; b.textContent = base; };
      }
      await a.play();
    }
    else if (act === "deltake") {
      if (!confirm("Delete this take? The section goes back to Not recorded. This can't be undone.")) return;
      await deleteTakes(sec);
    }
    else if (act === "record") await startRec(sec);
    else if (act === "stop") stopRec();
    else if (act === "discard") { cancelRec(); drawIdle(sec); }
    else if (act === "save") await saveRec();
  });
});

// ---------- Deleting ----------
async function removeTakes(sectionId, allowEmpty = false) {
  // Removes the section's takes you're allowed to delete (owner: all; cast: their own), audio first.
  const uid = (await db.auth.getUser()).data.user.id;
  let rows = must(await db.from("recordings").select("id,storage_path,uploader_id").eq("section_id", sectionId));
  if (!must(await db.rpc("is_owner", { pid: currentProject }))) rows = rows.filter(r => r.uploader_id === uid);
  if (!rows.length) { if (allowEmpty) return; throw new Error("There's nothing here you can delete."); }
  const paths = rows.map(r => r.storage_path);
  const gone = must(await db.storage.from("recordings").remove(paths));
  if (gone.length < paths.length) throw new Error("Couldn't delete all of the audio, so nothing was deleted. Try again.");
  must(await db.from("recordings").delete().in("id", rows.map(r => r.id)));
}
async function deleteTakes(sectionId) { await removeTakes(sectionId); await renderProject(currentProject); say("Take deleted."); }
async function deleteProject(id) {
  cancelRec();
  const takes = must(await db.from("recordings").select("storage_path").eq("project_id", id));   // includes old takes
  const backs = must(await db.from("backing_tracks").select("storage_path").eq("project_id", id));
  for (const [bucket, rows] of [["recordings", takes], ["backing", backs]]) {
    const paths = rows.map(r => r.storage_path);
    for (let i = 0; i < paths.length; i += 100) must(await db.storage.from(bucket).remove(paths.slice(i, i + 100)));
  }
  must(await db.from("projects").delete().eq("id", id));   // sections, members, recordings, invites cascade
  currentProject = null; await renderHome(); say("Project deleted.");
}

// ---------- Recording ----------
const idleHTML = has => `<div class="actions"><button class="rec" data-act="record">${has ? "Record a new take" : "Record"}</button></div>
  <p class="muted">${has ? "The current take stays until your new one is saved. " : ""}Up to ${MAX_SECONDS / 60} minutes. Headphones recommended.</p>`;
const panelFor = sid => $(`[data-sec="${sid}"] [data-rec]`);
const drawIdle = sid => { const p = panelFor(sid); if (p) p.innerHTML = idleHTML(p.dataset.has === "1"); };

function drawPanel() {
  const p = panelFor(rec.sid); if (!p) return;
  p.innerHTML = rec.blob
    ? `<div class="take"><button data-act="play" data-src="${rec.url}" data-total="${clock(rec.durationMs)}" data-label="Play preview (${clock(rec.durationMs)})">Play preview (${clock(rec.durationMs)})</button><audio hidden></audio></div><p class="muted">Listen, then save or discard.</p>
       <div class="actions"><button class="primary" data-act="save">Save take</button><button data-act="discard">Discard</button></div>`
    : `<p><span class="clock" data-clock>0:00</span> recording…</p><div class="actions"><button class="rec" data-act="stop">Stop</button></div>`;
}

async function startRec(sid) {
  if (rec) throw new Error("Finish or discard the current recording first.");
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("This browser can't record audio. Try current Safari or Chrome.");
  const mime = MIMES.find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error("This browser has no supported audio recording format.");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { throw new Error(e.name === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser settings, then try again." : "No microphone could be opened."); }
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  rec = { sid, recorder, stream, mime, chunks: [], t0: Date.now(), blob: null };
  recorder.ondataavailable = e => e.data.size && rec.chunks.push(e.data);
  recorder.onstop = finishRec;
  recorder.onerror = () => { say("Recording was interrupted.", true); const s = rec?.sid; cancelRec(); s && drawIdle(s); };
  stream.getTracks().forEach(t => t.onended = stopRec);   // e.g. a phone call takes the mic
  recorder.start(1000);
  rec.timer = setInterval(() => {
    const ms = Date.now() - rec.t0, c = $("[data-clock]"); if (c) c.textContent = clock(ms);
    if (ms >= MAX_SECONDS * 1000) stopRec();
  }, 250);
  drawPanel();
}
function stopRec() {
  if (rec?.recorder.state === "recording") { rec.stopAt ??= Date.now(); rec.recorder.stop(); }
}
async function finishRec() {
  const r = rec; if (!r || r.blob) return;
  clearInterval(r.timer); r.stream.getTracks().forEach(t => t.stop());
  const fail = msg => { say(msg, true); rec = null; drawIdle(r.sid); };
  const blob = new Blob(r.chunks, { type: r.mime.split(";")[0] });
  if (!blob.size) return fail("Nothing was recorded.");
  if (blob.size > MAX_BYTES) return fail(`That take is over the ${MAX_BYTES / 1048576} MB limit. Try a shorter take.`);
  r.durationMs = (r.stopAt ?? Date.now()) - r.t0;         // timer estimate...
  try {                                                     // ...replaced by the real audio length when the browser can decode it
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer()); ctx.close();
    if (buf.duration > 0) r.durationMs = Math.round(buf.duration * 1000);
  } catch (e) { console.warn("Could not measure audio length; using timer", e); }
  if (rec !== r) return;                                    // discarded while measuring
  r.blob = blob; r.url = URL.createObjectURL(blob); drawPanel();
}
function cancelRec() {
  if (!rec) return;
  clearInterval(rec.timer); rec.recorder.onstop = null;
  if (rec.recorder.state !== "inactive") rec.recorder.stop();
  rec.stream.getTracks().forEach(t => t.stop()); if (rec.url) URL.revokeObjectURL(rec.url); rec = null;
}

async function saveRec() {
  if (!rec?.blob) return;
  const btn = $("[data-act=save]"); btn.disabled = true; btn.textContent = "Uploading…";
  const type = rec.blob.type, ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  const path = `${currentProject}/${rec.sid}/${crypto.randomUUID()}.${ext}`;
  try {
    const up = await db.storage.from("recordings").upload(path, rec.blob, { contentType: type, upsert: false });
    if (up.error) throw up.error;
    const r = await db.rpc("save_take", { p_section: rec.sid, p_path: path, p_mime: type, p_duration: Math.max(1, rec.durationMs), p_size: rec.blob.size });
    if (r.error) { await db.storage.from("recordings").remove([path]); throw r.error; }   // don't leave orphans
  } catch (e) {
    btn.disabled = false; btn.textContent = "Save take";   // keep the local take so the user can retry; old take untouched
    throw new Error(`Couldn't save your take: ${e.message}. Your recording is still here; try again.`);
  }
  cancelRec(); await renderProject(currentProject); say("Take saved.");
}

window.addEventListener("offline", () => say("You're offline. Recording and saving need a connection.", true));
window.addEventListener("online", () => say(""));
guard(route);
