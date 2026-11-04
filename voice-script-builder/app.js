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
async function route() {
  const { data: { session } } = await db.auth.getSession();
  $("#who").innerHTML = session ? `${esc((session.user.email || "").split("@")[0])} <button class="link" data-act="signout" style="color:#fff">Sign out</button>` : "";
  if (!session) return renderAuth();
  return currentProject ? renderProject(currentProject) : renderHome();
}
db.auth.onAuthStateChange((ev, session) => {
  const uid = session?.user?.id ?? null;
  if (uid === lastUid) return;           // ignore token refreshes so a recording is never interrupted
  lastUid = uid; if (!uid) currentProject = null;
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
  const projects = must(await db.from("projects").select("id,name").order("created_at"));
  view.innerHTML = `<h2>Your projects</h2>
  ${projects.length ? `<div class="panel"><ul>${projects.map(p => `<li><button class="link" data-act="open" data-id="${p.id}">${esc(p.name)}</button></li>`).join("")}</ul></div>` : `<p class="muted">No projects yet. Create one or join with an invite code.</p>`}
  <div class="panel"><h3>New project</h3><form data-form="new"><label for="pn">Project name</label><input id="pn" name="name" maxlength="100" required>
  <div class="actions"><button class="primary">Create project</button></div></form></div>
  <div class="panel"><h3>Join a project</h3><form data-form="join"><label for="jc">Invite code</label><input id="jc" name="code" autocapitalize="characters" required>
  <label for="jn">Your name in this project</label><input id="jn" name="name" maxlength="50" required>
  <div class="actions"><button class="primary">Join project</button></div></form></div>`;
}

async function renderProject(id) {
  currentProject = id;
  const uid = (await db.auth.getUser()).data.user.id;
  const [p, members, sections, takes] = await Promise.all([
    db.from("projects").select("id,name").eq("id", id).single().then(must),
    db.from("members").select("id,user_id,role,display_name,color").eq("project_id", id).then(must),
    db.from("sections").select("id,title,assignee_id").eq("project_id", id).order("position").then(must),
    db.from("recordings").select("section_id,storage_path,duration_ms,uploader_id").eq("project_id", id).eq("is_current", true).then(must),
  ]);
  const me = members.find(m => m.user_id === uid), owner = me?.role === "owner";
  const byId = Object.fromEntries(members.map(m => [m.id, m]));
  const take = Object.fromEntries(takes.map(t => [t.section_id, t]));
  const done = sections.filter(s => take[s.id]).length;
  view.innerHTML = `<button class="link" data-act="home">‹ All projects</button>
  <h2>${esc(p.name)}</h2><p class="muted">${done} of ${sections.length} sections recorded</p>
  <div class="panel"><h3>People</h3><ul>${members.map(m => `<li><span class="dot" style="--c:${m.color}"></span>${esc(m.display_name)} <span class="muted">${m.role}</span>
    ${owner && m.role === "cast" ? `<button class="link" data-act="remove" data-id="${m.id}" data-name="${esc(m.display_name)}">Remove</button>` : ""}
    ${m.user_id === uid && m.role === "cast" ? `<button class="link" data-act="leave" data-id="${m.id}">Leave project</button>` : ""}</li>`).join("")}</ul>
  ${owner ? `<div class="actions"><button data-act="invite" data-id="${id}">Create invite code</button></div><p id="invite-out"></p>` : ""}</div>
  ${sections.map(s => {
    const a = byId[s.assignee_id], t = take[s.id], canRec = owner || a?.user_id === uid;
    return `<article class="panel sec" data-sec="${s.id}" style="--c:${a?.color || "#d5dbd9"}">
    <div class="row"><h3>${esc(s.title)}</h3><span class="tag ${t ? "done" : ""}">${t ? "Recorded" : "Not recorded"}</span></div>
    ${owner ? `<label>Assigned to<select data-assign="${s.id}"><option value="">Nobody</option>${members.map(m => `<option value="${m.id}" ${m.id === s.assignee_id ? "selected" : ""}>${esc(m.display_name)}</option>`).join("")}</select></label>`
            : `<p class="muted">Assigned to ${a ? esc(a.display_name) : "nobody"}</p>`}
    ${t ? `<div class="take"><button data-act="play" data-path="${esc(t.storage_path)}">Play current take (${clock(t.duration_ms)})</button>
      ${owner || t.uploader_id === uid ? `<button class="link" data-act="deltake">Delete take</button>` : ""}<audio controls hidden></audio></div>` : ""}
    ${canRec ? `<div data-rec data-has="${t ? 1 : 0}">${idleHTML(!!t)}</div>` : ""}</article>`;
  }).join("") || `<p class="muted">No sections yet.</p>`}
  ${owner ? `<div class="panel"><h3>Add a section</h3><form data-form="section"><label for="st">Title</label><input id="st" name="title" maxlength="100" required>
  <div class="actions"><button class="primary">Add section</button></div></form></div>` : ""}
  ${owner ? `<div class="panel danger"><h3>Delete this project</h3><p class="muted">Permanently deletes the sections and every recording, for everyone. This can't be undone.</p>
  <form data-form="delproject" data-name="${esc(p.name)}"><label for="dc">Type the project name to confirm</label><input id="dc" name="confirm" autocomplete="off" required>
  <div class="actions"><button class="rec">Delete project</button></div></form></div>` : ""}`;
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
    } else if (f.dataset.form === "section") {
      const { count } = await db.from("sections").select("id", { count: "exact", head: true }).eq("project_id", currentProject);
      must(await db.from("sections").insert({ project_id: currentProject, title: d.title, position: count ?? 0 }));
      await renderProject(currentProject);
    }
  });
});

