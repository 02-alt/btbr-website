/* Curation Studio — Notebook: a loose writing space before something is a topic.
   Notes live in a PRIVATE GitHub repo (02-alt/btbr-notebook) as plain Markdown files, so they're readable
   anywhere, kept forever (every sync is a commit) and the same on every device. A copy stays in this browser:
   typing never waits for the network, and a note written offline syncs when it can.

   A note's file:   notes/<id>.md   — a little front matter, then blocks separated by a blank line:
     a paragraph        Plain text, **bold**, *italic*, ==an idea==, [a link](https://…)
     a link card        a line that is only [Title](https://…)
     a picture          ![caption](media/<file>)
     sent to a topic    the block ends with  <!--sent-->
   index.json lists the notes (title, dates, size) so the sidebar needs one request. */
(function () {
  "use strict";

  var REPO = "02-alt/btbr-notebook", BRANCH = "main", TOKEN_KEY = "btbr_cur_token", LOCAL = "btbr_nb_v1";
  var API = "https://api.github.com";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var now = function () { return new Date().toISOString(); };
  var nid = function () { var d = new Date(); return d.toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 7); };

  /* ---------- state: in this browser first ---------- */
  var db = { notes: {}, dirty: {}, gone: {} };   // notes[id] = { id, title, created, updated, body }
  try { var raw = localStorage.getItem(LOCAL); if (raw) db = Object.assign(db, JSON.parse(raw)); } catch (e) {}
  function keep() { try { localStorage.setItem(LOCAL, JSON.stringify(db)); } catch (e) {} }
  var open = null, built = false, syncing = false, syncAgain = false, syncTimer = 0, lastSync = 0, problem = "";
  var pics = {};          // media path → blob URL (fetched from the repo, or just dropped in)
  var pending = {};       // media path → { blob } waiting to be uploaded

  /* ---------- GitHub ---------- */
  function token() { return (localStorage.getItem(TOKEN_KEY) || "").trim(); }
  function gh(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "Authorization": "Bearer " + token(), "Accept": "application/vnd.github+json" }, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      if (!r.ok) { var e = new Error(r.status === 404 || r.status === 403 ? "no-access" : "GitHub " + r.status); e.status = r.status; throw e; }
      return r.status === 204 ? null : (opts.raw ? r.blob() : r.json());
    });
  }
  function b64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function unb64(s) { return decodeURIComponent(escape(atob(String(s).replace(/\n/g, "")))); }
  function blobB64(blob) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.readAsDataURL(blob); }); }
  function readFile(path) { return gh("/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH, { cache: "no-store" }).then(function (d) { return unb64(d.content); }); }
  function readPic(path) {
    if (pics[path]) return Promise.resolve(pics[path]);
    return gh("/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH, { raw: true, headers: { "Accept": "application/vnd.github.raw" } })
      .then(function (bl) { return (pics[path] = URL.createObjectURL(bl)); });
  }
  // one commit for everything that changed: notes, pictures, the index — or for deletions
  async function commit(files, gone, message) {
    var ref = await gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH, { cache: "no-store" });
    var base = await gh("/repos/" + REPO + "/git/commits/" + ref.object.sha);
    var tree = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i], blob = await gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: JSON.stringify(f.base64 ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" }) });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    gone.forEach(function (p) { tree.push({ path: p, mode: "100644", type: "blob", sha: null }); });
    var t = await gh("/repos/" + REPO + "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree: tree }) });
    var c = await gh("/repos/" + REPO + "/git/commits", { method: "POST", body: JSON.stringify({ message: message, tree: t.sha, parents: [ref.object.sha] }) });
    await gh("/repos/" + REPO + "/git/refs/heads/" + BRANCH, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
  }

  /* ---------- a note as a file ---------- */
  function noteFile(n) {
    var fm = ["---", "title: " + JSON.stringify(n.title || ""), "created: " + n.created, "updated: " + n.updated, "---", ""].join("\n");
    return fm + (n.body || "").trim() + "\n";
  }
  function parseFile(id, text) {
    var m = /^---\n([\s\S]*?)\n---\n?/.exec(text), n = { id: id, title: "", created: now(), updated: now(), body: text };
    if (m) {
      n.body = text.slice(m[0].length).trim();
      m[1].split("\n").forEach(function (l) { var k = /^(\w+):\s*(.*)$/.exec(l); if (!k) return; var v = k[2]; if (k[1] === "title") { try { v = JSON.parse(v); } catch (e) {} } n[k[1]] = v; });
    }
    return n;
  }
  function blank(n) { return !String(n.body || "").trim() && !String(n.title || "").trim(); }
  function indexOf() {
    return Object.keys(db.notes).filter(function (id) { return !blank(db.notes[id]) || id === open; }).map(function (id) { var n = db.notes[id]; return { id: id, title: shownTitle(n), updated: n.updated, created: n.created, words: words(n.body), links: (n.body.match(/\]\(https?:/g) || []).length }; })
      .sort(function (a, b) { return a.updated < b.updated ? 1 : -1; });
  }
  function words(md) { return (String(md || "").replace(/!\[[^\]]*\]\([^)]*\)|<!--sent-->/g, "").match(/[\p{L}\p{N}’']+/gu) || []).length; }
  function shownTitle(n) {
    if ((n.title || "").trim()) return n.title.trim();
    var first = String(n.body || "").split(/\n\n/).map(function (b) { return b.replace(/<!--sent-->/g, "").trim(); }).filter(function (b) { return b && !/^!\[/.test(b); })[0] || "";
    first = first.replace(/^\[([^\]]*)\]\([^)]*\)$/, "$1").replace(/[*=]/g, "");
    return first ? (first.length > 60 ? first.slice(0, 58).replace(/\s+\S*$/, "") + "…" : first) : "New note";
  }

  /* ---------- sync: push what changed here, pull what changed elsewhere ---------- */
  function soon(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, ms == null ? 2500 : ms); }
  async function sync() {
    if (!token()) { problem = "token"; status(); return; }
    if (syncing) { syncAgain = true; return; }
    syncing = true; status("Syncing…");
    try {
      // pull first: notes changed or deleted on another device (a note being edited here wins)
      var remote = null;
      try { remote = JSON.parse(await readFile("index.json")); }
      catch (e) { if (e.status !== 404) throw e; await gh("/repos/" + REPO); remote = []; }   // no index yet (a new notebook) — if the repo itself answers, that's fine
      var there = {}, changed = false;
      for (var j = 0; j < remote.length; j++) {
        var r = remote[j], mine = db.notes[r.id]; there[r.id] = 1;
        if (db.gone[r.id] || db.dirty[r.id]) continue;
        if (!mine || mine.updated < r.updated) { db.notes[r.id] = parseFile(r.id, await readFile("notes/" + r.id + ".md")); db.notes[r.id].synced = true; changed = true; }
      }
      Object.keys(db.notes).forEach(function (id) { if (db.notes[id].synced && !there[id] && !db.dirty[id]) { delete db.notes[id]; changed = true; if (open === id) open = null; } });
      if (changed) { keep(); list(); if (open && db.notes[open] && document.activeElement !== $("nbDoc")) load(open); if (!open && built) { var f0 = indexOf()[0]; if (f0) load(f0.id); else newNote(true); } }
      // then push what changed here, with the whole index
      var ids = Object.keys(db.dirty).filter(function (id) { return db.notes[id] && !blank(db.notes[id]); }), gone = Object.keys(db.gone), media = Object.keys(pending);
      if (ids.length || gone.length || media.length) {
        var files = [], stamp = {};
        for (var i = 0; i < media.length; i++) files.push({ path: media[i], base64: await blobB64(pending[media[i]]) });
        ids.forEach(function (id) { stamp[id] = db.notes[id].updated; files.push({ path: "notes/" + id + ".md", text: noteFile(db.notes[id]) }); });
        files.push({ path: "index.json", text: JSON.stringify(indexOf(), null, 1) + "\n" });
        await commit(files, gone.filter(function (id) { return there[id]; }).map(function (id) { return "notes/" + id + ".md"; }), "Notebook: " + (ids.length ? ids.map(function (id) { return shownTitle(db.notes[id]); }).join(", ") : "tidy"));
        ids.forEach(function (id) { if (db.notes[id]) { db.notes[id].synced = true; if (db.dirty[id] === stamp[id]) delete db.dirty[id]; } });
        gone.forEach(function (id) { delete db.gone[id]; });
        media.forEach(function (p) { delete pending[p]; });
        keep();
      }
      problem = ""; lastSync = Date.now();
    } catch (e) { problem = e.message === "no-access" ? "access" : "offline"; }
    syncing = false; status();
    if (syncAgain) { syncAgain = false; soon(500); }
  }
  function status(msg) {
    var el = $("nbState"); if (!el) return;
    if (msg) { el.textContent = msg; el.className = "nb-state"; return; }
    if (problem === "token") { el.innerHTML = "Saved on this Mac · <button class='linkbtn' id='nbTokenGo'>add your GitHub token to sync</button>"; el.className = "nb-state warn"; }
    else if (problem === "access") { el.innerHTML = "Saved on this Mac · your token can’t reach <b>btbr-notebook</b> yet — <button class='linkbtn' id='nbHelp'>how to fix</button>"; el.className = "nb-state warn"; }
    else if (problem === "offline") { el.textContent = "Saved on this Mac · will sync when GitHub answers"; el.className = "nb-state warn"; }
    else if (Object.keys(db.dirty).length || Object.keys(pending).length) { el.textContent = "Saved on this Mac · syncing soon"; el.className = "nb-state"; }
    else { el.textContent = lastSync ? "Saved · synced " + ago(lastSync) : "Saved"; el.className = "nb-state"; }
  }
  function ago(t) { var s = Math.round((Date.now() - t) / 1000); return s < 5 ? "just now" : s < 60 ? s + " s ago" : Math.round(s / 60) + " min ago"; }
  setInterval(function () { if (!syncing && built) status(); }, 15000);

  /* ---------- Markdown ⇄ the editor ---------- */
  function inlineToHtml(md) {
    var h = esc(md);
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
    h = h.replace(/==([^=]+)==/g, "<mark>$1</mark>");
    return h.replace(/\n/g, "<br>");
  }
  function inlineToMd(el) {
    var out = "";
    el.childNodes.forEach(function (c) {
      if (c.nodeType === 3) { out += c.nodeValue; return; }
      if (c.nodeType !== 1) return;
      var t = c.tagName, inner = inlineToMd(c);
      if (t === "BR") out += "\n";
      else if (t === "B" || t === "STRONG") out += inner.trim() ? "**" + inner + "**" : inner;
      else if (t === "I" || t === "EM") out += inner.trim() ? "*" + inner + "*" : inner;
      else if (t === "MARK") out += inner.trim() ? "==" + inner + "==" : inner;
      else if (t === "A" && /^https?:/.test(c.getAttribute("href") || "")) out += "[" + inner + "](" + c.getAttribute("href") + ")";
      else if (t === "DIV" || t === "P") out += (out && !/\n$/.test(out) ? "\n" : "") + inner;
      else out += inner;
    });
    return out;
  }
  function blocksOf(md) {   // → [{kind, …, sent}]
    return String(md || "").split(/\n{2,}/).map(function (raw) {
      var sent = /<!--sent-->\s*$/.test(raw), s = raw.replace(/\s*<!--sent-->\s*$/, "").trim(), m;
      if (!s) return null;
      if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(s))) return { kind: "pic", caption: m[1], src: m[2], sent: sent };
      if ((m = /^\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/.exec(s))) return { kind: "card", title: m[1], url: m[2], sent: sent };
      return { kind: "text", md: s, idea: /^==[^=]+==$/.test(s), sent: sent };
    }).filter(Boolean);
  }
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function cardEl(b) {
    var u = safeURL(b.url), host = u ? u.hostname.replace(/^www\./, "") : "";
    var c = el('<div class="nb-card" contenteditable="false"><span class="nb-card-pic"></span><span class="nb-card-txt"><b></b><small></small></span><button class="nb-x" type="button" aria-label="Remove">×</button></div>');
    c.dataset.url = b.url; c.dataset.title = b.title || host;
    c.querySelector("b").textContent = b.title || host; c.querySelector("small").textContent = host;
    c.querySelector(".nb-card-pic").textContent = (host[0] || "·").toUpperCase();
    if (b.sent) c.dataset.sent = "1";
    cardPic(c, b.url);
    return c;
  }
  function picEl(b) {
    var f = el('<figure class="nb-fig" contenteditable="false"><img alt=""><figcaption contenteditable="true"></figcaption><button class="nb-x" type="button" aria-label="Remove">×</button></figure>');
    f.dataset.src = b.src; f.querySelector("figcaption").textContent = b.caption || "";
    f.querySelector("figcaption").setAttribute("data-ph", "A caption…");
    if (b.sent) f.dataset.sent = "1";
    readPic(b.src).then(function (u) { f.querySelector("img").src = u; }).catch(function () { f.classList.add("is-missing"); });
    return f;
  }
  function textEl(b) {
    var p = document.createElement("p"); p.innerHTML = inlineToHtml(b.md);
    if (b.sent) p.dataset.sent = "1";
    return p;
  }
  function docToMd() {
    var out = [];
    $("nbDoc").childNodes.forEach(function (c) {
      if (c.nodeType === 3) { if (c.nodeValue.trim()) out.push(c.nodeValue.trim()); return; }
      if (c.nodeType !== 1) return;
      var sent = c.dataset && c.dataset.sent ? " <!--sent-->" : "", s;
      if (c.classList.contains("nb-card")) s = "[" + (c.dataset.title || "").replace(/[\[\]]/g, "") + "](" + c.dataset.url + ")";
      else if (c.classList.contains("nb-fig")) s = "![" + c.querySelector("figcaption").textContent.replace(/[\[\]\n]/g, " ").trim() + "](" + c.dataset.src + ")";
      else s = inlineToMd(c).replace(/ /g, " ").trim();
      if (s) out.push(s + sent);
    });
    return out.join("\n\n");
  }

  /* ---------- link cards read themselves ---------- */
  function safeURL(u) { try { return new URL(u); } catch (e) { return null; } }
  function ytId(u) { var m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
  var readMemo = {};
  function readLink(url) {   // → { title, image }
    if (readMemo[url]) return readMemo[url];
    var u = safeURL(url), host = u ? u.hostname.replace(/^(www|m)\./, "") : "", id = ytId(url), p;
    if (id) p = fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id)).then(function (r) { return r.json(); })
      .then(function (d) { return { title: d.title, image: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" }; }, function () { return { image: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" }; });
    else if (/wikipedia\.org$/.test(host) && /^\/wiki\//.test(u.pathname)) p = fetch("https://" + u.hostname.replace(/^m\./, "") + "/api/rest_v1/page/summary/" + u.pathname.slice(6)).then(function (r) { return r.json(); })
      .then(function (d) { return { title: d.title + " — Wikipedia", image: d.thumbnail && d.thumbnail.source }; });
    else p = fetch(url).then(function (r) { return r.text(); }).then(function (h) {   // pages that answer cross-origin (Backloggd, many others)
      var d = new DOMParser().parseFromString(h, "text/html"), meta = function (k) { var m = d.querySelector('meta[property="' + k + '"],meta[name="' + k + '"]'); return m && m.content; };
      return { title: meta("og:title") || (d.title || "").trim(), image: meta("og:image") };
    });
    return (readMemo[url] = p.catch(function () { return {}; }));
  }
  function cardPic(c, url) {
    readLink(url).then(function (d) {
      if (d.title && (!c.dataset.title || c.dataset.title === hostOf(url))) { c.dataset.title = d.title; c.querySelector("b").textContent = d.title; saveSoon(); }
      if (d.image) { var s = c.querySelector(".nb-card-pic"); s.textContent = ""; s.style.backgroundImage = "url(" + JSON.stringify(d.image) + ")"; }
    });
  }
  function hostOf(u) { var x = safeURL(u); return x ? x.hostname.replace(/^www\./, "") : ""; }

  /* ---------- the view ---------- */
  function build() {
    if (built) return; built = true;
    var v = $("nbView");
    v.innerHTML =
      '<aside class="nb-side"><div class="nb-side-head"><span class="nb-cap">Notes</span><button class="nb-new" id="nbNew" type="button" title="New note (⌥N)" aria-label="New note">+</button></div><div class="nb-list" id="nbList"></div></aside>' +
      '<div class="nb-main"><div class="nb-top"><span class="nb-state" id="nbState"></span><span class="nb-top-acts"><button class="sbtn quiet" id="nbDel" type="button">Delete</button><button class="sbtn primary" id="nbSend" type="button">Send to a topic</button></span></div>' +
      '<div class="nb-paper"><input class="nb-title" id="nbTitle" placeholder="Title — or just start writing" aria-label="Title" />' +
      '<div class="nb-doc" id="nbDoc" contenteditable="true" spellcheck="true" data-ph="Write. Paste a link and it becomes a card. Drop a photo in. ⌘⇧H marks an idea."></div>' +
      '<div class="nb-foot" id="nbFoot"></div></div></div>' +
      '<div class="nb-modal" id="nbModal" hidden></div>';
    $("nbNew").addEventListener("click", function () { newNote(); });
    $("nbDel").addEventListener("click", delNote);
    $("nbSend").addEventListener("click", sendPanel);
    $("nbTitle").addEventListener("input", function () { if (!open) return; db.notes[open].title = this.value; touched(); });
    var doc = $("nbDoc");
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
    doc.addEventListener("input", function () { tidy(); touched(); });
    doc.addEventListener("paste", onPaste);
    doc.addEventListener("drop", onDrop);
    doc.addEventListener("dragover", function (e) { if (e.dataTransfer && [].some.call(e.dataTransfer.types || [], function (t) { return t === "Files"; })) e.preventDefault(); });
    doc.addEventListener("click", function (e) { var x = e.target.closest(".nb-x"); if (x) { x.parentNode.remove(); ensureP(); touched(); } });
    doc.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "h" || e.key === "H")) { e.preventDefault(); markIdea(); }
    });
    $("nbView").addEventListener("click", function (e) {
      if (e.target.id === "nbTokenGo") document.getElementById("publishBtn").click();
      if (e.target.id === "nbHelp") alert("The Notebook saves to the private repo 02-alt/btbr-notebook.\n\nOn github.com → Settings → Developer settings → Fine-grained tokens, open the token you publish with and add the repository “btbr-notebook” with Contents: Read and write. Then come back — it syncs by itself.\n\nUntil then everything is kept in this browser.");
    });
    document.addEventListener("keydown", function (e) { if (document.body.classList.contains("view-notebook") && e.altKey && (e.key === "n" || e.key === "˜")) { e.preventDefault(); newNote(); } });
    window.addEventListener("beforeunload", function () { if (open) flush(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && open) { flush(); sync(); } });
  }
  function show() {
    build();
    if (!open || !db.notes[open]) { var first = indexOf()[0]; if (first) load(first.id); else newNote(true); }
    list(); status(); sync();
  }
  function list() {
    var box = $("nbList"); if (!box) return;
    var all = indexOf(), today = new Date().toISOString().slice(0, 10), html = "", group = "";
    all.forEach(function (n) {
      var g = n.updated.slice(0, 10) === today ? "Today" : "Earlier";
      if (g !== group) { html += '<div class="nb-group">' + g + "</div>"; group = g; }
      var meta = [n.words + (n.words === 1 ? " word" : " words"), n.links ? n.links + (n.links === 1 ? " link" : " links") : "", g === "Earlier" ? new Date(n.updated).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · ");
      html += '<button class="nb-item' + (n.id === open ? " is-on" : "") + '" data-id="' + n.id + '" type="button"><b>' + esc(n.title) + "</b><small>" + esc(meta) + "</small></button>";
    });
    box.innerHTML = html || '<p class="nb-empty">No notes yet.</p>';
    [].forEach.call(box.querySelectorAll(".nb-item"), function (b) { b.addEventListener("click", function () { if (open) flush(); load(b.dataset.id); list(); }); });
  }
  function load(id) {
    if (open && open !== id && db.notes[open] && blank(db.notes[open])) { if (db.notes[open].synced) db.gone[open] = 1; delete db.notes[open]; delete db.dirty[open]; keep(); }
    open = id; var n = db.notes[id], doc = $("nbDoc");
    $("nbTitle").value = n.title || "";
    doc.innerHTML = "";
    blocksOf(n.body).forEach(function (b) { doc.appendChild(b.kind === "pic" ? picEl(b) : b.kind === "card" ? cardEl(b) : textEl(b)); });
    ensureP(); foot();
  }
  function newNote(quiet) {
    if (open) flush();
    if (open && db.notes[open] && blank(db.notes[open])) { $("nbDoc").focus(); return; }   // already on an empty one
    var id = nid(), t = now();
    db.notes[id] = { id: id, title: "", created: t, updated: t, body: "" };
    keep(); load(id); list();
    if (!quiet) $("nbDoc").focus();
  }
  function delNote() {
    if (!open) return; var n = db.notes[open];
    if (!confirm("Delete “" + shownTitle(n) + "”?\n\nIt stays in the private repo's history, but leaves the Notebook.")) return;
    if (n.synced) db.gone[open] = 1;
    delete db.notes[open]; delete db.dirty[open]; open = null; keep();
    var first = indexOf()[0]; if (first) load(first.id); else newNote(true);
    list(); soon(300);
  }
  // keep the document made of top-level blocks only, and always with somewhere to type
  function ensureP() {
    var doc = $("nbDoc"), last = doc.lastElementChild;
    if (!last || last.tagName !== "P") doc.appendChild(el("<p><br></p>"));
  }
  function tidy() {
    var doc = $("nbDoc");
    [].forEach.call(doc.children, function (c) { if (c.tagName === "DIV" && !c.classList.contains("nb-card")) { var p = document.createElement("p"); p.innerHTML = c.innerHTML; c.replaceWith(p); } });
  }
  var saveT = 0;
  function touched() { clearTimeout(saveT); saveT = setTimeout(flush, 400); }
  function saveSoon() { touched(); }
  function flush() {
    if (!open || !db.notes[open]) return;
    var n = db.notes[open], md = docToMd(), title = $("nbTitle").value;
    if (md === (n.body || "") && title === (n.title || "")) return;
    n.body = md; n.title = title; n.updated = now(); db.dirty[open] = n.updated;
    keep(); foot(); list(); status(); soon();
  }
  function foot() {
    var n = db.notes[open]; if (!n) return; var w = words(n.body);
    $("nbFoot").textContent = w + (w === 1 ? " word" : " words") + " · " + Math.max(1, Math.round(w / 220)) + " min read · edited " + new Date(n.updated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  function currentBlock() {
    var s = window.getSelection(); if (!s.rangeCount) return null;
    var n = s.getRangeAt(0).startContainer; while (n && n.parentNode !== $("nbDoc")) n = n.parentNode;
    return n && n.parentNode === $("nbDoc") ? n : null;
  }
  function insertAfterCurrent(node) {
    var at = currentBlock(), doc = $("nbDoc");
    if (at && at.tagName === "P" && !at.textContent.trim() && !at.querySelector("img")) at.replaceWith(node);
    else if (at) at.after(node); else doc.appendChild(node);
    if (!node.nextElementSibling) doc.appendChild(el("<p><br></p>"));
    var next = node.nextElementSibling; if (next && next.tagName === "P") { var r = document.createRange(); r.setStart(next, 0); r.collapse(true); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    touched();
  }
  function onPaste(e) {
    var cd = e.clipboardData; if (!cd) return;
    var f = [].filter.call(cd.files || [], function (x) { return /^image\//.test(x.type); })[0];
    if (f) { e.preventDefault(); addPic(f); return; }
    var text = cd.getData("text/plain") || "";
    e.preventDefault();
    if (/^https?:\/\/\S+$/.test(text.trim())) { insertAfterCurrent(cardEl({ url: text.trim(), title: "" })); return; }
    document.execCommand("insertText", false, text);   // words only — no fonts or colours from elsewhere
  }
  function onDrop(e) {
    var fs = [].filter.call((e.dataTransfer && e.dataTransfer.files) || [], function (x) { return /^image\//.test(x.type); });
    if (fs.length) { e.preventDefault(); fs.forEach(addPic); return; }
    var u = e.dataTransfer && (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"));
    if (u && /^https?:\/\/\S+$/.test(u.trim())) { e.preventDefault(); insertAfterCurrent(cardEl({ url: u.trim(), title: "" })); }
  }
  function addPic(file) {
    var ext = (/image\/(\w+)/.exec(file.type) || [, "jpg"])[1].replace("jpeg", "jpg"), path = "media/" + open + "-" + Math.random().toString(36).slice(2, 7) + "." + ext;
    pics[path] = URL.createObjectURL(file); pending[path] = file;
    insertAfterCurrent(picEl({ src: path, caption: "" }));
    soon(800);
  }
  function markIdea() {
    var s = window.getSelection(); if (!s.rangeCount) return;
    var r = s.getRangeAt(0), mk = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer.closest("mark") : r.commonAncestorContainer.parentNode.closest("mark");
    if (mk) { mk.replaceWith.apply(mk, [].slice.call(mk.childNodes)); touched(); return; }
    if (r.collapsed) { var b = currentBlock(); if (!b || b.tagName !== "P") return; r = document.createRange(); r.selectNodeContents(b); }
    var m = document.createElement("mark");
    try { r.surroundContents(m); } catch (e) { m.appendChild(r.extractContents()); r.insertNode(m); }
    touched();
  }

  /* ---------- Send to a topic: tick the pieces, choose where ---------- */
  var topicsMemo = null;
  function topics() {
    if (!topicsMemo) topicsMemo = Promise.all([
      fetch("/curation/topics/index.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch("/curation/topics/scheduled.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
    ]).then(function (a) {
      var seen = {}, out = [];
      a[1].concat(a[0]).forEach(function (t) { if (t && t.slug && !seen[t.slug]) { seen[t.slug] = 1; out.push({ slug: t.slug, title: t.title || t.slug, when: t.publishAt ? "scheduled" : "live" }); } });
      return out;
    });
    return topicsMemo;
  }
  function sendPanel() {
    flush();
    var n = db.notes[open]; if (!n) return;
    var bl = blocksOf(n.body);
    if (!bl.length) { alert("Write something first."); return; }
    var api = window.StudioAPI, cur = api && api.current();
    var m = $("nbModal"); m.hidden = false;
    m.innerHTML = '<div class="nb-backdrop"></div><div class="nb-sheet" role="dialog" aria-modal="true" aria-label="Send to a topic">' +
      '<h2>Send to a topic</h2><p class="nb-sub">Tick what goes. The rest stays in the note.</p>' +
      '<div class="nb-cap">Into</div><div class="lang-seg nb-into" id="nbInto"><button type="button" data-v="new" aria-pressed="true">A new topic</button><button type="button" data-v="old" aria-pressed="false">An existing one</button></div>' +
      '<select class="insp-input nb-pick" id="nbPick" hidden></select>' +
      '<div class="nb-cap" style="margin-top:14px">What goes</div><div class="nb-pieces" id="nbPieces"></div>' +
      '<div class="nb-row"><button class="linkbtn" id="nbAll" type="button">All</button><button class="linkbtn" id="nbNone" type="button">None</button><span class="nb-count" id="nbCount"></span></div>' +
      '<label class="nb-keep"><input type="checkbox" id="nbKeep" checked> Keep them in the note too, marked “sent”</label>' +
      '<div class="nb-acts"><button class="sbtn" id="nbCancel" type="button">Cancel</button><button class="sbtn primary" id="nbGo" type="button">Send</button></div></div>';
    var box = $("nbPieces");
    bl.forEach(function (b, i) {
      var kind = b.kind === "pic" ? "Image" : b.kind === "card" ? (ytId(b.url) ? "Video" : "Link") : b.idea ? "Idea" : "Text";
      var what = b.kind === "pic" ? (b.caption || "a picture") : b.kind === "card" ? b.title || hostOf(b.url) : b.md.replace(/[*=]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
      var on = !b.idea && !b.sent;
      var row = el('<label class="nb-piece"><input type="checkbox"' + (on ? " checked" : "") + ' data-i="' + i + '"><span class="nb-kind">' + kind + '</span><span class="nb-what">' + esc(what.length > 80 ? what.slice(0, 78) + "…" : what) + (b.sent ? ' <em>sent</em>' : "") + "</span></label>");
      box.appendChild(row);
    });
    var last = -1;
    box.addEventListener("click", function (e) {   // ⇧-click ticks the run between
      var cb = e.target.closest("input"); if (!cb) return; var i = +cb.dataset.i;
      if (e.shiftKey && last >= 0) { var a = Math.min(i, last), z = Math.max(i, last); [].forEach.call(box.querySelectorAll("input"), function (x) { var k = +x.dataset.i; if (k >= a && k <= z) x.checked = cb.checked; }); }
      last = i; count();
    });
    function picked() { return [].filter.call(box.querySelectorAll("input"), function (x) { return x.checked; }).map(function (x) { return +x.dataset.i; }); }
    function into() { return $("nbInto").querySelector('[aria-pressed="true"]').dataset.v; }
    function count() {
      var k = picked().length, where = into() === "new" ? "a new topic" : ($("nbPick").selectedOptions[0] || {}).textContent || "…";
      $("nbCount").textContent = k + " of " + bl.length + " · ⇧-click for a run";
      $("nbGo").textContent = k ? "Send " + k + " → " + where.replace(/ · .*$/, "") : "Send";
      $("nbGo").disabled = !k;
    }
    $("nbAll").onclick = function () { [].forEach.call(box.querySelectorAll("input"), function (x) { x.checked = true; }); count(); };
    $("nbNone").onclick = function () { [].forEach.call(box.querySelectorAll("input"), function (x) { x.checked = false; }); count(); };
    $("nbInto").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      [].forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", x === b); });
      $("nbPick").hidden = b.dataset.v !== "old"; count();
    };
    var pick = $("nbPick");
    if (cur && (cur.title || cur.blocks > 1)) pick.appendChild(new Option("Open in Write: " + (cur.title || "Untitled") , "current"));
    topics().then(function (ts) { ts.forEach(function (t) { pick.appendChild(new Option(t.title + " · " + t.when, t.slug)); }); count(); });
    pick.onchange = count;
    var close = function () { m.hidden = true; m.innerHTML = ""; };
    $("nbCancel").onclick = close; m.querySelector(".nb-backdrop").onclick = close;
    $("nbGo").onclick = function () {
      var idx = picked(); if (!idx.length || !api) return;
      this.disabled = true; this.textContent = "Sending…";
      toStudio(idx.map(function (i) { return bl[i]; })).then(function (o) {
        o.title = (n.title || "").trim() || shownTitle(n);
        var go = into() === "new" ? Promise.resolve(api.newTopicFrom(o)) : api.addTo(pick.value, o);
        return go.then(function (ok) {
          if (!ok) { $("nbGo").disabled = false; count(); return; }
          if ($("nbKeep").checked) bl.forEach(function (b, i) { if (idx.indexOf(i) >= 0) b.sent = true; });
          else bl = bl.filter(function (b, i) { return idx.indexOf(i) < 0; });
          n.body = bl.map(mdOf).join("\n\n"); n.updated = now(); db.dirty[open] = n.updated; keep(); soon();
          close(); load(open);
        });
      }).catch(function (e) { alert("Couldn’t send: " + (e && e.message || e)); $("nbGo").disabled = false; count(); });
    };
    count();
  }
  function mdOf(b) {
    var s = b.kind === "pic" ? "![" + (b.caption || "") + "](" + b.src + ")" : b.kind === "card" ? "[" + (b.title || "") + "](" + b.url + ")" : b.md;
    return s + (b.sent ? " <!--sent-->" : "");
  }
  // a note's pieces in the Studio's shape: text blocks, pictures, YouTube as video; other links go to Sources
  function toStudio(pieces) {
    var blocks = [], sources = [], jobs = [];
    pieces.forEach(function (b) {
      if (b.kind === "text") { var h = inlineToHtml(b.md).replace(/<\/?mark>/g, ""); blocks.push({ type: "text", html: h }); }
      else if (b.kind === "card") {
        if (ytId(b.url)) blocks.push({ type: "video", src: b.url, caption: "" });
        else sources.push(((b.title || "").trim() ? b.title.trim() + " " : "") + b.url);
      } else if (b.kind === "pic") {
        var slot = { type: "image", src: "", caption: b.caption || "", alt: b.caption || "", name: b.caption || "" };
        blocks.push(slot);
        jobs.push(readPic(b.src).then(function (u) { return fetch(u).then(function (r) { return r.blob(); }); }).then(function (bl) { slot.src = URL.createObjectURL(bl); }));
      }
    });
    return Promise.all(jobs).then(function () { return { blocks: blocks.filter(function (x) { return x.type !== "image" || x.src; }), sources: sources }; });
  }

  window.Notebook = { show: show, sync: sync };
})();