view.addEventListener("change", e => {
  const sid = e.target.dataset.assign; if (!sid) return;
  guard(async () => { must(await db.from("sections").update({ assignee_id: e.target.value || null }).eq("id", sid)); await renderProject(currentProject); });
});

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, sec = b.closest("[data-sec]")?.dataset.sec;
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
    else if (act === "invite") { const c = must(await db.rpc("create_invite", { p_project: b.dataset.id })); $("#invite-out").innerHTML = `Share this code directly with one person (single use, valid 7 days):<br><span class="code">${esc(c)}</span>`; }
    else if (act === "play") {
      const url = must(await db.storage.from("recordings").createSignedUrl(b.dataset.path, 300)).signedUrl;
      const a = b.parentElement.querySelector("audio"); a.src = url; a.hidden = false; await a.play();
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
async function deleteTakes(sectionId) {
  // Removes the current take and any older takes you're allowed to delete (owner: all; cast: their own).
  const uid = (await db.auth.getUser()).data.user.id;
  let rows = must(await db.from("recordings").select("id,storage_path,uploader_id").eq("section_id", sectionId));
  const owner = must(await db.rpc("is_owner", { pid: currentProject }));
  if (!owner) rows = rows.filter(r => r.uploader_id === uid);
  if (!rows.length) throw new Error("There's nothing here you can delete.");
  const paths = rows.map(r => r.storage_path);
  const gone = must(await db.storage.from("recordings").remove(paths));
  if (gone.length < paths.length) throw new Error("Couldn't delete all of the audio, so the take was kept. Try again.");
  must(await db.from("recordings").delete().in("id", rows.map(r => r.id)));
  await renderProject(currentProject); say("Take deleted.");
}

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
    ? `<audio controls src="${rec.url}"></audio><p class="muted">Take length ${clock(rec.durationMs)}. Listen, then save or discard.</p>
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
function stopRec() { if (rec?.recorder.state === "recording") rec.recorder.stop(); }
function finishRec() {
  if (!rec || rec.blob) return;
  clearInterval(rec.timer); rec.stream.getTracks().forEach(t => t.stop());
  rec.durationMs = Date.now() - rec.t0;
  const blob = new Blob(rec.chunks, { type: rec.mime.split(";")[0] });
  if (!blob.size) { say("Nothing was recorded.", true); const s = rec.sid; rec = null; return drawIdle(s); }
  if (blob.size > MAX_BYTES) { say(`That take is over the ${MAX_BYTES / 1048576} MB limit. Try a shorter take.`, true); const s = rec.sid; rec = null; return drawIdle(s); }
  rec.blob = blob; rec.url = URL.createObjectURL(blob); drawPanel();
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
  cancelRec(); say("Take saved."); await renderProject(currentProject);
}

window.addEventListener("offline", () => say("You're offline. Recording and saving need a connection.", true));
window.addEventListener("online", () => say(""));
guard(route);
