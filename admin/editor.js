/* Curation Studio — a minimal block editor (local prototype).
   Blocks: text / image / video. Drag to reorder. Settings in the inspector.
   Publishing is intentionally not wired yet — this is the authoring UX first. */
(function () {
  "use strict";

  var uid = function () { return "b" + Math.random().toString(36).slice(2, 9); };

  var state = {
    title: "",
    fr: { title: "" },
    author: "Isaac",
    cover: null,
    desc: "",
    inspiration: "",
    tone: "",
    song: null,
    themes: [],
    blocks: [
      { id: uid(), type: "text", head: false, html: "Start writing your topic here, then add images and video between the lines." }
    ]
  };
  var editingSlug = null; // set when editing an existing topic so Publish overwrites it

  var blocksEl = document.getElementById("blocks");
  var inspectorEl = document.getElementById("inspector");
  var pickerEl = document.getElementById("picker");
  var titleEl = document.getElementById("docTitle");
  var bylineEl = document.getElementById("docByline");

  var selectedId = null;

  /* ---------- languages ----------
     English is the source. A translation shares the same blocks (layout, media)
     and only overrides the words: each object keeps its French text in `.fr`. */
  var lang = "en";
  function tr(o, key) { return lang === "en" ? (o[key] || "") : ((o.fr && o.fr[key]) || ""); }
  function setTr(o, key, v) { if (lang === "en") o[key] = v; else { o.fr = o.fr || {}; o.fr[key] = v; } }
  function plain(html) { var d = document.createElement("div"); d.innerHTML = html || ""; return d.textContent.replace(/\s+/g, " ").trim(); }
  // greyed hint for an empty field: the English source while translating
  function hint(o, key, fallback) { return lang === "en" ? fallback : (plain(o[key]) || fallback); }

  /* ---------- helpers ---------- */
  function youtubeId(url) {
    var m = String(url).match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  function blockById(id) { return state.blocks.find(function (b) { return b.id === id; }); }

  /* ---------- render ---------- */
  function render() {
    titleEl.value = tr(state, "title");
    titleEl.placeholder = lang === "en" ? "Title" : (state.title || "Titre");
    setByline(state.author);
    blocksEl.innerHTML = "";
    state.blocks.forEach(function (b) { blocksEl.appendChild(renderBlock(b)); });
    paintRoom(state.tone);
    paintTune();
    renderInspector();
    if (translating) renderTranslate();
  }

  function renderBlock(b) {
    var el = document.createElement("div");
    el.className = "block b-" + b.type;
    el.dataset.id = b.id;
    if (b.type === "image" && b.inset) el.classList.add("w-inset");
    if (b.id === selectedId) el.classList.add("is-selected");

    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = "block-handle";
    handle.title = "Drag to reorder";
    handle.textContent = "⠿";
    handle.addEventListener("pointerdown", function (e) { startDrag(e, el, b.id); });
    el.appendChild(handle);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "block-del";
    del.title = "Delete block";
    del.innerHTML = "&times;";
    del.addEventListener("click", function (e) { e.stopPropagation(); removeBlock(b.id); });
    el.appendChild(del);

    el.appendChild(renderContent(b));

    el.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".block-handle") || e.target.closest(".block-del")) return;
      select(b.id);
    });
    return el;
  }

  // pasted rich text keeps only its structure (bold, italic, links, line
  // breaks) — never the source page's fonts, sizes or colours
  var PASTE_KEEP = { B: 1, STRONG: 1, I: 1, EM: 1, A: 1, BR: 1, P: 1, DIV: 1, MARK: 1 };
  var PASTE_DROP = { STYLE: 1, SCRIPT: 1, META: 1, TITLE: 1, LINK: 1 };
  function cleanRich(html) {
    var t = document.createElement("template"); t.innerHTML = html;
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1 || PASTE_DROP[c.tagName]) { c.remove(); return; }
        walk(c);
        if (!PASTE_KEEP[c.tagName]) { while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c); c.remove(); return; }
        Array.prototype.slice.call(c.attributes).forEach(function (a) { if (!(c.tagName === "A" && a.name === "href")) c.removeAttribute(a.name); });
      });
    })(t.content);
    return t.innerHTML;
  }
  document.addEventListener("paste", function (e) {
    var box = e.target && e.target.closest && e.target.closest(".b-text, .b-cap, .bq-text, .bq-cite, .bh-text, .bsg-text");
    if (!box || !e.clipboardData) return;
    if (box.matches(".bh-text, .bsg-text")) { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); return; }
    var html = e.clipboardData.getData("text/html");
    if (!html) return;
    e.preventDefault();
    document.execCommand("insertHTML", false, cleanRich(html));
  });

  function renderContent(b) {
    if (b.type === "text") {
      var t = document.createElement("div");
      t.className = "b-text" + (b.head ? " b-head" : "");
      t.contentEditable = "true";
      t.spellcheck = false;
      t.innerHTML = tr(b, "html");
      t.dataset.ph = hint(b, "html", lang === "en" ? "Write…" : "Écrire…");
      if (!t.textContent.trim()) t.classList.add("is-empty");
      t.addEventListener("input", function () {
        setTr(b, "html", t.innerHTML);
        t.classList.toggle("is-empty", !t.textContent.trim());
      });
      return t;
    }
    if (b.type === "image") {
      var iw = document.createElement("div");
      iw.className = "b-media" + (b.src ? " has-src" : "") + (b.win ? " is-framed" : "");
      if (b.src) { var img = document.createElement("img"); img.src = b.src; img.alt = tr(b, "alt") || b.alt || ""; iw.appendChild(img); }
      else { iw.innerHTML = "<span>click or drop an image</span>"; iw.addEventListener("click", function () { pickImage(b); }); }
      wireMediaDrop(iw, b);
      return withCaption(iw, b);
    }
    if (b.type === "video") {
      var vw = document.createElement("div");
      vw.className = "b-media" + (b.src ? " has-src" : "");
      if (b.src) {
        var yt = youtubeId(b.src);
        var vm;
        if (yt) { vm = document.createElement("iframe"); vm.src = "https://www.youtube.com/embed/" + yt; vm.allowFullscreen = true; }
        else {
          vm = document.createElement("video"); vm.src = b.src; vm.controls = true;
          if (!b.nat) vm.addEventListener("loadedmetadata", function () { if (!b.nat && vm.videoWidth) { b.nat = { w: vm.videoWidth, h: vm.videoHeight }; rerenderBlock(b.id); } }, { once: true });
        }
        if (b.frame !== false) {
          // as on the site: the video on a print card, its title written underneath
          vw.classList.add("has-vprint");
          var vp = document.createElement("div"); vp.className = "vprint";
          var hole = document.createElement("div"); hole.className = "vprint-hole"; hole.appendChild(vm);
          var vn = document.createElement("div"); vn.className = "vprint-note"; vn.textContent = videoWinTitle(b);
          vp.appendChild(hole); vp.appendChild(vn); vw.appendChild(vp);
        }
        else vw.appendChild(vm);
      } else { vw.innerHTML = "<span>click or drop a video</span>"; vw.addEventListener("click", function () { pickVideo(b); }); }
      wireMediaDrop(vw, b);
      return withCaption(vw, b);
    }
    if (b.type === "hand" || b.type === "sign") {
      var hw = document.createElement("div");
      var hv = tr(b, "text");
      hw.className = (b.type === "hand" ? "bh-text" : "bsg-text") + (hv.trim() ? "" : " is-empty");
      hw.dataset.ph = hint(b, "text", b.type === "sign" ? (state.author || "Your name") : (lang === "en" ? "A note in your hand…" : "Une note à la main…"));
      hw.contentEditable = document.body.classList.contains("is-preview") ? "false" : "true";
      hw.spellcheck = false;
      hw.innerText = hv;
      hw.addEventListener("input", function () { setTr(b, "text", hw.innerText.replace(/\n$/, "")); hw.classList.toggle("is-empty", !hw.textContent.trim()); });
      if (b.type === "sign") hw.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
      return hw;
    }
    if (b.type === "quote") {
      var qw = document.createDocumentFragment();
      qw.appendChild(editableLine(b, "text", "bq-text", "A line worth hanging on the wall…", "Une phrase à accrocher au mur…"));
      qw.appendChild(editableLine(b, "cite", "bq-cite", "Who said it", "Qui l’a dit"));
      return qw;
    }
    return renderBoard(b);
  }
  // fill a song from its YouTube link: read the video's name, then find the
  // real track in Apple's catalogue (proper title, artist, album, sleeve);
  // if it isn't there, make the best of the video's name
  function songClean(t) {
    return String(t || "")
      .replace(/\s*[\(\[][^\)\]]*(official|video|audio|lyric|visuali[sz]er|clip|hd|4k|remaster|soundtrack|ost|score)[^\)\]]*[\)\]]/gi, "")
      .replace(/^\s*\d{1,2}\s*[.)\-–]\s*/, "")            // "10. Track"
      .replace(/\s*[\/|]\s*(ost|soundtrack|score)\b.*$/i, "") // "Album / OST"
      .replace(/\s+(ost|soundtrack)$/i, "")
      .replace(/\s{2,}/g, " ").trim();
  }
  function norm(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function songLookup(b) {
    var id = youtubeId(b.src); if (!id) return;
    var src = b.src;
    fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (o) {
        if (!o || b.src !== src) return;
        var raw = String(o.title || ""), channel = String(o.author_name || "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
        var parts = raw.split(/\s+[-–—]\s+/), a = songClean(parts[0]), c = parts.length > 1 ? songClean(parts.slice(1).join(" - ")) : "";
        // a soundtrack upload reads "Track - Film / OST": the track comes first
        var ostish = /\b(ost|soundtrack|score)\b/i.test(raw) || /^\s*\d{1,2}\s*[.)]/.test(raw);
        var guess = !c ? { title: a, artist: channel } : ostish ? { title: a, artist: "", album: c } : { title: c, artist: a };
        var term = [guess.title, guess.artist || guess.album || channel].filter(Boolean).join(" ");
        return fetch("https://itunes.apple.com/search?entity=song&limit=8&term=" + encodeURIComponent(term))
          .then(function (r) { return r.ok ? r.json() : { results: [] }; }, function () { return { results: [] }; })
          .then(function (res) {
            if (b.src !== src) return;
            var want = norm(guess.title), hit = (res.results || []).filter(function (x) { var n = norm(x.trackName); return n && (n === want || want.indexOf(n) >= 0 || n.indexOf(want) >= 0); })[0];
            if (hit) {
              b.title = hit.trackName; b.artist = hit.artistName;
              b.album = songClean(String(hit.collectionName || "").replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ""));
              b.art = String(hit.artworkUrl100 || "").replace(/\/\d+x\d+bb\./, "/600x600bb.") || "";
            } else {
              b.title = guess.title; b.artist = guess.artist || channel; b.album = guess.album || ""; b.art = "";
            }
            songChanged();
          });
      }).catch(function () { songChanged(); });
  }
  // a one-line contenteditable bound to b[key] (EN) / b.fr[key] (FR)
  function editableLine(b, key, cls, phEn, phFr) {
    var c = document.createElement("div");
    var v = tr(b, key);
    c.className = cls + (plain(v) ? "" : " is-empty");
    c.dataset.ph = hint(b, key, lang === "en" ? phEn : phFr);
    c.contentEditable = document.body.classList.contains("is-preview") ? "false" : "true";
    c.spellcheck = false;
    c.innerHTML = v;
    c.addEventListener("input", function () { setTr(b, key, key === "cite" ? c.textContent : c.innerHTML); c.classList.toggle("is-empty", !c.textContent.trim()); });
    c.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
    return c;
  }


  function withCaption(media, b) {
    var frag = document.createDocumentFragment();
    frag.appendChild(media);
    var c = document.createElement("div");
    var cap = tr(b, "caption");
    c.className = "b-cap" + (plain(cap) ? "" : " is-empty");
    c.dataset.ph = hint(b, "caption", lang === "en" ? "Add a caption…" : "Ajouter une légende…");
    c.contentEditable = document.body.classList.contains("is-preview") ? "false" : "true";
    c.spellcheck = false;
    c.innerHTML = cap;
    c.addEventListener("input", function () {
      setTr(b, "caption", c.innerHTML);
      c.classList.toggle("is-empty", !c.textContent.trim());
    });
    frag.appendChild(c);
    return frag;
  }

  /* ---------- board block: free-placed images on a square ---------- */
  function renderBoard(b) {
    var board = document.createElement("div");
    board.className = "b-board";
    // "none": no backdrop — the pictures sit straight on the room's grey
    board.classList.toggle("is-clear", boardClear(b));
    board.style.background = boardClear(b) ? "" : b.bg;
    if (!b.items.length) { var e = document.createElement("div"); e.className = "board-empty"; e.textContent = "drop images here, or add them in the inspector →"; board.appendChild(e); }
    b.items.forEach(function (it) { board.appendChild(renderBoardItem(b, board, it)); });
    wireBoardDrop(board, b);
    return board;
  }
  function wireBoardDrop(board, b) {
    board.addEventListener("dragover", function (e) {
      if (document.body.classList.contains("is-preview")) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "copy";
      if (b.items.length < 6) board.classList.add("is-dropping");
    });
    board.addEventListener("dragleave", function (e) {
      if (!board.contains(e.relatedTarget)) board.classList.remove("is-dropping");
    });
    board.addEventListener("drop", function (e) {
      if (document.body.classList.contains("is-preview")) return;
      e.preventDefault(); board.classList.remove("is-dropping");
      var brd = board.getBoundingClientRect();
      var files = [].slice.call(e.dataTransfer.files).filter(function (f) { return f.type.indexOf("image/") === 0 || f.type.indexOf("video/") === 0; });
      files.forEach(function (f, i) {
        if (b.items.length >= 6) return;
        var x = clamp((e.clientX - brd.left) / brd.width * 100 - 21 + i * 4, 0, 58);
        var y = clamp((e.clientY - brd.top) / brd.height * 100 - 21 + i * 4, 0, 58);
        var kind = f.type.indexOf("video/") === 0 ? "video" : "image";
        var item = { id: uid(), kind: kind, src: URL.createObjectURL(f), name: f.name, x: x, y: y, w: 42, z: ++b.zc };
        if (kind === "video") item.win = newWin(f.name);
        b.items.push(item);
        if (kind === "image") prepImage(item, b.id);
      });
      render(); select(b.id);
    });
  }
  function renderBoardItem(b, board, it) {
    var wrap = document.createElement("div");
    wrap.className = "board-item";
    wrap.dataset.iid = it.id;
    wrap.style.left = it.x + "%";
    wrap.style.top = it.y + "%";
    wrap.style.width = it.w + "%";
    wrap.style.zIndex = it.z || 1;
    if (b.sel === it.id && selectedId === b.id) wrap.classList.add("is-sel");
    var media;
    if (it.kind === "video") {
      media = document.createElement("video");
      media.src = it.src; media.muted = true; media.loop = true; media.autoplay = true;
      media.playsInline = true; media.setAttribute("playsinline", "");
      media.play().catch(function () {});
    } else {
      media = document.createElement("img"); if (it.src) media.src = it.src;
    }
    media.draggable = false;
    if (it.win) wrap.classList.add("is-win");
    if (it.kind !== "video" && window.Prints) {
      // a picture on a board hangs as a print, as on the site: the photo out of its window, its note underneath
      wrap.classList.add("is-print"); wrap.classList.remove("is-win");
      wrap.appendChild(Prints.dom(it.src, { window: Prints.isWindow(it.src, it), note: it.note, index: b.items.indexOf(it) }));
    } else if (it.kind === "video" && it.win && window.MacWin) {
      // a live Preview window; learn the video's size first for "Original"
      if (!it.nat) media.addEventListener("loadedmetadata", function () { if (!it.nat && media.videoWidth) { it.nat = { w: media.videoWidth, h: media.videoHeight }; rerenderBlock(b.id); } }, { once: true });
      media.style.objectFit = it.win.fit === "fit" ? "contain" : "cover";
      wrap.appendChild(MacWin.frameDOM(media, it.win, it.nat && it.nat.w, it.nat && it.nat.h));
    } else wrap.appendChild(media);
    var rs = document.createElement("div"); rs.className = "board-resize"; rs.textContent = "⤡"; wrap.appendChild(rs);
    // double-click a window → jump to its title field
    wrap.addEventListener("dblclick", function () {
      if (document.body.classList.contains("is-preview") || !it.win) return;
      b.sel = it.id; renderInspector();
      var t = inspectorEl.querySelector(".js-wtitle");
      if (t) { t.scrollIntoView({ block: "center" }); t.focus({ preventScroll: true }); t.select(); }
    });
    wrap.addEventListener("pointerdown", function (e) {
      if (document.body.classList.contains("is-preview")) return;
      select(b.id);
      if (e.target === rs) { boardResize(e, b, board, it, wrap); return; }
      boardMove(e, b, board, it, wrap);
    });
    return wrap;
  }
  function selItem(board, id, b) {
    board.querySelectorAll(".board-item").forEach(function (el) { el.classList.toggle("is-sel", el.dataset.iid === id); });
    if (b && b.sel !== id) { b.sel = id; renderInspector(); }
  }
  /* ---------- smart guides: snap to the board's edges/centre and to other items (Figma-style) ---------- */
  var SNAP_PX = 6; // hold ⌘ while dragging to place freely
  function boardRects(board, exceptId) {
    return [].slice.call(board.querySelectorAll(".board-item")).filter(function (el) { return el.dataset.iid !== exceptId; })
      .map(function (el) { return { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; });
  }
  function snapTargets(board, rects) {
    var W = board.clientWidth, H = board.clientHeight;
    var xs = [{ v: 0, board: true }, { v: W / 2, board: true }, { v: W, board: true }];
    var ys = [{ v: 0, board: true }, { v: H / 2, board: true }, { v: H, board: true }];
    rects.forEach(function (r) {
      [r.l, r.l + r.w / 2, r.l + r.w].forEach(function (v) { xs.push({ v: v, r: r }); });
      [r.t, r.t + r.h / 2, r.t + r.h].forEach(function (v) { ys.push({ v: v, r: r }); });
    });
    return { xs: xs, ys: ys };
  }
  // smallest correction that lands one of `cands` on a target, or 0
  function snapDelta(cands, targets) {
    var best = null;
    cands.forEach(function (c) { targets.forEach(function (t) { var d = t.v - c; if (Math.abs(d) <= SNAP_PX && (best === null || Math.abs(d) < Math.abs(best))) best = d; }); });
    return best === null ? 0 : best;
  }
  // guide lines for every edge/centre of the moved rect `m` that now sits on a target
  function guideLines(board, m, tg) {
    var W = board.clientWidth, H = board.clientHeight, lines = {};
    function add(vert, v, t) {
      var k = (vert ? "v" : "h") + Math.round(v * 2), g = lines[k];
      if (!g) g = lines[k] = { vert: vert, pos: v, a: vert ? m.t : m.l, b: vert ? m.t + m.h : m.l + m.w };
      if (t.board) { g.a = 0; g.b = vert ? H : W; return; }
      g.a = Math.min(g.a, vert ? t.r.t : t.r.l); g.b = Math.max(g.b, vert ? t.r.t + t.r.h : t.r.l + t.r.w);
    }
    [m.l, m.l + m.w / 2, m.l + m.w].forEach(function (c) { tg.xs.forEach(function (t) { if (Math.abs(t.v - c) < 0.5) add(true, t.v, t); }); });
    [m.t, m.t + m.h / 2, m.t + m.h].forEach(function (c) { tg.ys.forEach(function (t) { if (Math.abs(t.v - c) < 0.5) add(false, t.v, t); }); });
    return Object.keys(lines).map(function (k) { return lines[k]; });
  }
  function drawGuides(board, lines) {
    var layer = board.querySelector(".board-guides");
    if (!layer) { layer = document.createElement("div"); layer.className = "board-guides"; board.appendChild(layer); }
    layer.innerHTML = "";
    lines.forEach(function (g) {
      var el = document.createElement("div"); el.className = "board-guide " + (g.vert ? "v" : "h");
      if (g.vert) { el.style.left = g.pos + "px"; el.style.top = g.a + "px"; el.style.height = (g.b - g.a) + "px"; }
      else { el.style.top = g.pos + "px"; el.style.left = g.a + "px"; el.style.width = (g.b - g.a) + "px"; }
      layer.appendChild(el);
    });
  }
  function clearGuides(board) { var l = board.querySelector(".board-guides"); if (l) l.remove(); }

  function boardMove(e, b, board, it, wrap) {
    e.preventDefault(); e.stopPropagation();
    selItem(board, it.id, b);
    it.z = ++b.zc; wrap.style.zIndex = it.z;
    wrap.classList.add("is-dragging");
    board.classList.add("is-arranging");
    wrap.setPointerCapture(e.pointerId);
    var brd = board.getBoundingClientRect();
    var W = board.clientWidth, H = board.clientHeight;
    var offX = e.clientX - brd.left - wrap.offsetLeft, offY = e.clientY - brd.top - wrap.offsetTop;
    var w = wrap.offsetWidth, h = wrap.offsetHeight;
    var tg = snapTargets(board, boardRects(board, it.id));
    function mv(ev) {
      var L = clamp(ev.clientX - brd.left - offX, 0, W - w);
      var T = clamp(ev.clientY - brd.top - offY, 0, H - h);
      var lines = [];
      if (!ev.metaKey) {
        L = clamp(L + snapDelta([L, L + w / 2, L + w], tg.xs), 0, W - w);
        T = clamp(T + snapDelta([T, T + h / 2, T + h], tg.ys), 0, H - h);
        lines = guideLines(board, { l: L, t: T, w: w, h: h }, tg);
      }
      drawGuides(board, lines);
      wrap.classList.toggle("is-snapped", lines.length > 0);
      it.x = L / W * 100; it.y = T / H * 100;
      wrap.style.left = it.x + "%"; wrap.style.top = it.y + "%";
    }
    function up() { wrap.removeEventListener("pointermove", mv); wrap.classList.remove("is-dragging"); board.classList.remove("is-arranging"); wrap.classList.remove("is-snapped"); clearGuides(board); }
    wrap.addEventListener("pointermove", mv);
    wrap.addEventListener("pointerup", up, { once: true });
  }
  function boardResize(e, b, board, it, wrap) {
    e.preventDefault(); e.stopPropagation();
    selItem(board, it.id, b);
    wrap.setPointerCapture(e.pointerId);
    var brd = board.getBoundingClientRect();
    var W = board.clientWidth, H = board.clientHeight;
    var L = wrap.offsetLeft, T = wrap.offsetTop, ratio = wrap.offsetHeight / wrap.offsetWidth;
    var tg = snapTargets(board, boardRects(board, it.id));
    var minW = 0.12 * W, maxW = Math.min(W - L, ratio ? (H - T) / ratio : W - L);
    function mv(ev) {
      var w = clamp(ev.clientX - brd.left - L, minW, maxW), lines = [];
      if (!ev.metaKey) {
        // snap the right edge, or the bottom edge (width follows via the locked aspect) — whichever is closer
        var dx = snapDelta([L + w], tg.xs), dy = ratio ? snapDelta([T + w * ratio], tg.ys) : 0;
        var dw = dx && (!dy || Math.abs(dx) <= Math.abs(dy)) ? dx : dy ? dy / ratio : 0;
        w = clamp(w + dw, minW, maxW);
        lines = guideLines(board, { l: L, t: T, w: w, h: w * ratio }, tg);
      }
      drawGuides(board, lines);
      it.w = w / W * 100;
      wrap.style.width = it.w + "%";
    }
    function up() { wrap.removeEventListener("pointermove", mv); clearGuides(board); }
    wrap.addEventListener("pointermove", mv);
    wrap.addEventListener("pointerup", up, { once: true });
  }
  function addBoardMedia(b, kind) {
    if (b.items.length >= 6) return;
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = kind === "video" ? "video/*" : "image/*";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var n = b.items.length;
      var item = { id: uid(), kind: kind, src: URL.createObjectURL(f), name: f.name, x: 8 + n * 6, y: 8 + n * 6, w: 42, z: ++b.zc };
      if (kind === "video") item.win = newWin(f.name);
      b.items.push(item); b.sel = item.id;
      if (kind === "image") prepImage(item, b.id);
      render(); select(b.id);
    });
    inp.click();
  }
  function boardHasVideo(b) { return b.items.some(function (it) { return it.kind === "video"; }); }
  // crop the transparent margin + drop shadow off an image (the border macOS
  // adds around window screenshots), so the window fills its frame, and cut
  // its corners round so no shadow is left in them
  function trimTransparentURL(src) {
    return loadImg(src).then(function (im) {
      var w = im.naturalWidth, h = im.naturalHeight; if (!w || !h) return src;
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var ctx = c.getContext("2d"); ctx.drawImage(im, 0, 0);
      var data; try { data = ctx.getImageData(0, 0, w, h).data; } catch (e) { return src; }
      var minX = w, minY = h, maxX = -1, maxY = -1, T = 190; // high threshold: crop off the soft drop-shadow too, keeping just the solid window
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > T) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      if (maxX < 0) return src;
      if (minX === 0 && minY === 0 && maxX === w - 1 && maxY === h - 1) return src;
      var cw = maxX - minX + 1, ch = maxY - minY + 1;
      // the crop is a rectangle but the window's corners are round, so the
      // shadow would still show in the four corners. Measure the corner radius
      // from the image itself (how far in along each corner's diagonal the
      // solid window starts) and cut the corners round to match.
      function inset(x0, y0, dx, dy) {
        for (var i = 0; i < Math.min(cw, ch) / 2; i++) if (data[((y0 + i * dy) * w + (x0 + i * dx)) * 4 + 3] > T) return i;
        return 0;
      }
      var d = Math.max(inset(minX, minY, 1, 1), inset(maxX, minY, -1, 1), inset(minX, maxY, 1, -1), inset(maxX, maxY, -1, -1));
      var r = d / (1 - Math.SQRT1_2);  // diagonal gap of a circular corner = r(1 - 1/√2)
      // shave the 1px anti-aliased rim too (it's half shadow) when there is one
      var e = d > 0 && cw > 4 && ch > 4 ? 1 : 0;
      minX += e; minY += e; cw -= 2 * e; ch -= 2 * e; r = Math.min(Math.max(r - e, 0), cw / 2, ch / 2);
      var oc = document.createElement("canvas"); oc.width = cw; oc.height = ch;
      var octx = oc.getContext("2d");
      if (r >= 2 && octx.roundRect) { octx.beginPath(); octx.roundRect(0, 0, cw, ch, r); octx.clip(); }
      octx.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
      return new Promise(function (res) { oc.toBlob(function (bl) { res(bl ? URL.createObjectURL(bl) : src); }, "image/png"); });
    }).catch(function () { return src; });
  }
  function autoTrim(holder, rerenderId) {
    var url = holder.src;
    trimTransparentURL(url).then(function (t) {
      if (t && t !== url) { holder.src = t; try { URL.revokeObjectURL(url); } catch (e) {} if (rerenderId) rerenderBlock(rerenderId); }
    });
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------- Mac windows (assets/macwin.js) ----------
     A dropped image is shown inside a dark Preview window, baked to a PNG:
     `orig` keeps the raw image, `src` the framed result, `win` the settings
     (ratio, fill/fit, title) so changing them re-bakes from the original.
     A window screenshot (transparent margin) is left as it is. Text windows
     bake from `win.text`; video windows are drawn live (Studio + exports). */
  var TEXT_WIDTHS = { narrow: 480, regular: 640, wide: 800 };
  function newWin(name) { return { type: "preview", ratio: "orig", fit: "fill", title: name || "Untitled.jpg" }; }
  function revoke(u) { if (u && u.indexOf("blob:") === 0) try { URL.revokeObjectURL(u); } catch (e) {} }
  function bakeWin(holder, rerenderId) {
    var w = holder.win;
    if (!w || holder.kind === "video" || !window.MacWin) { if (rerenderId) rerenderBlock(rerenderId); return; }
    var token = holder._bake = (holder._bake || 0) + 1;
    var job = w.type === "text" ? MacWin.bakeText({ title: w.title, text: w.text, look: w.look, edited: w.edited, width: TEXT_WIDTHS[w.width] || 640 }) : MacWin.bakePreview(holder.orig, w);
    job.then(function (url) {
      if (token !== holder._bake || !url) { revoke(url); return; }
      var old = holder.src; holder.src = url;
      if (old !== holder.orig) revoke(old);
      if (rerenderId) { rerenderBlock(rerenderId); keepInBoard(holder, rerenderId); }
      var th = inspectorEl.querySelector('.insp-item[data-iid="' + holder.id + '"] .thumb'); if (th) th.src = url;
    }).catch(function () {});
  }
  // a window that grew taller than the room left below it slides back up
  function keepInBoard(it, blockId) {
    var wrap = blocksEl.querySelector('.block[data-id="' + blockId + '"] .board-item[data-iid="' + it.id + '"]');
    if (!wrap) return;
    var img = wrap.querySelector("img");
    function fit() {
      var bd = wrap.parentNode; if (!bd || !bd.clientHeight) return;
      var hP = wrap.offsetHeight / bd.clientHeight * 100;
      if (it.y + hP > 100) { it.y = Math.max(0, 100 - hP); wrap.style.top = it.y + "%"; }
    }
    if (img && !img.complete) img.addEventListener("load", fit, { once: true }); else fit();
  }
  // a freshly added image: trim a window screenshot, otherwise frame it
  function prepImage(holder, rerenderId) {
    var url = holder.src;
    trimTransparentURL(url).then(function (t) {
      if (t && t !== url) { holder.src = t; revoke(url); holder.win = null; holder.orig = null; if (rerenderId) rerenderBlock(rerenderId); return; }
      holder.orig = url; holder.win = newWin(holder.name); bakeWin(holder, rerenderId);
    });
  }
  function setWinOn(holder, on, rerenderId) {
    if (on) { holder.win = holder._winOff || newWin(holder.name); holder._winOff = null; bakeWin(holder, rerenderId); }
    else { holder._winOff = holder.win; holder.win = null; if (holder.kind !== "video" && holder.orig) { if (holder.src !== holder.orig) revoke(holder.src); holder.src = holder.orig; } if (rerenderId) rerenderBlock(rerenderId); }
  }
  function videoWinTitle(b) { return b.wtitle || b.name || plain(tr(b, "caption") || b.caption) || "Video"; }
  // window settings UI (shared by board items and image blocks)
  function winControls(sec, holder, rerenderId) {
    var w = holder.win, isText = w && w.type === "text";
    if (!isText) {
      var on = document.createElement("div"); on.className = "insp-seg";
      ["Window", "Plain"].forEach(function (name, i) {
        var btn = document.createElement("button"); btn.type = "button"; btn.textContent = name;
        btn.setAttribute("aria-pressed", (w ? 0 : 1) === i ? "true" : "false");
        btn.addEventListener("click", function () { setWinOn(holder, i === 0, rerenderId); renderInspector(); });
        on.appendChild(btn);
      });
      sec.appendChild(field("Frame", on));
    }
    if (!w) return;
    var tdeb;
    var tIn = textInput(w.title, isText ? "Untitled" : "photo.jpg", function (v) {
      w.title = v; clearTimeout(tdeb); tdeb = setTimeout(function () { bakeWin(holder, rerenderId); }, 200);
    });
    tIn.classList.add("js-wtitle");
    sec.appendChild(field("Window title", tIn));
    if (isText) {
      var ed = document.createElement("label"); ed.className = "pub-remember insp-check";
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = w.edited !== false;
      cb.addEventListener("change", function () { w.edited = cb.checked; bakeWin(holder, rerenderId); });
      ed.appendChild(cb); ed.appendChild(document.createTextNode(" Show “— Edited” after the title"));
      sec.appendChild(ed);
    }
    if (isText) {
      var ta = document.createElement("textarea"); ta.className = "insp-input insp-textarea"; ta.rows = 7; ta.value = w.text || "";
      ta.placeholder = "Type the text shown in the window — an empty line starts a new paragraph";
      var deb; ta.addEventListener("input", function () { w.text = ta.value; clearTimeout(deb); deb = setTimeout(function () { bakeWin(holder, rerenderId); }, 250); });
      sec.appendChild(field("Text", ta));
      var hintT = document.createElement("div"); hintT.className = "insp-empty"; hintT.style.margin = "-4px 0 10px";
      hintT.textContent = "Emphasis: **bold words** · ==highlighted words==";
      sec.appendChild(hintT);
      var ls = document.createElement("div"); ls.className = "insp-seg insp-seg-wrap";
      [["note", "Note"], ["large", "Statement"], ["paper", "Paper"], ["lead", "Lead-in"], ["serif", "Serif"]].forEach(function (l) {
        var btn = document.createElement("button"); btn.type = "button"; btn.textContent = l[1];
        btn.setAttribute("aria-pressed", (w.look || "note") === l[0] ? "true" : "false");
        btn.addEventListener("click", function () { w.look = l[0]; bakeWin(holder, rerenderId); renderInspector(); });
        ls.appendChild(btn);
      });
      sec.appendChild(field("Style", ls));
      var ws = document.createElement("div"); ws.className = "insp-seg";
      ["narrow", "regular", "wide"].forEach(function (k) {
        var btn = document.createElement("button"); btn.type = "button"; btn.textContent = k.charAt(0).toUpperCase() + k.slice(1);
        btn.setAttribute("aria-pressed", (w.width || "regular") === k ? "true" : "false");
        btn.addEventListener("click", function () { w.width = k; bakeWin(holder, rerenderId); renderInspector(); });
        ws.appendChild(btn);
      });
      sec.appendChild(field("Width", ws));
      return;
    }
    var rs = document.createElement("div"); rs.className = "insp-seg insp-seg-wrap";
    MacWin.RATIOS.forEach(function (r) {
      var btn = document.createElement("button"); btn.type = "button"; btn.textContent = r.label;
      btn.setAttribute("aria-pressed", (w.ratio || "orig") === r.id ? "true" : "false");
      btn.addEventListener("click", function () { w.ratio = r.id; bakeWin(holder, rerenderId); renderInspector(); });
      rs.appendChild(btn);
    });
    sec.appendChild(field("Ratio", rs));
    var fs = document.createElement("div"); fs.className = "insp-seg";
    [["fill", "Fill"], ["fit", "Fit"]].forEach(function (f) {
      var btn = document.createElement("button"); btn.type = "button"; btn.textContent = f[1];
      btn.setAttribute("aria-pressed", (w.fit || "fill") === f[0] ? "true" : "false");
      btn.addEventListener("click", function () { w.fit = f[0]; bakeWin(holder, rerenderId); renderInspector(); });
      fs.appendChild(btn);
    });
    sec.appendChild(field("Picture", fs));
  }
  // the short text shown under a picture when it's opened in focus mode
  function focusNoteField(sec, b) {
    var ta = document.createElement("textarea"); ta.className = "insp-input insp-textarea"; ta.rows = 3;
    ta.value = tr(b, "note"); ta.placeholder = hint(b, "note", "Shown under the picture when someone clicks it to see it large");
    ta.addEventListener("input", function () { setTr(b, "note", ta.value); });
    sec.appendChild(field(lang === "en" ? "Focus note" : "Focus note (FR)", ta));
  }
  function addTextWindow(b) {
    if (b.items.length >= 6) return;
    var n = b.items.length;
    var item = { id: uid(), kind: "image", src: "", name: "Text", x: 10 + n * 5, y: 52 + n * 3, w: 64, z: ++b.zc,
      win: { type: "text", title: "Untitled", text: "Write your text in the inspector — **bold** or ==highlight== the words that matter.", width: "regular", look: "note" } };
    b.items.push(item); b.sel = item.id;
    bakeWin(item, b.id); render(); select(b.id);
  }

  /* ---------- board rendering for exports: framed items + shadows ---------- */
  function loadBoardMedia(items) {
    return Promise.all(items.map(function (it) {
      return new Promise(function (r) {
        if (it.kind === "video") {
          var v = document.createElement("video"); v.src = it.src; v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute("playsinline", "");
          v.addEventListener("loadeddata", function () {
            if (!it.win || !window.MacWin) { r({ it: it, el: v, vid: true }); return; }
            MacWin.videoChrome(it.win, v.videoWidth, v.videoHeight).then(function (ch) { r({ it: it, el: v, vid: true, ch: ch }); }, function () { r({ it: it, el: v, vid: true }); });
          }, { once: true });
          v.addEventListener("error", function () { r(null); }, { once: true }); v.load();
        } else { var im = new Image(); im.onload = function () { r({ it: it, el: im, vid: false }); }; im.onerror = function () { r(null); }; im.src = it.src; }
      });
    })).then(function (m) { return m.filter(Boolean); });
  }
  // a board's backdrop: "none" leaves the PNG transparent; GIF/WebM can't
  // carry alpha, so they fall back to the room's grey
  var ROOM_GREY = "#e6e4e6";
  function boardClear(b) { return b.bg === "none"; }
  function fillBoard(ctx, b, SIZE, solid) {
    if (boardClear(b) && !solid) return;
    ctx.fillStyle = boardClear(b) ? ROOM_GREY : (b.bg || "#ebebef"); ctx.fillRect(0, 0, SIZE, SIZE);
  }
  function itemShadow(ctx, dw) { ctx.shadowColor = "rgba(0, 0, 0, 0.3)"; ctx.shadowBlur = dw * 0.06; ctx.shadowOffsetY = dw * 0.022; }
  function drawBoardMedia(ctx, m, SIZE) {
    var it = m.it, el = m.el, X = it.x / 100 * SIZE, Y = it.y / 100 * SIZE, dw = it.w / 100 * SIZE;
    if (m.ch) {
      var k = dw / m.ch.w;
      ctx.save(); itemShadow(ctx, dw); ctx.fillStyle = "#1c1c1e"; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(X, Y, dw, m.ch.h * k, 12 * k); else ctx.rect(X, Y, dw, m.ch.h * k);
      ctx.fill(); ctx.restore();
      try { MacWin.drawVideoFrame(ctx, m.ch, el, it.win, X, Y, dw); } catch (e) {}
      return;
    }
    var nw = m.vid ? el.videoWidth : el.naturalWidth, nh = m.vid ? el.videoHeight : el.naturalHeight;
    if (!nw || !nh) return;
    ctx.save(); if (it.win) itemShadow(ctx, dw);
    try { ctx.drawImage(el, X, Y, dw, dw * (nh / nw)); } catch (e) {}
    ctx.restore();
  }
  function wireMediaDrop(el, b) {
    el.addEventListener("dragover", function (e) {
      if (document.body.classList.contains("is-preview")) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "copy"; el.classList.add("is-dropping");
    });
    el.addEventListener("dragleave", function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove("is-dropping"); });
    el.addEventListener("drop", function (e) {
      if (document.body.classList.contains("is-preview")) return;
      e.preventDefault(); el.classList.remove("is-dropping");
      var want = b.type === "video" ? "video/" : "image/";
      var f = [].slice.call(e.dataTransfer.files).filter(function (x) { return x.type.indexOf(want) === 0; })[0];
      if (f) { b.src = URL.createObjectURL(f); b.name = f.name; render(); select(b.id); if (b.type === "image") prepImage(b, b.id); }
    });
  }

  /* ---------- export a board to a high-res PNG ---------- */
  function boardIndex(b) { return state.blocks.filter(function (x) { return x.type === "board"; }).indexOf(b); }
  function boardFilename(i) {
    var base = (state.title || "board").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "board";
    return base + "-board-" + (i + 1) + ".png";
  }
  function exportBoardToPNG(b) {
    boardToPNGBlob(b).then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = boardFilename(boardIndex(b));
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    });
  }

  /* ---------- export a board with video → looping WebM (native capture) ---------- */
  function exportBoardToWebM(b, btn) {
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Recording…"; }
    boardToWebMBlob(b).then(function (blob) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = boardFilename(boardIndex(b)).replace(/\.png$/, ".webm");
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    }, function (e) { alert(e && e.message || "This browser can't record WebM — try Chrome or a recent Safari."); })
      .then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
  }

  /* ---------- selection + inspector ---------- */
  function select(id) {
    selectedId = id;
    document.querySelectorAll(".block").forEach(function (el) {
      el.classList.toggle("is-selected", el.dataset.id === id);
    });
    renderInspector();
  }
  // re-render ONE block in the canvas without rebuilding the inspector, so an
  // inspector input the user is typing into keeps its focus.
  function rerenderBlock(id) {
    var old = blocksEl.querySelector('.block[data-id="' + id + '"]');
    var b = blockById(id);
    if (old && b) old.replaceWith(renderBlock(b));
  }

  function field(label, input) {
    var f = document.createElement("div"); f.className = "insp-field";
    var l = document.createElement("label"); l.className = "insp-label"; l.textContent = label;
    f.appendChild(l); f.appendChild(input); return f;
  }
  function textInput(val, ph, oninput) {
    var i = document.createElement("input"); i.className = "insp-input"; i.value = val || ""; i.placeholder = ph || "";
    i.addEventListener("input", function () { oninput(i.value); }); return i;
  }
  var AUTHORS = ["Isaaaaaaaac", "Rayn", "Vic"];
  function authorPP(name) { var m = { "Isaaaaaaaac": "/assets/pp/isaaaaaaaac.jpg" }; return m[name] || ""; }
  function setByline(name) {
    bylineEl.textContent = name || "Author";
    var dot = document.querySelector(".doc-byline-dot"); if (!dot) return;
    var pp = authorPP(name); dot.style.background = pp ? "center/cover no-repeat url('" + pp + "')" : "";
  }
  function authorSelect() {
    if (AUTHORS.indexOf(state.author) === -1) { state.author = AUTHORS[0]; setByline(state.author); }
    var s = document.createElement("select"); s.className = "insp-select";
    AUTHORS.forEach(function (n) { var o = document.createElement("option"); o.value = n; o.textContent = n; if (n === state.author) o.selected = true; s.appendChild(o); });
    s.addEventListener("change", function () { state.author = s.value; setByline(s.value); });
    return s;
  }
  function coverIsBoard() { return state.cover && typeof state.cover === "object" && state.cover.items; }
  function coverAddImage() {
    if (!coverIsBoard()) state.cover = { bg: "#ebebef", zc: 0, items: [] };
    if (state.cover.items.length >= 4) return;
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var n = state.cover.items.length;
      var item = { id: uid(), src: URL.createObjectURL(f), x: 6 + n * 5, y: 6 + n * 5, w: 55, z: (state.cover.zc = (state.cover.zc || 0) + 1) };
      state.cover.items.push(item);
      // a window screenshot is trimmed; any other picture goes in a Preview window
      trimTransparentURL(item.src).then(function (t) {
        if (t && t !== item.src) { revoke(item.src); item.src = t; renderInspector(); return; }
        if (!window.MacWin) return;
        var raw = item.src;
        MacWin.bakePreview(raw, newWin(f.name)).then(function (u) { if (u) { item.src = u; item.win = true; revoke(raw); renderInspector(); } });
      });
      renderInspector();
    });
    inp.click();
  }
  // one picture filling the whole cover (cropped to 3:5) instead of a board
  function coverSetFull() {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      if (typeof state.cover === "string") revoke(state.cover);
      state.cover = URL.createObjectURL(f); renderInspector();
    });
    inp.click();
  }
  function renderCoverItem(it, box) {
    var wrap = document.createElement("div"); wrap.className = "cover-item" + (it.win ? " is-win" : ""); wrap.dataset.iid = it.id;
    wrap.style.left = it.x + "%"; wrap.style.top = it.y + "%"; wrap.style.width = it.w + "%"; wrap.style.zIndex = it.z || 1;
    if (window.Prints) { wrap.classList.add("is-print"); wrap.classList.remove("is-win"); wrap.appendChild(Prints.dom(it.src, { window: Prints.isWindow(it.src, it), index: state.cover.items.indexOf(it), tape: ["top", "corner", "top", "both"][state.cover.items.indexOf(it) % 4], tilt: [-2.3, 2, -1.1, 2.6][state.cover.items.indexOf(it) % 4] })); }
    else { var img = document.createElement("img"); img.src = it.src; img.draggable = false; wrap.appendChild(img); }
    var rs = document.createElement("div"); rs.className = "cover-resize"; rs.textContent = "⤡"; wrap.appendChild(rs);
    var del = document.createElement("button"); del.type = "button"; del.className = "cover-del"; del.innerHTML = "&times;"; wrap.appendChild(del);
    del.addEventListener("click", function (e) { e.stopPropagation(); state.cover.items = state.cover.items.filter(function (x) { return x.id !== it.id; }); renderInspector(); });
    wrap.addEventListener("pointerdown", function (e) { if (e.target === rs) { coverResize(e, it, wrap, box); return; } coverMove(e, it, wrap, box); });
    return wrap;
  }
  function coverMove(e, it, wrap, box) {
    e.preventDefault(); e.stopPropagation();
    it.z = (state.cover.zc = (state.cover.zc || 0) + 1); wrap.style.zIndex = it.z;
    wrap.setPointerCapture(e.pointerId);
    var brd = box.getBoundingClientRect(), r = wrap.getBoundingClientRect();
    var offX = e.clientX - r.left, offY = e.clientY - r.top, wP = r.width / brd.width * 100, hP = r.height / brd.height * 100;
    function mv(ev) { it.x = clamp((ev.clientX - brd.left - offX) / brd.width * 100, 0, 100 - wP); it.y = clamp((ev.clientY - brd.top - offY) / brd.height * 100, 0, 100 - hP); wrap.style.left = it.x + "%"; wrap.style.top = it.y + "%"; }
    function up() { wrap.removeEventListener("pointermove", mv); }
    wrap.addEventListener("pointermove", mv); wrap.addEventListener("pointerup", up, { once: true });
  }
  function coverResize(e, it, wrap, box) {
    e.preventDefault(); e.stopPropagation(); wrap.setPointerCapture(e.pointerId);
    var brd = box.getBoundingClientRect(), left = wrap.getBoundingClientRect().left;
    function mv(ev) { it.w = clamp((ev.clientX - left) / brd.width * 100, 12, 100 - it.x); wrap.style.width = it.w + "%"; }
    function up() { wrap.removeEventListener("pointermove", mv); }
    wrap.addEventListener("pointermove", mv); wrap.addEventListener("pointerup", up, { once: true });
  }
  function coverToPNGBlob(cover) {
    return new Promise(function (resolve) {
      var W = 1080, H = 1800, c = document.createElement("canvas"); c.width = W; c.height = H; var ctx = c.getContext("2d");
      ctx.fillStyle = cover.bg || "#ebebef"; ctx.fillRect(0, 0, W, H);
      var items = cover.items.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
      Promise.all(items.map(function (it) { return new Promise(function (r) { var im = new Image(); im.onload = function () { r({ it: it, im: im }); }; im.onerror = function () { r(null); }; im.src = it.src; }); }))
        .then(function (arr) {
          // every picture on the cover hangs as a print (the photo out of its window, if it has one)
          var tilts = [-2.3, 2, -1.1, 2.6], tapes = ["top", "corner", "top", "both"];
          arr.forEach(function (o) { if (!o) return; var i = cover.items.indexOf(o.it); Prints.draw(ctx, o.im, o.it.x / 100 * W, o.it.y / 100 * H, o.it.w / 100 * W, { window: Prints.isWindow(o.it.src, o.it), angle: tilts[i % 4] * Math.PI / 180, tape: tapes[i % 4] }); });
          c.toBlob(resolve, "image/png");
        });
    });
  }
  function coverField() {
    var wrap = document.createElement("div");
    var box = document.createElement("div"); box.className = "cover-board";
    if (typeof state.cover === "string" && state.cover) { box.classList.add("cover-static"); var si = document.createElement("img"); si.src = state.cover; box.appendChild(si); }
    else if (coverIsBoard()) {
      box.style.background = state.cover.bg || "#ebebef";
      if (!state.cover.items.length) { var e0 = document.createElement("div"); e0.className = "cover-empty"; e0.textContent = "Add up to 4 images"; box.appendChild(e0); }
      state.cover.items.forEach(function (it) { box.appendChild(renderCoverItem(it, box)); });
    } else { box.classList.add("cover-static"); var e1 = document.createElement("div"); e1.className = "cover-empty"; e1.textContent = "No cover"; box.appendChild(e1); }
    wrap.appendChild(box);
    var btns = document.createElement("div"); btns.className = "cover-btns";
    var count = coverIsBoard() ? state.cover.items.length : 0;
    var add = document.createElement("button"); add.className = "sbtn"; add.type = "button"; add.textContent = count >= 4 ? "Max 4 images" : "Add image"; add.disabled = count >= 4; add.addEventListener("click", coverAddImage); btns.appendChild(add);
    var full = document.createElement("button"); full.className = "sbtn"; full.type = "button"; full.textContent = "Full image"; full.title = "One picture filling the whole cover"; full.addEventListener("click", coverSetFull); btns.appendChild(full);
    if (state.cover) { var rm = document.createElement("button"); rm.className = "sbtn"; rm.type = "button"; rm.textContent = "Clear"; rm.addEventListener("click", function () { state.cover = null; renderInspector(); }); btns.appendChild(rm); }
    wrap.appendChild(btns);
    if (coverIsBoard()) {
      var sw = document.createElement("div"); sw.className = "insp-swatches"; sw.style.marginTop = "8px";
      ["#ebebef", "#111113", "#f4ece2", "#dfe7e4", "#ffffff"].forEach(function (col) { var s = document.createElement("button"); s.type = "button"; s.style.background = col; s.addEventListener("click", function () { state.cover.bg = col; renderInspector(); }); sw.appendChild(s); });
      wrap.appendChild(sw);
    }
    var hint = document.createElement("div"); hint.className = "insp-empty"; hint.style.marginTop = "8px"; hint.textContent = "The card thumbnail (3:5). Add up to 4 images, drag to place, drag the ⤡ corner to resize — or pick one Full image to fill it.";
    wrap.appendChild(hint);
    return wrap;
  }

  // the room's paper tone on the site (a pale tint; "" = the table's grey)
  var TONES = [
    ["", "#e6e4e6", "Grey"], ["#e9e4dc", "#e9e4dc", "Sand"], ["#dcd8d2", "#dcd8d2", "Stone"], ["#dfe2e5", "#dfe2e5", "Mist"],
    ["#2c2b2d", "#2c2b2d", "Graphite"], ["#26292c", "#26292c", "Slate"], ["#332c27", "#332c27", "Umber"], ["#221d1a", "#221d1a", "Espresso"]
  ];
  // the canvas wears the room's tone, so what you write is seen on its real
  // wall (dark tones flip the text, as on the site); hovering a swatch tries it on
  var canvasEl = document.querySelector(".studio-canvas");
  function toneDark(hex) {
    var n = parseInt(String(hex).slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
  }
  function paintRoom(tone) {
    if (!canvasEl) return;
    var c = tone || "#e6e4e6";
    canvasEl.style.backgroundColor = c;
    canvasEl.classList.toggle("is-dark-room", toneDark(c));
  }
  // the photograph that hangs in the frame on the curation feed: any picture of the topic (Auto = the first one)
  function topicPictures() {
    var out = [];
    // as the site picks it: a photo cover first, then the topic's pictures in order
    if (typeof state.cover === "string" && state.cover && !/\.png($|\?)/i.test(state.cover)) out.push(state.cover);
    state.blocks.forEach(function (b) {
      if (b.type === "image" && b.src && out.indexOf(b.src) < 0) out.push(b.src);
      if (b.type === "board") b.items.slice().sort(function (a, d) { return (a.z || 0) - (d.z || 0); })
        .forEach(function (it) { if (it.kind !== "video" && it.src && out.indexOf(it.src) < 0) out.push(it.src); });
    });
    return out;
  }
  // a picture as a plain photo (a board window loses its Preview frame), for the share card
  function barePhotoURL(src) {
    return new Promise(function (res) {
      if (!window.Prints || !Prints.isWindow(src)) { res(src); return; }
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function () {
        var r = Prints.bare(im), c = document.createElement("canvas"); c.width = Math.round(r.w); c.height = Math.round(r.h);
        c.getContext("2d").drawImage(im, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
        c.toBlob(function (b) { res(b ? URL.createObjectURL(b) : src); }, "image/jpeg", 0.92);
      };
      im.onerror = function () { res(src); }; im.src = src;
    });
  }
  function feedThumb(src) {                 // at most 900 px wide, JPEG
    return new Promise(function (res) {
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function () {
        var w = Math.min(900, im.naturalWidth), c = document.createElement("canvas"); c.width = w; c.height = Math.round(w * im.naturalHeight / im.naturalWidth);
        var g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(im, 0, 0, c.width, c.height);
        c.toBlob(res, "image/jpeg", 0.82);
      };
      im.onerror = function () { res(null); }; im.src = src;
    });
  }
  function feedField() {
    var wrap = document.createElement("div"), pics = topicPictures();
    if (!pics.length) { var e = document.createElement("div"); e.className = "insp-empty"; e.textContent = "Add a picture or a board to the topic first."; wrap.appendChild(e); return wrap; }
    if (state.feed && pics.indexOf(state.feed) < 0) state.feed = "";
    var grid = document.createElement("div"); grid.className = "feed-pics";
    pics.forEach(function (src, k) {
      var b = document.createElement("button"); b.type = "button"; b.className = "feed-pic";
      var on = state.feed ? state.feed === src : k === 0;
      b.setAttribute("aria-pressed", String(on)); b.title = k === 0 ? "Automatic" : "Picture " + (k + 1);
      var im = document.createElement("img"); im.alt = ""; im.draggable = false; b.appendChild(im);
      if (window.Prints && Prints.isWindow(src)) {
        im.addEventListener("load", function () {           // a window: show just its photo
          if (im.dataset.cut) return; im.dataset.cut = "1";
          var r = Prints.bare(im), c = document.createElement("canvas"); c.width = 160; c.height = Math.round(160 * r.h / r.w);
          c.getContext("2d").drawImage(im, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height); im.src = c.toDataURL("image/jpeg", 0.85);
        });
      }
      im.src = src;
      if (k === 0) { var t = document.createElement("span"); t.textContent = "Auto"; b.appendChild(t); }
      b.addEventListener("click", function () { state.feed = k === 0 ? "" : src; renderInspector(); });
      grid.appendChild(b);
    });
    var note = document.createElement("div"); note.className = "insp-empty"; note.style.marginTop = "8px";
    note.textContent = "Hangs in the frame on the curation page; also the link preview and the Instagram cover.";
    wrap.appendChild(grid); wrap.appendChild(note);
    return wrap;
  }
  function toneName(tone) { var t = TONES.filter(function (x) { return x[0] === (tone || ""); })[0]; return t ? t[2] : "Custom"; }
  function toneField() {
    var wrap = document.createElement("div");
    var sw = document.createElement("div"); sw.className = "insp-swatches";
    var note = document.createElement("div"); note.className = "insp-empty"; note.style.marginTop = "8px";
    function say(tone, trying) { note.textContent = toneName(tone) + (toneDark(tone || "#e6e4e6") ? " (dark)" : "") + (trying ? " — previewing on the canvas" : " — the canvas shows the room"); }
    TONES.forEach(function (t) {
      var s = document.createElement("button"); s.type = "button"; s.style.background = t[1]; s.title = t[2];
      if ((state.tone || "") === t[0]) s.classList.add("is-on");
      s.addEventListener("click", function () { state.tone = t[0]; paintRoom(state.tone); renderInspector(); });
      s.addEventListener("mouseenter", function () { paintRoom(t[0]); say(t[0], true); });
      s.addEventListener("mouseleave", function () { paintRoom(state.tone); say(state.tone, false); });
      sw.appendChild(s);
    });
    say(state.tone, false);
    wrap.appendChild(sw); wrap.appendChild(note);
    return wrap;
  }
  // the topic's soundtrack: a YouTube link, named from Apple's catalogue;
  // shown on the site as one quiet line under the title and author
  function songChanged() { paintTune(); renderInspector(); }
  function paintTune() {
    var el = document.getElementById("docTune"); if (!el) return;
    var sg = state.song;
    el.hidden = !(sg && youtubeId(sg.src));
    el.querySelector("span").textContent = sg ? (sg.title || "Untitled") + (sg.artist ? " · " + sg.artist : "") : "";
  }
  function soundtrackField() {
    var wrap = document.createElement("div"), deb;
    var sg = state.song || { src: "" };
    wrap.appendChild(textInput(sg.src, "YouTube link", function (v) {
      v = v.trim(); clearTimeout(deb);
      if (!v) { state.song = null; paintTune(); return; }
      if (state.song && v === state.song.src) return;
      state.song = { src: v, title: "", artist: "", album: "", art: "", start: 0 };
      deb = setTimeout(function () { songLookup(state.song); }, 400);
    }));
    if (state.song && youtubeId(state.song.src)) {
      var s2 = state.song;
      var row = document.createElement("div"); row.className = "insp-pair";
      row.appendChild(textInput(s2.title, "Track", function (v) { s2.title = v; paintTune(); }));
      row.appendChild(textInput(s2.artist, "Artist", function (v) { s2.artist = v; paintTune(); }));
      wrap.appendChild(row);
      var btns = document.createElement("div"); btns.className = "cover-btns";
      var swp = document.createElement("button"); swp.type = "button"; swp.className = "sbtn"; swp.textContent = "⇄ Swap";
      swp.addEventListener("click", function () { var t = s2.title; s2.title = s2.artist; s2.artist = t; songChanged(); });
      var rl = document.createElement("button"); rl.type = "button"; rl.className = "sbtn"; rl.textContent = "Look up again";
      rl.addEventListener("click", function () { songLookup(s2); });
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "sbtn"; rm.textContent = "Remove";
      rm.addEventListener("click", function () { state.song = null; songChanged(); });
      btns.appendChild(swp); btns.appendChild(rl); btns.appendChild(rm); wrap.appendChild(btns);
      var st = textInput(s2.start ? Math.floor(s2.start / 60) + ":" + ("0" + (s2.start % 60)).slice(-2) : "", "Start at 0:00", function (v) {
        var m = String(v).trim().match(/^(?:(\d+):)?(\d{1,2})$/); s2.start = m ? (+(m[1] || 0)) * 60 + (+m[2]) : 0;
      });
      st.style.marginTop = "8px"; wrap.appendChild(st);
    }
    var h = document.createElement("div"); h.className = "insp-empty"; h.style.marginTop = "8px";
    h.textContent = state.song && state.song.art ? "Found in Apple Music. Plays from YouTube, under the title on the site." : "Paste a YouTube link — it plays from a quiet line under the title.";
    wrap.appendChild(h);
    return wrap;
  }
  // Topic · Block: the panel shows one or the other. Selecting a block opens Block;
  // clicking the empty page opens Topic; the tabs switch by hand any time.
  var inspTab = "topic", inspSeen = null;
  function blockName(b) {
    var n = ({ hand: "Handwritten", sign: "Signature" })[b.type] || (b.type.charAt(0).toUpperCase() + b.type.slice(1));
    var same = state.blocks.filter(function (x) { return x.type === b.type; });
    if (same.length > 1) n += " " + (same.indexOf(b) + 1);
    if (b.type === "board") n += " \u00B7 " + b.items.length + (b.items.length === 1 ? " picture" : " pictures");
    return n;
  }
  function inspTabs() {
    var seg = document.createElement("div"); seg.className = "insp-tabs"; seg.setAttribute("role", "tablist");
    var b = selectedId && blockById(selectedId);
    [["topic", "Topic"], ["block", "Block"]].forEach(function (t) {
      var btn = document.createElement("button"); btn.type = "button"; btn.setAttribute("role", "tab");
      btn.textContent = t[1]; btn.setAttribute("aria-selected", String(inspTab === t[0]));
      btn.addEventListener("click", function () { inspTab = t[0]; renderInspector(); });
      seg.appendChild(btn);
    });
    var wrap = document.createElement("div"); wrap.className = "insp-head"; wrap.appendChild(seg);
    var crumb = document.createElement("div"); crumb.className = "insp-crumb";
    crumb.textContent = inspTab === "topic" ? (state.title || "Untitled topic") : b ? blockName(b) : "No block selected";
    wrap.appendChild(crumb);
    return wrap;
  }
  function renderInspector() {
    inspectorEl.innerHTML = "";
    if (selectedId !== inspSeen) { inspSeen = selectedId; inspTab = selectedId ? "block" : "topic"; }
    inspectorEl.appendChild(inspTabs());
    if (inspTab === "block") { renderBlockInspector(); return; }
    var docSec = document.createElement("div"); docSec.className = "insp-section";
    docSec.appendChild(field("Author", authorSelect()));
    docSec.appendChild(field("Cover photo", feedField()));
    var descTa = document.createElement("textarea"); descTa.className = "insp-input insp-textarea"; descTa.rows = 3;
    descTa.placeholder = "Short blurb shown on the card (leave empty to auto-use the opening line)";
    descTa.value = state.desc || "";
    descTa.addEventListener("input", function () { state.desc = descTa.value; });
    docSec.appendChild(field("Description", descTa));
    docSec.appendChild(field("Themes", themesField()));
    var inspTa = document.createElement("textarea"); inspTa.className = "insp-input insp-textarea"; inspTa.rows = 3;
    inspTa.placeholder = "Sources / inspiration — one per line";
    inspTa.value = state.inspiration || "";
    inspTa.addEventListener("input", function () { state.inspiration = inspTa.value; });
    docSec.appendChild(field("Inspiration", inspTa));
    docSec.appendChild(field("Room tone", toneField()));
    docSec.appendChild(field("Soundtrack (optional)", soundtrackField()));
    inspectorEl.appendChild(docSec);
  }
  function renderBlockInspector() {
    var b = selectedId && blockById(selectedId);
    var sec = document.createElement("div"); sec.className = "insp-section";
    var st = document.createElement("div"); st.className = "insp-title";
    if (!b) {
      var boards = state.blocks.filter(function (x) { return x.type === "board"; });
      if (boards.length) {
        st.textContent = "Export boards"; sec.appendChild(st);
        var list = document.createElement("div"); list.className = "insp-items"; var checks = [];
        boards.forEach(function (bd, i) {
          var row = document.createElement("label"); row.className = "insp-check";
          var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true;
          var sp = document.createElement("span"); sp.textContent = "Board " + (i + 1) + " · " + bd.items.length + " img";
          row.appendChild(cb); row.appendChild(sp); list.appendChild(row); checks.push({ cb: cb, bd: bd });
        });
        sec.appendChild(list);
        var exp = document.createElement("button"); exp.className = "sbtn primary"; exp.type = "button"; exp.textContent = "Export selected as PNG";
        exp.addEventListener("click", function () {
          checks.filter(function (c) { return c.cb.checked; })
                .forEach(function (c, k) { setTimeout(function () { boardHasVideo(c.bd) ? exportBoardToWebM(c.bd) : exportBoardToPNG(c.bd); }, k * 800); });
        });
        sec.appendChild(exp);
      } else {
        var e = document.createElement("div"); e.className = "insp-empty";
        e.textContent = "Click a block on the page to edit it, or press + to add one.";
        sec.appendChild(e);
      }
      inspectorEl.appendChild(sec); return;
    }

    if (b.type === "text") {
      var seg = document.createElement("div"); seg.className = "insp-seg";
      ["Paragraph", "Heading"].forEach(function (name, i) {
        var btn = document.createElement("button"); btn.type = "button"; btn.textContent = name;
        btn.setAttribute("aria-pressed", (b.head ? 1 : 0) === i ? "true" : "false");
        btn.addEventListener("click", function () { b.head = i === 1; render(); select(b.id); });
        seg.appendChild(btn);
      });
      sec.appendChild(field("Style", seg));
    } else if (b.type === "image") {
      sec.appendChild(field("Image URL", textInput(b.src, "https://… or use the picker", function (v) { b.src = v; rerenderBlock(b.id); })));
      sec.appendChild(field(lang === "en" ? "Alt text" : "Alt text (FR)", textInput(tr(b, "alt"), hint(b, "alt", "Describe the image"), function (v) { setTr(b, "alt", v); })));
      focusNoteField(sec, b);
      var wseg = document.createElement("div"); wseg.className = "insp-seg";
      ["Full", "Inset"].forEach(function (name, i) {
        var btn = document.createElement("button"); btn.type = "button"; btn.textContent = name;
        btn.setAttribute("aria-pressed", (b.inset ? 1 : 0) === i ? "true" : "false");
        btn.addEventListener("click", function () { b.inset = i === 1; applyImageWidth(b); seg2press(wseg, i); });
        wseg.appendChild(btn);
      });
      sec.appendChild(field("Width", wseg));
      var pick = document.createElement("button"); pick.className = "sbtn"; pick.type = "button"; pick.textContent = "Choose file…";
      pick.addEventListener("click", function () { pickImage(b); });
      sec.appendChild(pick);
      if (b.orig) { var wsec = document.createElement("div"); wsec.className = "insp-sub"; winControls(wsec, b, b.id); sec.appendChild(wsec); }
    } else if (b.type === "video") {
      sec.appendChild(field("Video URL", textInput(b.src, "YouTube link or .mp4", function (v) { b.src = v; rerenderBlock(b.id); })));
      var vhint = document.createElement("div"); vhint.className = "insp-empty"; vhint.textContent = "YouTube links embed automatically; direct .mp4 files get a player. Caption: type under the video; select text to format it.";
      sec.appendChild(vhint);
      var vf = document.createElement("div"); vf.className = "insp-seg"; vf.style.marginTop = "12px";
      ["Window", "Plain"].forEach(function (name, i) {
        var btn = document.createElement("button"); btn.type = "button"; btn.textContent = name;
        btn.setAttribute("aria-pressed", (b.frame === false ? 1 : 0) === i ? "true" : "false");
        btn.addEventListener("click", function () { b.frame = i === 0; rerenderBlock(b.id); renderInspector(); });
        vf.appendChild(btn);
      });
      sec.appendChild(field("Frame", vf));
      if (b.frame !== false) {
        var vdeb;
        sec.appendChild(field("Window title", textInput(b.wtitle || "", videoWinTitle(Object.assign({}, b, { wtitle: "" })), function (v) {
          b.wtitle = v; clearTimeout(vdeb); vdeb = setTimeout(function () { rerenderBlock(b.id); }, 250);
        })));
      }
    } else if (b.type === "hand" || b.type === "sign") {
      var hh = document.createElement("div"); hh.className = "insp-empty";
      hh.textContent = b.type === "sign"
        ? "Your signature, in your own hand — set at the right, to close the topic. Empty = your author name."
        : "A note in your own handwriting. Plain letters only: the font has no accents (é, à…), those fall back to the serif.";
      sec.appendChild(hh);
    } else if (b.type === "quote") {
      var qh = document.createElement("div"); qh.className = "insp-empty";
      qh.textContent = "Type the quote on the canvas, and who said it underneath. Quote marks are added for you.";
      sec.appendChild(qh);
    } else if (b.type === "board") {
      // background: swatches + colour picker
      var colorRow = document.createElement("div"); colorRow.className = "insp-color";
      var sw = document.createElement("div"); sw.className = "insp-swatches";
      ["none", "#ebebef", "#111113", "#f4ece2", "#dfe7e4", "#ffffff"].forEach(function (c) {
        var s = document.createElement("button"); s.type = "button";
        if (c === "none") { s.className = "sw-none"; s.title = "No background"; } else s.style.background = c;
        s.addEventListener("click", function () { b.bg = c; render(); select(b.id); });
        sw.appendChild(s);
      });
      var cp = document.createElement("input"); cp.type = "color"; cp.value = (b.bg && b.bg[0] === "#") ? b.bg : "#ebebef";
      cp.addEventListener("input", function () { b.bg = cp.value; render(); select(b.id); });
      colorRow.appendChild(cp); colorRow.appendChild(sw);
      sec.appendChild(field("Background", colorRow));
      // image list
      if (b.items.length) {
        var list = document.createElement("div"); list.className = "insp-items";
        b.items.forEach(function (it) {
          var row = document.createElement("div"); row.className = "insp-item" + (b.sel === it.id ? " is-sel" : ""); row.dataset.iid = it.id;
          row.addEventListener("click", function (e) {
            if (e.target.closest(".irm")) return;
            b.sel = it.id; var bd = blocksEl.querySelector('.block[data-id="' + b.id + '"] .b-board'); if (bd) selItem(bd, it.id); renderInspector();
          });
          var th = document.createElement(it.kind === "video" ? "video" : "img"); th.className = "thumb"; if (it.src) th.src = it.src; th.muted = true; row.appendChild(th);
          var nm = document.createElement("span"); nm.className = "iname"; nm.textContent = (it.win && it.win.type === "text") ? "Text window" : (it.name || "image"); row.appendChild(nm);
          var rm = document.createElement("button"); rm.type = "button"; rm.className = "irm"; rm.innerHTML = "&times;"; rm.title = "Remove";
          rm.addEventListener("click", function () { b.items = b.items.filter(function (x) { return x.id !== it.id; }); render(); select(b.id); });
          row.appendChild(rm); list.appendChild(row);
        });
        sec.appendChild(field("Media (" + b.items.length + "/6)", list));
        var selIt = b.items.filter(function (x) { return x.id === b.sel; })[0];
        if (selIt) {
          var isub = document.createElement("div"); isub.className = "insp-sub";
          var ih = document.createElement("div"); ih.className = "insp-subtitle"; ih.textContent = (selIt.win && selIt.win.type === "text") ? "Text window" : (selIt.kind === "video" ? "Video" : "Image");
          isub.appendChild(ih);
          if (selIt.kind === "video" || selIt.win || selIt.orig) winControls(isub, selIt, b.id);
          if (selIt.kind !== "video") focusNoteField(isub, selIt);
          else { var nx = document.createElement("div"); nx.className = "insp-empty"; nx.textContent = "A window screenshot — used as it is."; isub.appendChild(nx); }
          sec.appendChild(isub);
        }
      }
      var full = b.items.length >= 6;
      var addRow = document.createElement("div"); addRow.className = "insp-seg";
      var addImg = document.createElement("button"); addImg.type = "button"; addImg.textContent = "Add image"; addImg.disabled = full;
      addImg.addEventListener("click", function () { addBoardMedia(b, "image"); });
      var addVid = document.createElement("button"); addVid.type = "button"; addVid.textContent = "Add video"; addVid.disabled = full;
      addVid.addEventListener("click", function () { addBoardMedia(b, "video"); });
      var addTxt = document.createElement("button"); addTxt.type = "button"; addTxt.textContent = "Add text"; addTxt.disabled = full;
      addTxt.addEventListener("click", function () { addTextWindow(b); });
      addRow.appendChild(addImg); addRow.appendChild(addVid); addRow.appendChild(addTxt);
      sec.appendChild(addRow);
      if (full) { var mx = document.createElement("div"); mx.className = "insp-empty"; mx.style.marginTop = "6px"; mx.textContent = "Maximum 6 items."; sec.appendChild(mx); }
      var bh = document.createElement("div"); bh.className = "insp-empty"; bh.style.marginTop = "10px";
      bh.textContent = "Drop or add images and videos — each picture hangs as a print, its note written underneath. Drag to place, drag the ⤡ corner to resize.";
      sec.appendChild(bh);
      var hasVid = boardHasVideo(b);
      var bexp = document.createElement("button"); bexp.className = "sbtn primary"; bexp.type = "button"; bexp.style.marginTop = "12px";
      bexp.textContent = hasVid ? "Export as WebM (loop)" : "Export as PNG";
      bexp.disabled = !b.items.length;
      bexp.addEventListener("click", function () { hasVid ? exportBoardToWebM(b, bexp) : exportBoardToPNG(b); });
      sec.appendChild(bexp);
    }
    inspectorEl.appendChild(sec);
  }
  function seg2press(seg, idx) {
    [].forEach.call(seg.children, function (c, i) { c.setAttribute("aria-pressed", i === idx ? "true" : "false"); });
  }
  function applyImageWidth(b) {
    var el = blocksEl.querySelector('.block[data-id="' + b.id + '"]');
    if (el) el.classList.toggle("w-inset", !!b.inset);
  }

  /* ---------- add / remove ---------- */
  // the usual closing note, signed +3 (plain letters: the hand has no accents);
  // on the site its last line becomes the signature
  var SIGNOFF = {
    en: "Thanks for reading,\nSee you on the next one,\n+3",
    fr: "Merci de m'avoir lu,\nOn se retrouve au prochain,\n+3"
  };
  function addBlock(type) {
    var b = type === "text" ? { id: uid(), type: "text", head: false, html: "" }
          : type === "image" ? { id: uid(), type: "image", src: "", alt: "", caption: "", inset: false }
          : type === "video" ? { id: uid(), type: "video", src: "", caption: "" }
          : type === "quote" ? { id: uid(), type: "quote", text: "", cite: "" }
          : type === "hand" ? { id: uid(), type: "hand", text: "" }
          : type === "sign" ? { id: uid(), type: "sign", text: "" }
          : type === "signoff" ? { id: uid(), type: "hand", text: SIGNOFF.en, fr: { text: SIGNOFF.fr } }
          : { id: uid(), type: "board", bg: "none", items: [], zc: 0 };
    // the sign-off always closes the article, whatever is selected
    var i = selectedId && type !== "signoff" ? state.blocks.findIndex(function (x) { return x.id === selectedId; }) : state.blocks.length - 1;
    state.blocks.splice(i + 1, 0, b);
    render(); select(b.id);
  }
  function removeBlock(id) {
    state.blocks = state.blocks.filter(function (b) { return b.id !== id; });
    if (selectedId === id) selectedId = null;
    render();
  }
  function pickImage(b) {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      b.src = URL.createObjectURL(f); b.name = f.name; render(); select(b.id); prepImage(b, b.id);
    });
    inp.click();
  }
  function pickVideo(b) {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "video/*";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      b.src = URL.createObjectURL(f); b.name = f.name; render(); select(b.id);
    });
    inp.click();
  }

  /* ---------- drag to reorder (pointer-based, 1:1, spring settle) ---------- */
  var drag = null;
  function startDrag(e, el, id) {
    e.preventDefault();
    var r = el.getBoundingClientRect();
    var ph = document.createElement("div");
    ph.className = "block-placeholder";
    ph.style.height = r.height + "px";
    el.style.setProperty("--drag-w", r.width + "px");
    el.parentNode.insertBefore(ph, el);
    el.classList.add("is-dragging");
    document.body.style.cursor = "grabbing";
    drag = { el: el, id: id, ph: ph, offX: e.clientX - r.left, offY: e.clientY - r.top };
    moveDrag(e);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag, { once: true });
  }
  function moveDrag(e) {
    if (!drag) return;
    drag.el.style.left = (e.clientX - drag.offX) + "px";
    drag.el.style.top = (e.clientY - drag.offY) + "px";
    var items = [].slice.call(blocksEl.querySelectorAll(".block:not(.is-dragging)"));
    var placed = false;
    for (var i = 0; i < items.length; i++) {
      var r = items[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { blocksEl.insertBefore(drag.ph, items[i]); placed = true; break; }
    }
    if (!placed) blocksEl.appendChild(drag.ph);
  }
  function endDrag() {
    if (!drag) return;
    window.removeEventListener("pointermove", moveDrag);
    drag.el.classList.remove("is-dragging");
    drag.el.style.left = drag.el.style.top = "";
    drag.ph.parentNode.insertBefore(drag.el, drag.ph);
    drag.ph.remove();
    document.body.style.cursor = "";
    var order = [].map.call(blocksEl.querySelectorAll(".block"), function (b) { return b.dataset.id; });
    state.blocks.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
    drag = null;
  }

  /* ---------- picker popover ---------- */
  function openPicker(anchor) {
    var r = anchor.getBoundingClientRect();
    pickerEl.hidden = false; // unhide first so we can measure it
    var pw = pickerEl.offsetWidth, ph = pickerEl.offsetHeight, m = 8;
    var left = clamp(r.left + r.width / 2 - pw / 2, m, window.innerWidth - pw - m);
    var below = r.bottom + m, above = r.top - ph - m;
    var flip = below + ph > window.innerHeight - m && above >= m; // no room below → open upward
    pickerEl.style.left = Math.round(left) + "px";
    pickerEl.style.top = Math.round(flip ? above : Math.min(below, window.innerHeight - ph - m)) + "px";
    pickerEl.style.transformOrigin = flip ? "bottom center" : "top center";
  }
  function closePicker() { pickerEl.hidden = true; }
  pickerEl.addEventListener("click", function (e) {
    var it = e.target.closest(".picker-item"); if (!it) return;
    addBlock(it.dataset.type); closePicker();
  });

  /* ---------- top bar ---------- */
  /* ---------- export: a ZIP of each media block (image/board → PNG, video/video-board → GIF) ---------- */
  function loadImg(src) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; }); }
  function imageToPNGBlob(src) {
    return loadImg(src).then(function (im) {
      var c = document.createElement("canvas"); c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
      c.getContext("2d").drawImage(im, 0, 0);
      return new Promise(function (res) { c.toBlob(res, "image/png"); });
    });
  }
  function ensureGifWorker() {
    if (window.__gifWorker) return Promise.resolve(window.__gifWorker);
    return fetch("https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js").then(function (r) { return r.text(); })
      .then(function (t) { window.__gifWorker = URL.createObjectURL(new Blob([t], { type: "application/javascript" })); return window.__gifWorker; });
  }
  function videoToGIFBlob(src, worker) {
    return new Promise(function (resolve, reject) {
      var v = document.createElement("video"); v.src = src; v.muted = true; v.playsInline = true;
      v.addEventListener("loadeddata", function () {
        var MAXW = 480, scale = Math.min(1, MAXW / (v.videoWidth || MAXW));
        var w = Math.round((v.videoWidth || MAXW) * scale) || MAXW, h = Math.round((v.videoHeight || MAXW) * scale) || MAXW;
        var c = document.createElement("canvas"); c.width = w; c.height = h; var ctx = c.getContext("2d");
        var fps = 10, delay = Math.round(1000 / fps), dur = Math.min(6, v.duration || 3);
        var gif = new GIF({ workers: 2, quality: 10, width: w, height: h, workerScript: worker });
        var start = null, last = -1; v.play();
        function tick(ts) { if (start === null) start = ts; var t = (ts - start) / 1000;
          if (t - last >= 1 / fps - 0.001) { ctx.clearRect(0, 0, w, h); ctx.drawImage(v, 0, 0, w, h); gif.addFrame(ctx, { copy: true, delay: delay }); last = t; }
          if (t < dur) requestAnimationFrame(tick); else { v.pause(); gif.on("finished", resolve); gif.render(); }
        }
        requestAnimationFrame(tick);
      }, { once: true });
      v.addEventListener("error", function () { reject(new Error("video load failed")); }, { once: true });
      v.load();
    });
  }
  function boardToGIFBlob(b, worker) {
    return new Promise(function (resolve) {
      var SIZE = 720, c = document.createElement("canvas"); c.width = c.height = SIZE; var ctx = c.getContext("2d");
      var items = b.items.slice().sort(function (a, d) { return (a.z || 0) - (d.z || 0); });
      loadBoardMedia(items).then(function (media) {
        var durs = media.filter(function (m) { return m.vid; }).map(function (m) { return m.el.duration; }).filter(function (d) { return isFinite(d) && d > 0; });
        var dur = Math.min(6, durs.length ? Math.max.apply(null, durs) : 3), fps = 10, delay = Math.round(1000 / fps);
        var gif = new GIF({ workers: 2, quality: 10, width: SIZE, height: SIZE, workerScript: worker });
        media.forEach(function (m) { if (m.vid) { try { m.el.currentTime = 0; } catch (e) {} m.el.play().catch(function () {}); } });
        var start = null, last = -1;
        function tick(ts) { if (start === null) start = ts; var t = (ts - start) / 1000;
          if (t - last >= 1 / fps - 0.001) {
            fillBoard(ctx, b, SIZE, true);
            media.forEach(function (m) { drawBoardMedia(ctx, m, SIZE); });
            gif.addFrame(ctx, { copy: true, delay: delay }); last = t;
          }
          if (t < dur) requestAnimationFrame(tick); else { media.forEach(function (m) { if (m.vid) m.el.pause(); }); gif.on("finished", resolve); gif.render(); }
        }
        requestAnimationFrame(tick);
      });
    });
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  async function exportBlocks(btn) {
    if (typeof JSZip === "undefined" || typeof GIF === "undefined") { alert("Export tools didn’t load (needs internet). Reload and try again."); return; }
    var label = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "Exporting…"; }
    try {
      var worker = await ensureGifWorker();
      var zip = new JSZip(), n = 0, any = false;
      for (var i = 0; i < state.blocks.length; i++) {
        var b = state.blocks[i];
        if (b.type === "text") continue;
        n++;
        if (b.type === "image") { if (!b.src) continue; zip.file(pad2(n) + "-image.png", await imageToPNGBlob(b.src)); any = true; }
        else if (b.type === "video") { if (!b.src || /youtu\.?be/.test(b.src)) continue; zip.file(pad2(n) + "-video.gif", await videoToGIFBlob(b.src, worker)); any = true; }
        else if (b.type === "board") { if (!b.items.length) continue; if (boardHasVideo(b)) zip.file(pad2(n) + "-board.gif", await boardToGIFBlob(b, worker)); else zip.file(pad2(n) + "-board.png", await boardToPNGBlob(b)); any = true; }
      }
      if (!any) { alert("Nothing to export — add an image, video or board first."); if (btn) { btn.textContent = label; btn.disabled = false; } return; }
      var out = await zip.generateAsync({ type: "blob" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(out); a.download = (slugify(state.title) || "topic") + "-export.zip";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    } catch (e) { alert("Export failed: " + (e && e.message || e)); }
    if (btn) { btn.textContent = label; btn.disabled = false; }
  }

  /* ---------- wire up ---------- */
  titleEl.addEventListener("input", function () { setTr(state, "title", titleEl.value); });
  var langSeg = document.getElementById("langSeg");
  langSeg.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-lang]"); if (!btn) return;
    if (btn.dataset.lang === "both") { if (!translating) setTranslating(true); return; }
    if (translating) { lang = btn.dataset.lang; document.querySelector(".doc").lang = lang; setTranslating(false); return; }
    if (btn.dataset.lang === lang) return;
    lang = btn.dataset.lang;
    [].forEach.call(langSeg.children, function (c) { c.setAttribute("aria-pressed", c === btn ? "true" : "false"); });
    document.querySelector(".doc").lang = lang;
    hideFmtBar();
    render();
    if (document.body.classList.contains("is-preview")) document.querySelectorAll(".b-text, .b-cap, .bq-text, .bq-cite, .bh-text, .bsg-text").forEach(function (t) { t.contentEditable = "false"; });
  });
  document.getElementById("addBlock").addEventListener("click", function (e) { e.stopPropagation(); openPicker(e.currentTarget); });
  document.getElementById("exportBtn").addEventListener("click", function () { exportBlocks(this); });
  document.getElementById("publishBtn").addEventListener("click", openPub);
  document.getElementById("previewBtn").addEventListener("click", function () {
    var on = document.body.classList.toggle("is-preview");
    this.textContent = on ? "Edit" : "Preview";
    document.querySelectorAll(".b-text, .b-cap, .bq-text, .bq-cite, .bh-text, .bsg-text").forEach(function (t) { t.contentEditable = on ? "false" : "true"; });
    if (on) hideFmtBar();
  });
  document.addEventListener("pointerdown", function (e) {
    if (!e.target.closest(".picker") && !e.target.closest("#addBlock")) closePicker();
    if (!e.target.closest(".block") && !e.target.closest(".studio-inspector") && !e.target.closest(".studio-bar")) {
      selectedId = null;
      document.querySelectorAll(".block.is-selected").forEach(function (el) { el.classList.remove("is-selected"); });
      renderInspector();
    }
  });

  // dropping a file anywhere else shouldn't make the browser navigate to it
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); });

  /* ---------- format bar: emphasis for selected text (text blocks + captions) ----------
     Pinned at the bottom of the canvas. Bold / italic / link use the browser's
     editing commands (keeps native undo); gradient + highlight are class spans. */
  var fmtBar = null, fmtBtns = {}, fmtLink = null, fmtRange = null;
  var FMT = [
    { k: "bold", label: "B", title: "Bold (⌘B)" },
    { k: "italic", label: "I", title: "Italic (⌘I)" },
    { k: "grad", label: "", title: "Gradient" },
    { k: "mark", label: "", title: "Highlight (⌘⇧H)" },
    { k: "link", label: "Link", title: "Link (⌘K)" },
    { k: "plain", label: "Plain", title: "Remove formatting" }
  ];
  var SPAN_CLS = { grad: "cap-grad", mark: "txt-mark" };
  function buildFmtBar() {
    if (fmtBar) return fmtBar;
    fmtBar = document.createElement("div"); fmtBar.className = "fmt-bar"; fmtBar.hidden = true;
    FMT.forEach(function (f, i) {
      if (f.k === "link" || f.k === "plain") { var sep = document.createElement("span"); sep.className = "fmt-sep"; fmtBar.appendChild(sep); }
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "fmt-btn fmt-" + f.k; btn.title = f.title;
      btn.setAttribute("aria-label", f.title); btn.textContent = f.label;
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); fmtApply(f.k); });
      fmtBtns[f.k] = btn; fmtBar.appendChild(btn);
    });
    // link entry: replaces the buttons while typing a URL
    fmtLink = document.createElement("form"); fmtLink.className = "fmt-url"; fmtLink.hidden = true; fmtLink.noValidate = true;
    var inp = document.createElement("input"); inp.type = "url"; inp.placeholder = "Paste a link…"; inp.spellcheck = false;
    var ok = document.createElement("button"); ok.type = "submit"; ok.className = "fmt-btn fmt-ok"; ok.textContent = "Add";
    fmtLink.appendChild(inp); fmtLink.appendChild(ok);
    fmtLink.addEventListener("submit", function (e) { e.preventDefault(); commitLink(inp.value.trim()); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); closeLinkEntry(true); } });
    inp.addEventListener("blur", function () { setTimeout(function () { if (!fmtLink.hidden && !fmtLink.contains(document.activeElement)) closeLinkEntry(false); }, 0); });
    fmtBar.appendChild(fmtLink);
    document.body.appendChild(fmtBar);
    return fmtBar;
  }
  function hideFmtBar() { if (fmtBar) { fmtBar.hidden = true; if (!fmtLink.hidden) closeLinkEntry(false); } }
  // the editable text (.b-text or .b-cap) holding a non-empty selection
  function fmtTarget() {
    var s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    var n = s.anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
    var t = el && el.closest && el.closest(".b-text, .b-cap");
    if (!t || !t.isContentEditable || !t.contains(s.focusNode)) return null;
    return t;
  }
  function inClass(node, sel, root) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    var hit = el && el.closest(sel);
    return hit && root.contains(hit) ? hit : null;
  }
  function fmtState(t) {
    var s = window.getSelection();
    var st = function (sel) { return !!(inClass(s.anchorNode, sel, t) && inClass(s.focusNode, sel, t)); };
    return {
      bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"),
      grad: st(".cap-grad"), mark: st(".txt-mark"), link: !!(inClass(s.anchorNode, "a", t) || inClass(s.focusNode, "a", t))
    };
  }
  function updateFmtBar() {
    var bar = buildFmtBar();
    if (!fmtLink.hidden) return; // typing a URL — keep the bar as is
    var t = fmtTarget();
    if (!t) { bar.hidden = true; return; }
    var st = fmtState(t);
    Object.keys(st).forEach(function (k) { fmtBtns[k].classList.toggle("is-on", st[k]); fmtBtns[k].setAttribute("aria-pressed", st[k] ? "true" : "false"); });
    fmtBtns.bold.disabled = t.classList.contains("b-head"); // headings are already bold
    // centre over the canvas, not the whole window (the inspector sits on the right)
    var cv = document.querySelector(".studio-canvas").getBoundingClientRect();
    bar.style.left = (cv.left + cv.width / 2) + "px";
    var wasHidden = bar.hidden; bar.hidden = false;
    if (wasHidden) { // first show: nudge the canvas so the bar never covers the selection
      var r = window.getSelection().getRangeAt(0).getBoundingClientRect(), top = bar.getBoundingClientRect().top - 16;
      if (r.bottom > top) document.querySelector(".studio-canvas").scrollTop += r.bottom - top;
    }
  }
  function fmtSaved(t) { t.dispatchEvent(new Event("input")); } // reuses each block's own save
  function unwrap(el) { while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el); el.remove(); }
  function toggleSpan(t, cls) {
    var sel = window.getSelection(), range = sel.getRangeAt(0);
    var hits = [].slice.call(t.querySelectorAll("." + cls)).filter(function (s) { return range.intersectsNode(s); });
    if (hits.length && fmtState(t)[cls === "cap-grad" ? "grad" : "mark"]) { hits.forEach(unwrap); t.normalize(); fmtSaved(t); return; }
    var span = document.createElement("span"); span.className = cls;
    try { span.appendChild(range.extractContents()); } catch (e) { return; }
    [].slice.call(span.querySelectorAll("." + cls)).forEach(unwrap);
    range.insertNode(span);
    [].slice.call(t.querySelectorAll("." + cls)).forEach(function (s) { if (!s.textContent) s.remove(); });
    t.normalize();
    var r = document.createRange(); r.selectNodeContents(span); sel.removeAllRanges(); sel.addRange(r);
    fmtSaved(t);
  }
  function fmtApply(k) {
    var t = fmtTarget(); if (!t) return;
    if (k === "bold" || k === "italic") { document.execCommand("styleWithCSS", false, false); document.execCommand(k); }
    else if (k === "grad" || k === "mark") toggleSpan(t, SPAN_CLS[k]);
    else if (k === "link") { if (fmtState(t).link) document.execCommand("unlink"); else openLinkEntry(); }
    else if (k === "plain") {
      document.execCommand("unlink"); document.execCommand("removeFormat");
      var range = window.getSelection().getRangeAt(0);
      [].slice.call(t.querySelectorAll(".cap-grad, .txt-mark, b, strong, i, em")).forEach(function (s) { if (range.intersectsNode(s)) unwrap(s); });
      t.normalize(); fmtSaved(t);
    }
    updateFmtBar();
  }
  function openLinkEntry() {
    fmtRange = window.getSelection().getRangeAt(0).cloneRange();
    fmtBar.classList.add("is-link"); fmtLink.hidden = false;
    var inp = fmtLink.querySelector("input"); inp.value = ""; inp.focus();
  }
  function closeLinkEntry(restore) {
    fmtLink.hidden = true; fmtBar.classList.remove("is-link");
    if (restore && fmtRange) {
      var c = fmtRange.commonAncestorContainer, host = (c.nodeType === 1 ? c : c.parentElement).closest(".b-text, .b-cap");
      if (host) host.focus({ preventScroll: true });
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(fmtRange);
    }
    fmtRange = null; updateFmtBar();
  }
  function commitLink(url) {
    var range = fmtRange; closeLinkEntry(true);
    if (!url || !range) return;
    if (!/^(https?:|mailto:|\/|#)/i.test(url)) url = "https://" + url;
    var t = fmtTarget(); if (!t) return;
    document.execCommand("createLink", false, url);
    [].slice.call(t.querySelectorAll("a")).forEach(function (a) {
      if (a.getAttribute("href") === url && /^https?:/i.test(url)) { a.target = "_blank"; a.rel = "noopener"; }
    });
    fmtSaved(t); updateFmtBar();
  }
  document.addEventListener("selectionchange", updateFmtBar);
  document.addEventListener("keydown", function (e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || !fmtTarget()) return;
    var key = e.key.toLowerCase();
    if (key === "k" && !e.shiftKey) { e.preventDefault(); fmtApply("link"); }
    else if (key === "h" && e.shiftKey) { e.preventDefault(); fmtApply("mark"); }
    else if ((key === "b" || key === "i") && !e.shiftKey) { e.preventDefault(); if (!(key === "b" && fmtBtns.bold.disabled)) fmtApply(key === "b" ? "bold" : "italic"); }
  });

  /* ---------- publishing to GitHub ---------- */
  var REPO = "02-alt/btbr-website", BRANCH = "minimalist-apps-showcase", TOKEN_KEY = "btbr_cur_token";
  function slugify(s) { return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function extFromType(t) {
    t = t || "";
    return t.indexOf("png") > -1 ? "png" : (t.indexOf("jpeg") > -1 || t.indexOf("jpg") > -1) ? "jpg"
      : t.indexOf("webp") > -1 ? "webp" : t.indexOf("gif") > -1 ? "gif" : t.indexOf("webm") > -1 ? "webm"
      : t.indexOf("quicktime") > -1 ? "mov" : t.indexOf("mp4") > -1 ? "mp4" : "bin";
  }
  // copy the non-empty French overrides of `keys` from studio block `b` onto `out`
  function withFr(out, b, keys) {
    var fr = {};
    keys.forEach(function (k) { var v = b.fr && b.fr[k]; if (v && plain(v)) fr[k] = v; });
    if (Object.keys(fr).length) out.fr = fr;
    return out;
  }
  function blobFromSrc(src) { return fetch(src).then(function (r) { return r.blob(); }); }
  function blobToBase64(blob) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(",")[1]); }; fr.readAsDataURL(blob); }); }
  function gh(path, opts, token) {
    opts = opts || {}; opts.headers = Object.assign({ "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json" }, opts.headers || {});
    return fetch("https://api.github.com" + path, opts).then(function (r) {
      return r.text().then(function (t) { var j = t ? JSON.parse(t) : {}; if (!r.ok) throw new Error((j && j.message) || ("HTTP " + r.status)); return j; });
    });
  }
  function boardToPNGBlob(b) {
    var SIZE = 2048; var c = document.createElement("canvas"); c.width = c.height = SIZE; var ctx = c.getContext("2d");
    fillBoard(ctx, b, SIZE, false);
    var items = b.items.slice().sort(function (a, d) { return (a.z || 0) - (d.z || 0); });
    return loadBoardMedia(items).then(function (media) {
      media.forEach(function (m) { drawBoardMedia(ctx, m, SIZE); });
      return new Promise(function (resolve) { c.toBlob(resolve, "image/png"); });
    });
  }
  function boardToWebMBlob(b) {
    return new Promise(function (resolve, reject) {
      if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) { reject(new Error("This browser can't record WebM")); return; }
      var SIZE = 1080; var c = document.createElement("canvas"); c.width = c.height = SIZE; var ctx = c.getContext("2d");
      var items = b.items.slice().sort(function (a, d) { return (a.z || 0) - (d.z || 0); });
      loadBoardMedia(items).then(function (media) {
        var durs = media.filter(function (m) { return m.vid; }).map(function (m) { return m.el.duration; }).filter(function (d) { return isFinite(d) && d > 0; });
        var loopMs = Math.min(15000, (durs.length ? Math.max.apply(null, durs) : 3) * 1000);
        var mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
        var rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 12000000 }); var chunks = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () { media.forEach(function (m) { if (m.vid) m.el.pause(); }); resolve(new Blob(chunks, { type: "video/webm" })); };
        media.forEach(function (m) { if (m.vid) { try { m.el.currentTime = 0; } catch (e) {} m.el.play().catch(function () {}); } });
        var raf; function frame() { fillBoard(ctx, b, SIZE, true); media.forEach(function (m) { drawBoardMedia(ctx, m, SIZE); }); raf = requestAnimationFrame(frame); }
        frame(); rec.start(); setTimeout(function () { cancelAnimationFrame(raf); if (rec.state !== "inactive") rec.stop(); }, loopMs + 120);
      });
    });
  }
  // a topic's shareable page: link previews read its tags, people are sent on into the room
  var SHARE_RESERVED = ["media", "topics"];
  function sharePage(t) {
    var e = function (v) { return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
    var slug = t.slug, url = "https://buildtoberemembered.com/curation/" + slug + "/", img = "https://buildtoberemembered.com/curation/media/" + slug + "/share.jpg?v=" + Date.now().toString(36); // a fresh address per publish, so link previews pick up the new picture
    var desc = (t.desc || "").trim(), ogd = (t.author ? t.author + " — " : "") + desc;
    return '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n'
      + '  <!-- a topic\'s shareable address: link previews read the tags below, people are sent straight into the room -->\n'
      + '  <title>' + e((t.title || "Untitled") + " — builtoberemembered") + '</title>\n'
      + '  <meta name="description" content="' + e(desc) + '" />\n  <meta name="robots" content="noindex, follow" />\n'
      + '  <link rel="canonical" href="' + url + '" />\n  <meta property="og:type" content="article" />\n  <meta property="og:site_name" content="builtoberemembered" />\n'
      + '  <meta property="og:title" content="' + e(t.title) + '" />\n  <meta property="og:description" content="' + e(ogd) + '" />\n'
      + '  <meta property="og:url" content="' + url + '" />\n  <meta property="og:image" content="' + img + '" />\n'
      + '  <meta property="og:image:width" content="2400" />\n  <meta property="og:image:height" content="1260" />\n'
      + '  <meta name="twitter:card" content="summary_large_image" />\n  <meta name="twitter:title" content="' + e(t.title) + '" />\n'
      + '  <meta name="twitter:description" content="' + e(ogd) + '" />\n  <meta name="twitter:image" content="' + img + '" />\n'
      + '  <meta name="theme-color" content="#e6e4e6" />\n'
      + '  <link rel="icon" type="image/png" sizes="64x64" href="/assets/favicon-p3-dark.png?v=5" media="(prefers-color-scheme: light)" />\n'
      + '  <link rel="icon" type="image/png" sizes="64x64" href="/assets/favicon-p3-light.png?v=5" media="(prefers-color-scheme: dark)" />\n'
      + '  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg?v=5" />\n'
      + '  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png?v=4" />\n'
      + '  <meta http-equiv="refresh" content="0; url=/curation/#' + slug + '" />\n'
      + '  <script>location.replace("/curation/#' + slug + '");</' + 'script>\n'
      + '  <style>html{background:#e6e4e6}</style>\n</head>\n<body></body>\n</html>\n';
  }
  async function publish(token, log, when) {
    log("Preparing…");
    var slug = editingSlug || slugify(state.title) || ("topic-" + Date.now());
    var date = new Date().toISOString().slice(0, 10);
    var files = [], outBlocks = [], cover = null, coverLocal = null, mi = 0;
    var placed = {};
    for (var i = 0; i < state.blocks.length; i++) {
      var b = state.blocks[i];
      if (b.type === "text") { outBlocks.push(withFr({ type: "text", head: !!b.head, html: b.html || "" }, b, ["html"])); }
      else if (b.type === "hand") { if ((b.text || "").trim()) outBlocks.push(withFr({ type: "hand", text: b.text.trim() }, b, ["text"])); }
      else if (b.type === "sign") { outBlocks.push(withFr({ type: "sign", text: (b.text || "").trim() || state.author || "" }, b, ["text"])); }
      else if (b.type === "quote") { if (plain(b.text)) outBlocks.push(withFr({ type: "quote", text: cleanRich(b.text || ""), cite: (b.cite || "").trim() }, b, ["text", "cite"])); }
      else if (b.type === "image") {
        if (!b.src) continue;
        if (b.src.indexOf("/curation/media/") === 0) { if (!cover) { cover = b.src; coverLocal = b.src; } placed[b.src] = b.src; outBlocks.push(withFr({ type: "image", src: b.src, alt: b.alt || "", caption: b.caption || "", note: b.note || "", inset: !!b.inset }, b, ["alt", "caption", "note"])); continue; }
        var bl = await blobFromSrc(b.src), ext = extFromType(bl.type), p = "curation/media/" + slug + "/img-" + (++mi) + "." + ext;
        files.push({ path: p, base64: await blobToBase64(bl) }); placed[b.src] = "/" + p; if (!cover) { cover = "/" + p; coverLocal = URL.createObjectURL(bl); }
        outBlocks.push(withFr({ type: "image", src: "/" + p, alt: b.alt || "", caption: b.caption || "", note: b.note || "", inset: !!b.inset }, b, ["alt", "caption", "note"]));
      } else if (b.type === "video") {
        if (!b.src) continue;
        var vwin = function (o) { if (b.frame === false) o.frame = false; else if (b.wtitle) o.wtitle = b.wtitle; else if (b.name) o.wtitle = b.name; if (b.board) o.board = true; return o; };
        if (/youtu\.?be/.test(b.src)) { outBlocks.push(withFr(vwin({ type: "video", src: b.src, caption: b.caption || "" }), b, ["caption"])); }
        else if (b.src.indexOf("/curation/media/") === 0) { outBlocks.push(withFr(vwin({ type: "video", src: b.src, caption: b.caption || "", loop: true }), b, ["caption"])); }
        else { var bl2 = await blobFromSrc(b.src), ext2 = extFromType(bl2.type), p2 = "curation/media/" + slug + "/vid-" + (++mi) + "." + ext2; files.push({ path: p2, base64: await blobToBase64(bl2) }); outBlocks.push(withFr(vwin({ type: "video", src: "/" + p2, caption: b.caption || "", loop: true }), b, ["caption"])); }
      } else if (b.type === "board") {
        if (!b.items.length) continue; var vid = boardHasVideo(b);
        log("Rendering board (" + (vid ? "WebM" : "PNG") + ")…");
        var bb = vid ? await boardToWebMBlob(b) : await boardToPNGBlob(b);
        var ext3 = vid ? "webm" : "png", p3 = "curation/media/" + slug + "/board-" + (++mi) + "." + ext3;
        files.push({ path: p3, base64: await blobToBase64(bb) });
        if (vid) outBlocks.push({ type: "video", src: "/" + p3, caption: "", loop: true, board: true });
        else {
          if (!cover) { cover = "/" + p3; coverLocal = URL.createObjectURL(bb); }
          // each picture on the board is kept too (its own file + where it sits),
          // so the site can open them one by one and Studio can re-edit the board
          var bitems = [], bsorted = b.items.slice().sort(function (a, d) { return (a.z || 0) - (d.z || 0); });
          for (var bi = 0; bi < bsorted.length; bi++) {
            var it = bsorted[bi]; if (it.kind === "video" || !it.src) continue;
            var ipath = it.src;
            if (it.src.indexOf("/curation/media/") !== 0) {
              var ibl = await blobFromSrc(it.src), iext = extFromType(ibl.type);
              ipath = "/curation/media/" + slug + "/board-" + mi + "-" + (bi + 1) + "." + iext;
              files.push({ path: ipath.slice(1), base64: await blobToBase64(ibl) });
            }
            var dim = await new Promise(function (res) { var im = new Image(); im.onload = function () { res({ w: im.naturalWidth, h: im.naturalHeight }); }; im.onerror = function () { res({ w: 1, h: 1 }); }; im.src = it.src; });
            placed[it.src] = ipath;
            var bo = { src: ipath, x: +it.x.toFixed(3), y: +it.y.toFixed(3), w: +it.w.toFixed(3), h: +(it.w * dim.h / dim.w).toFixed(3), name: (it.win && it.win.title) || it.name || "" };
            if (it.note) bo.note = it.note;
            if (it.fr && it.fr.note) bo.fr = { note: it.fr.note };
            bitems.push(bo);
          }
          outBlocks.push({ type: "image", src: "/" + p3, alt: state.title || "", caption: "", inset: false, board: { bg: b.bg || "#ebebef", items: bitems } });
        }
      }
    }
    // the cover photo: one picture of the topic (picked, or the first) — the frame on the feed,
    // the link preview and the Instagram cover all use it
    var coverPics = topicPictures(), coverPick = state.feed && coverPics.indexOf(state.feed) >= 0 ? state.feed : coverPics[0];
    if (coverPick && (placed[coverPick] || coverPick.indexOf("/curation/media/") === 0)) {
      cover = placed[coverPick] || coverPick;
      coverLocal = await barePhotoURL(coverPick);
    }
    // the feed's frame shows the cover photo small: publish it as a light JPEG of its own, so the
    // feed doesn't download the whole window PNG for it
    var thumb = null;
    if (coverLocal) {
      log("Making the feed picture…");
      try {
        var tb = await feedThumb(coverLocal);
        if (tb) { files.push({ path: "curation/media/" + slug + "/feed.jpg", base64: await blobToBase64(tb) }); thumb = "/curation/media/" + slug + "/feed.jpg?v=" + Date.now().toString(36); }
      } catch (e) { log("(feed picture skipped: " + (e && e.message || e) + ")"); }
    }
    var firstText = outBlocks.filter(function (b) { return b.type === "text" && b.html; })[0];
    var desc = (state.desc || "").trim() || (firstText ? plain(firstText.html).slice(0, 160) : "");
    // belt and braces: no inline styles in published text, whatever got in
    outBlocks.forEach(function (ob) {
      if (ob.type !== "text") return;
      ob.html = cleanRich(ob.html || "");
      if (ob.fr && ob.fr.html) ob.fr.html = cleanRich(ob.fr.html);
    });
    var topic = { slug: slug, title: state.title || "Untitled", author: state.author || "", date: date, cover: cover, desc: desc, inspiration: (state.inspiration || "").trim(), blocks: outBlocks };
    var themes = (state.themes || []).map(cleanTheme).filter(Boolean);
    if (themes.length) topic.themes = themes;
    if (state.tone) topic.tone = state.tone;
    if (cover) topic.feed = cover;
    if (thumb) topic.thumb = thumb;
    if (state.song && youtubeId(state.song.src)) {
      var sg = state.song; topic.song = { src: sg.src, title: (sg.title || "").trim(), artist: (sg.artist || "").trim() };
      if ((sg.album || "").trim()) topic.song.album = sg.album.trim(); if (sg.art) topic.song.art = sg.art; if (+sg.start) topic.song.start = +sg.start;
    }
    var frTitle = (state.fr && state.fr.title || "").trim();
    var langs = ["en"];
    if (frTitle || outBlocks.some(function (x) { return x.fr; })) { langs.push("fr"); topic.fr = frTitle ? { title: frTitle } : {}; }
    topic.langs = langs;
    log("Updating index…");
    // never carry on with an empty index on a failed read: it would wipe the curation page
    var index = await ghJSON("curation/topics/index.json", token, []);
    var sched = await ghJSON(SCHED_PATH, token, []);
    // catalogue number: a topic keeps its number; a new one gets the next (scheduled ones hold theirs)
    var prev = index.filter(function (t) { return t.slug === slug; })[0];
    var prevS = sched.filter(function (x) { return x.slug === slug; })[0];
    var no = (prev && +prev.no) || (prevS && +prevS.entry.no) || (Math.max(
      index.reduce(function (m, t, i) { return Math.max(m, +t.no || (index.length - i)); }, 0),
      sched.reduce(function (m, x) { return Math.max(m, +x.entry.no || 0); }, 0)) + 1);
    topic.no = no;
    // the date is the day it first went live; updates don't move it
    if (prev && prev.date) topic.date = date = prev.date;
    if (when) { topic.publishAt = isoLocal(when); topic.date = date = topic.publishAt.slice(0, 10); }
    files.push({ path: "curation/topics/" + slug + ".json", text: JSON.stringify(topic, null, 2) });
    // the topic's own address (/curation/<slug>/) with a styled link preview
    if (window.BtbrShareCard && SHARE_RESERVED.indexOf(slug) < 0) {
      log("Drawing the share card…");
      try {
        var sc = await BtbrShareCard.draw({ author: topic.author, title: topic.title, desc: desc, date: date, no: no }, coverLocal);
        var sb = await new Promise(function (res) { sc.toBlob(res, "image/jpeg", 0.9); });
        files.push({ path: "curation/media/" + slug + "/share.jpg", base64: await blobToBase64(sb) });
        files.push({ path: "curation/" + slug + "/index.html", text: sharePage(topic) });
      } catch (e) { log("(share card skipped: " + (e && e.message || e) + ")"); }
    }
    var entry = { slug: slug, no: no, title: topic.title, author: topic.author, date: date, cover: cover, desc: desc, langs: langs };
    if (topic.themes) entry.themes = topic.themes;
    if (topic.tone) entry.tone = topic.tone;
    if (topic.feed) entry.feed = topic.feed;
    if (topic.thumb) entry.thumb = topic.thumb;
    if (topic.fr) {
      var firstFr = outBlocks.filter(function (b) { return b.type === "text" && b.fr && b.fr.html; })[0];
      entry.fr = {};
      if (topic.fr.title) entry.fr.title = topic.fr.title;
      if (firstFr) entry.fr.desc = plain(firstFr.fr.html).slice(0, 160);
    }
    var schedLeft = sched.filter(function (x) { return x.slug !== slug; });
    if (when) {
      // waits off the index; the go-live Action puts it there at its time
      schedLeft.push({ slug: slug, publishAt: topic.publishAt, entry: entry });
      files.push({ path: SCHED_PATH, text: JSON.stringify(schedLeft, null, 2) });
    } else {
      index = [entry].concat(index.filter(function (t) { return t.slug !== slug; }));
      files.push({ path: "curation/topics/index.json", text: JSON.stringify(index, null, 2) });
      files.push({ path: "curation/feed.xml", text: feedXML(index) });
      if (prevS) files.push({ path: SCHED_PATH, text: JSON.stringify(schedLeft, null, 2) });
    }
    log("Committing " + files.length + " files…");
    await commitFiles(token, files, when ? 'Curation: schedule "' + topic.title + '" for ' + niceWhen(topic.publishAt) : 'Curation: publish "' + topic.title + '"');
    editingSlug = slug; editingScheduled = when ? topic.publishAt : null; planAt = null;
    schedCache = null;
    if (when) log("🗓 Scheduled “" + topic.title + "” for " + niceWhen(topic.publishAt) + ". It goes live on its own (within ~10 min of that time).");
    else log("✅ Published “" + topic.title + "” → /curation/ (live in ~1–2 min once the site is deployed).");
  }

  var pubModal = document.getElementById("pubModal");
  var pubBusy = false;
  var pubWhen = "now";
  function pubLabel() { return pubWhen === "later" ? (editingScheduled ? "Reschedule" : "Schedule") : (editingSlug && !editingScheduled ? "Update" : "Publish"); }
  function paintWhen() {
    var seg = document.getElementById("pubWhenSeg"), at = document.getElementById("pubAt"), note = document.getElementById("pubWhenNote");
    [].forEach.call(seg.children, function (c) { c.setAttribute("aria-pressed", String(c.dataset.when === pubWhen)); });
    at.hidden = pubWhen !== "later";
    note.hidden = pubWhen !== "later";
    note.textContent = "It waits off the curation page and goes live on its own, within about 10 minutes of that time.";
    document.getElementById("pubGo").textContent = pubLabel();
  }
  function openPub() {
    var saved = localStorage.getItem(TOKEN_KEY) || "", name = "“" + (state.title || "Untitled") + "”";
    document.getElementById("pubToken").value = saved;
    document.getElementById("pubTitle").textContent = (editingSlug ? "Update " : "Publish ") + name + "?";
    document.getElementById("pubNote").textContent = editingSlug ? "The published topic is replaced with this version. It’s live in a minute or two."
      : "It’s added to the curation page, and live in a minute or two.";
    document.getElementById("pubSaved").hidden = !saved; document.getElementById("pubTokenBox").hidden = !!saved;
    // a live topic is only ever updated in place; a new or scheduled one can go now or later
    var live = editingSlug && !editingScheduled;
    document.getElementById("pubWhen").hidden = !!live;
    pubWhen = !live && (editingScheduled || planAt) ? "later" : "now";
    var def = editingScheduled ? new Date(editingScheduled) : planAt || (function () { var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d; })();
    var at = document.getElementById("pubAt"); at.value = inputLocal(def); at.min = inputLocal(new Date());
    if (editingScheduled) document.getElementById("pubNote").textContent = "Scheduled for " + niceWhen(editingScheduled) + ". Keep a time, or put it live now.";
    paintWhen();
    var lg = document.getElementById("pubLog"); lg.hidden = true; lg.textContent = "";
    document.getElementById("pubClose").textContent = "Cancel";
    pubModal.hidden = false;
    (saved ? document.getElementById("pubGo") : document.getElementById("pubToken")).focus();
  }
  function closePub() { if (!pubBusy) pubModal.hidden = true; }
  document.getElementById("pubChange").addEventListener("click", function () {
    document.getElementById("pubSaved").hidden = true; document.getElementById("pubTokenBox").hidden = false; document.getElementById("pubToken").focus();
  });
  document.addEventListener("keydown", function (e) {
    if (pubModal.hidden) return;
    if (e.key === "Escape") closePub();
    if (e.key === "Enter" && e.target.id === "pubToken") document.getElementById("pubGo").click();
  });
  document.getElementById("pubClose").addEventListener("click", closePub);
  document.getElementById("pubWhenSeg").addEventListener("click", function (e) { var b = e.target.closest("button[data-when]"); if (b) { pubWhen = b.dataset.when; paintWhen(); if (pubWhen === "later") document.getElementById("pubAt").focus(); } });
  document.getElementById("pubBackdrop").addEventListener("click", closePub);
  document.getElementById("pubGo").addEventListener("click", function () {
    var token = document.getElementById("pubToken").value.trim();
    if (!token) { document.getElementById("pubSaved").hidden = true; document.getElementById("pubTokenBox").hidden = false; document.getElementById("pubToken").focus(); return; }
    if (document.getElementById("pubRemember").checked) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
    var lg = document.getElementById("pubLog"); lg.hidden = false; lg.textContent = "";
    function log(m) { lg.textContent += m + "\n"; lg.scrollTop = lg.scrollHeight; }
    var when = null;
    if (pubWhen === "later" && !document.getElementById("pubWhen").hidden) {
      when = new Date(document.getElementById("pubAt").value);
      if (isNaN(when) || when < new Date(Date.now() + 60e3)) { lg.hidden = true; alert("Pick a time in the future."); return; }
    }
    var btn = this, cancel = document.getElementById("pubClose"); btn.disabled = true; btn.textContent = when ? "Scheduling…" : editingSlug ? "Updating…" : "Publishing…"; pubBusy = true; cancel.disabled = true;
    function done() { pubBusy = false; btn.disabled = false; cancel.disabled = false; btn.textContent = pubLabel(); }
    publish(token, log, when).then(function () { done(); cancel.textContent = "Done"; clean(); try { localStorage.removeItem("btbr_cur_draft"); } catch (e) {} })
      .catch(function (e) { log("❌ " + (e && e.message || e)); done(); });
  });

  /* ---------- unsaved work ----------
     Anything typed, added, moved or removed marks the topic as edited; saving a draft, publishing or
     opening another clears it. While it's edited: the bar says so, opening another topic asks first,
     and so does closing the tab. */
  var dirty = false, quiet = 0;
  function docState() {
    var el = document.getElementById("docState"); if (!el) return;
    el.textContent = (editingSlug ? "Editing “" + (state.title || "Untitled") + "”" : "New topic")
      + (editingScheduled ? " · scheduled " + niceWhen(editingScheduled) : planAt ? " · planned for " + niceWhen(planAt.toISOString()) : "");
    el.classList.toggle("is-dirty", dirty);
  }
  function touch() { if (!quiet && !dirty) dirty = true; docState(); }
  function clean() { dirty = false; quiet++; setTimeout(function () { quiet--; }, 400); docState(); }     // loading a topic re-renders: not an edit
  function okToLeave() { return !dirty || confirm("Leave “" + (state.title || "this topic") + "”?\n\nIts changes aren’t saved as a draft or published yet, and will be lost."); }
  (function () {
    ["input", "change"].forEach(function (ev) {
      document.addEventListener(ev, function (e) { if (e.target.closest(".studio-canvas, .studio-inspector") && e.target.id !== "pubToken") touch(); }, true);
    });
    document.addEventListener("pointerup", function (e) { if (e.target.closest(".block")) setTimeout(touchIfMoved, 0); }, true);
    var snap = "";
    function sig() { try { return JSON.stringify(state.blocks, function (k, v) { return k === "html" || k === "text" ? undefined : v; }); } catch (e) { return ""; } }
    function touchIfMoved() { var n = sig(); if (snap && n !== snap) touch(); snap = n; }
    new MutationObserver(function () { touchIfMoved(); }).observe(blocksEl, { childList: true });
    setTimeout(function () { snap = sig(); docState(); }, 0);
    window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
    var tg = document.getElementById("inspToggle");
    if (tg) tg.addEventListener("click", function () { var on = document.body.classList.toggle("insp-open"); tg.setAttribute("aria-expanded", on); tg.textContent = on ? "Done" : "Settings"; });
  })();

  /* ---------- Topics tab: list, edit, delete ---------- */
  var VIEWS = { topics: "topicsView", calendar: "calView", stats: "statsView" };
  function switchTab(tab) {
    if (translating && tab !== "write") setTranslating(false);
    Object.keys(VIEWS).forEach(function (k) {
      document.body.classList.toggle("view-" + k, tab === k);
      var v = document.getElementById(VIEWS[k]); if (v) v.hidden = tab !== k;
    });
    document.body.classList.toggle("view-other", tab !== "write");
    [].forEach.call(document.querySelectorAll(".studio-tab"), function (b) { b.classList.toggle("is-active", b.dataset.tab === tab); });
    if (tab === "topics") renderTopicsList();
    if (tab === "calendar") renderCalendar();
    if (tab === "stats") renderStats();
  }
  function niceDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function renderTopicsList() {
    var listEl = document.getElementById("topicsList"); if (!listEl) return;
    listEl.innerHTML = '<p class="topics-loading">Loading…</p>';
    loadLists().then(function (L) {
      var list = L.sched.slice().sort(function (a, b) { return Date.parse(a.publishAt) - Date.parse(b.publishAt); })
        .map(function (s) { return Object.assign({}, s.entry, { slug: s.slug, publishAt: s.publishAt }); }).concat(L.index);
      if (!list.length) { listEl.innerHTML = '<p class="topics-empty">No topics published yet.</p>'; return; }
      listEl.innerHTML = "";
      var cnt = document.getElementById("topicsCount"); if (cnt) cnt.textContent = L.index.length + (L.sched.length ? " · " + L.sched.length + " scheduled" : "");
      list.forEach(function (t) {
        var row = document.createElement("div"); row.className = "topic-row" + (t.publishAt ? " is-scheduled" : ""); row.tabIndex = 0; row.setAttribute("role", "button"); row.setAttribute("aria-label", "Edit " + (t.title || "Untitled")); row.setAttribute("data-slug", t.slug);
        row.addEventListener("click", function (e) { if (!e.target.closest(".topic-acts, .topic-themes")) editTopic(t.slug); });
        row.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); editTopic(t.slug); } });
        var thumb = document.createElement((t.thumb || t.cover) ? "img" : "div"); thumb.className = "topic-thumb"; if (t.thumb || t.cover) thumb.src = t.thumb || t.cover;
        var meta = document.createElement("div"); meta.className = "topic-meta";
        var ti = document.createElement("div"); ti.className = "topic-title"; ti.textContent = t.title || "Untitled";
        var sub = document.createElement("div"); sub.className = "topic-sub";
        sub.textContent = [t.no ? "No. " + ("00" + t.no).slice(-3) : "", t.publishAt ? "" : niceDate(t.date), t.langs && t.langs.length > 1 ? "EN · FR" : "EN"].concat((t.themes || []).join(", ")).filter(Boolean).join("  ·  ");
        if (t.publishAt) { var badge = document.createElement("span"); badge.className = "topic-badge"; badge.textContent = "Scheduled · " + niceWhen(t.publishAt); sub.prepend(badge); }
        var stat = document.createElement("div"); stat.className = "topic-stat";
        meta.appendChild(ti); meta.appendChild(sub);
        var acts = document.createElement("div"); acts.className = "topic-acts";
        if (t.publishAt) {
          var gl = document.createElement("button"); gl.type = "button"; gl.textContent = "Go live now"; gl.addEventListener("click", function () { goLiveNow(t.slug, gl); }); acts.appendChild(gl);
        }
        var th = document.createElement("button"); th.type = "button"; th.textContent = "Themes"; th.addEventListener("click", function () { toggleRowThemes(row, t); });
        var ig = document.createElement("a"); ig.href = "/admin/instagram.html?t=" + encodeURIComponent(t.slug); ig.target = "_blank"; ig.rel = "noopener"; ig.textContent = "Instagram";
        var rl = document.createElement("a"); rl.href = "/admin/reel.html?t=" + encodeURIComponent(t.slug); rl.target = "_blank"; rl.rel = "noopener"; rl.textContent = "Reel";
        var dl = document.createElement("button"); dl.type = "button"; dl.className = "del"; dl.textContent = "Delete"; dl.addEventListener("click", function () { deleteTopic(t.slug, dl, t.title); });
        acts.appendChild(th); acts.appendChild(ig); acts.appendChild(rl); acts.appendChild(dl);
        row.appendChild(thumb); row.appendChild(meta); row.appendChild(stat); row.appendChild(acts); listEl.appendChild(row);
      });
      topicRowStats(listEl);
    }).catch(function () { listEl.innerHTML = '<p class="topics-empty">Couldn’t load topics.</p>'; });
  }
  // tag a published topic in place, from its row
  function toggleRowThemes(row, t) {
    var open = row.nextElementSibling && row.nextElementSibling.classList.contains("topic-themes") ? row.nextElementSibling : null;
    if (open) { open.remove(); return; }
    var list = (t.themes || []).slice(), box = document.createElement("div"); box.className = "topic-themes";
    box.appendChild(themeEditor(list, function () {}));
    var bar = document.createElement("div"); bar.className = "topic-themes-bar";
    var cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "sbtn"; cancel.textContent = "Cancel"; cancel.addEventListener("click", function () { box.remove(); });
    var save = document.createElement("button"); save.type = "button"; save.className = "sbtn primary"; save.textContent = "Save";
    save.addEventListener("click", function () { saveThemes(t.slug, list, save).then(function (ok) { if (ok) { t.themes = list.slice(); box.remove(); var sub = row.querySelector(".topic-sub"); if (sub) sub.insertAdjacentHTML("beforeend", '<span class="topic-saved"> · themes saved ✓</span>'); renderTopicsListSoon(); } }); });
    var hint = document.createElement("span"); hint.className = "insp-empty"; hint.textContent = "Saved straight to the site — no republish, the date stays.";
    bar.appendChild(hint); bar.appendChild(cancel); bar.appendChild(save); box.appendChild(bar);
    row.after(box);
    var inp = box.querySelector(".theme-input"); if (inp) inp.focus();
  }
  function renderTopicsListSoon() {
    // the site serves the new index after its deploy; keep what was just saved meanwhile
    var listEl = document.getElementById("topicsList"); if (!listEl) return;
    setTimeout(function () { if (document.body.classList.contains("view-topics")) renderTopicsList(); }, 90e3);
  }
  function blockFromPublished(pb) {
    if (pb.type === "image" && pb.board && pb.board.items && pb.board.items.length) {
      return { id: uid(), type: "board", bg: pb.board.bg || "#ebebef", zc: pb.board.items.length,
        items: pb.board.items.map(function (it, i) { var o = { id: uid(), kind: "image", src: it.src, name: it.name || "", x: it.x, y: it.y, w: it.w, z: i + 1 }; if (it.note) o.note = it.note; if (it.fr) o.fr = it.fr; return o; }) };
    }
    var nb = { id: uid(), type: pb.type };
    if (pb.type === "text") { nb.head = !!pb.head; nb.html = pb.html || ""; }
    else if (pb.type === "image") { nb.src = pb.src || ""; nb.alt = pb.alt || ""; nb.caption = pb.caption || ""; nb.note = pb.note || ""; nb.inset = !!pb.inset; }
    else if (pb.type === "quote") { nb.text = pb.text || ""; nb.cite = pb.cite || ""; }
    else if (pb.type === "hand" || pb.type === "sign") { nb.text = pb.text || ""; }
    else if (pb.type === "video") { nb.src = pb.src || ""; nb.caption = pb.caption || ""; if (pb.frame === false || pb.board) nb.frame = false; if (pb.wtitle) nb.wtitle = pb.wtitle; if (pb.board) nb.board = true; }
    if (pb.fr) nb.fr = pb.fr;
    return nb;
  }
  function editTopic(slug) {
    if (!okToLeave()) return;
    fetch("/curation/topics/" + slug + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (t) {
      state.title = t.title || "";
      state.fr = { title: (t.fr && t.fr.title) || "" };
      state.author = t.author || "Isaac";
      state.cover = t.cover || null;
      state.desc = t.desc || "";
      state.inspiration = t.inspiration || "";
      state.tone = t.tone || "";
      state.feed = t.feed || "";
      state.song = t.song || null;
      state.themes = (t.themes || []).slice();
      editingScheduled = t.publishAt || null; planAt = null;
      (t.blocks || []).forEach(function (pb) { if (pb.type === "song" && !state.song) state.song = { src: pb.src, title: pb.title, artist: pb.artist, album: pb.album, art: pb.art, start: pb.start }; });
      state.blocks = (t.blocks || []).filter(function (pb) { return pb.type !== "song"; }).map(blockFromPublished);
      if (!state.blocks.length) state.blocks.push({ id: uid(), type: "text", head: false, html: "" });
      editingSlug = slug;
      selectedId = null;
      switchTab("write");
      render(); clean();
    }).catch(function () { alert("Couldn’t load that topic for editing."); });
  }
  function newTopic(asked) {
    if (asked !== true && !okToLeave()) return;
    editingSlug = null; editingScheduled = null; planAt = null;
    state.title = ""; state.fr = { title: "" }; state.author = "Isaac"; state.cover = null; state.desc = ""; state.inspiration = ""; state.tone = ""; state.feed = ""; state.song = null; state.themes = [];
    state.blocks = [{ id: uid(), type: "text", head: false, html: "" }];
    selectedId = null;
    switchTab("write"); render(); clean();
  }
  async function deleteTopic(slug, btn, title) {
    var token = (localStorage.getItem(TOKEN_KEY) || "").trim();
    if (!token) { alert("Set your GitHub token first — open Publish and paste it."); return; }
    if (!confirm("Delete “" + (title || slug) + "”?\n\nIt comes off the curation page, with its pictures. This can’t be undone.")) return;
    if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }
    try {
      var t = { blocks: [] };
      try { t = await fetch("/curation/topics/" + slug + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }); } catch (e) {}
      var mediaPaths = [];
      (t.blocks || []).forEach(function (b) {
        if (b.src && b.src.indexOf("/curation/media/") === 0) mediaPaths.push(b.src.replace(/^\//, ""));
        ((b.board && b.board.items) || []).forEach(function (it) { if (it.src && it.src.indexOf("/curation/media/") === 0 && mediaPaths.indexOf(it.src.slice(1)) < 0) mediaPaths.push(it.src.slice(1)); });
      });
      var index = (await ghJSON("curation/topics/index.json", token, [])).filter(function (x) { return x.slug !== slug; });
      var sched = await ghJSON(SCHED_PATH, token, []), schedLeft = sched.filter(function (x) { return x.slug !== slug; });
      var ref = await gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH, {}, token);
      var baseSha = ref.object.sha;
      var baseCommit = await gh("/repos/" + REPO + "/git/commits/" + baseSha, {}, token);
      var treeItems = [{ path: "curation/topics/" + slug + ".json", mode: "100644", type: "blob", sha: null }];
      for (var sp of ["curation/" + slug + "/index.html", "curation/media/" + slug + "/share.jpg"]) {
        var there = await fetch("/" + sp, { method: "HEAD", cache: "no-cache" }).then(function (r) { return r.ok; }, function () { return false; });
        if (there && mediaPaths.indexOf(sp) < 0) mediaPaths.push(sp);
      }
      mediaPaths.forEach(function (p) { treeItems.push({ path: p, mode: "100644", type: "blob", sha: null }); });
      var iblob = await gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: JSON.stringify({ content: JSON.stringify(index, null, 2), encoding: "utf-8" }) }, token);
      treeItems.push({ path: "curation/topics/index.json", mode: "100644", type: "blob", sha: iblob.sha });
      var fblob = await gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: JSON.stringify({ content: feedXML(index), encoding: "utf-8" }) }, token);
      treeItems.push({ path: "curation/feed.xml", mode: "100644", type: "blob", sha: fblob.sha });
      if (schedLeft.length !== sched.length) {
        var sblob = await gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: JSON.stringify({ content: JSON.stringify(schedLeft, null, 2), encoding: "utf-8" }) }, token);
        treeItems.push({ path: SCHED_PATH, mode: "100644", type: "blob", sha: sblob.sha });
        schedCache = schedLeft;
      }
      var tree = await gh("/repos/" + REPO + "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeItems }) }, token);
      var commit = await gh("/repos/" + REPO + "/git/commits", { method: "POST", body: JSON.stringify({ message: 'Curation: delete "' + slug + '"', tree: tree.sha, parents: [baseSha] }) }, token);
      await gh("/repos/" + REPO + "/git/refs/heads/" + BRANCH, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) }, token);
      renderTopicsList();
    } catch (e) {
      alert("Delete failed: " + (e && e.message || e));
      if (btn) { btn.disabled = false; btn.textContent = "Delete"; }
    }
  }
  (function () {
    var tabs = document.querySelector(".studio-tabs");
    if (tabs) tabs.addEventListener("click", function (e) { var b = e.target.closest(".studio-tab"); if (b) switchTab(b.dataset.tab); });
    var nw = document.getElementById("topicsNew");
    if (nw) nw.addEventListener("click", newTopic);
  })();

  /* ---------- local drafts: save & resume without publishing ---------- */
  var DRAFT_KEY = "btbr_cur_draft";
  function toDataURL(url) { return fetch(url).then(function (r) { return r.blob(); }).then(function (bl) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(bl); }); }); }
  async function serializeDraft() {
    var copy = { v: 1, savedAt: Date.now(), title: state.title, fr: state.fr, author: state.author, desc: state.desc, inspiration: state.inspiration, tone: state.tone || "", feed: /^\/curation\//.test(state.feed || "") ? state.feed : "", song: state.song, themes: state.themes || [], editingSlug: editingSlug, cover: null, blocks: [] };
    if (state.cover) {
      if (typeof state.cover === "string") copy.cover = state.cover.indexOf("blob:") === 0 ? await toDataURL(state.cover) : state.cover;
      else { var cc = { bg: state.cover.bg, zc: state.cover.zc, items: [] }; for (var ci = 0; ci < state.cover.items.length; ci++) { var cit = state.cover.items[ci], cni = Object.assign({}, cit); if (cit.src && cit.src.indexOf("blob:") === 0) cni.src = await toDataURL(cit.src); cc.items.push(cni); } copy.cover = cc; }
    }
    for (var i = 0; i < state.blocks.length; i++) {
      var b = state.blocks[i], nb = Object.assign({}, b);
      if ((b.type === "image" || b.type === "video") && b.src && b.src.indexOf("blob:") === 0) nb.src = await toDataURL(b.src);
      if (b.orig && b.orig.indexOf("blob:") === 0) nb.orig = await toDataURL(b.orig);
      if (b.type === "board") { nb.items = []; for (var j = 0; j < b.items.length; j++) { var it = b.items[j], ni = Object.assign({}, it); if (it.src && it.src.indexOf("blob:") === 0) ni.src = await toDataURL(it.src); if (it.orig && it.orig.indexOf("blob:") === 0) ni.orig = await toDataURL(it.orig); nb.items.push(ni); } }
      copy.blocks.push(nb);
    }
    return copy;
  }
  async function saveDraft(btn) {
    var label = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try {
      var d = await serializeDraft();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      clean();
      if (btn) { btn.textContent = "Saved ✓"; setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 1400); }
    } catch (e) {
      if (btn) { btn.textContent = label; btn.disabled = false; }
      var q = /quota/i.test(String(e));
      alert("Couldn’t save the draft" + (q ? " — it’s too large for local storage (big videos/boards don’t fit). Publish is the way to keep heavy topics." : ": " + (e && e.message || e)));
    }
  }
  function loadDraftData(d) {
    state.title = d.title || ""; state.fr = d.fr || { title: "" }; state.author = d.author || "Isaaaaaaaac"; state.cover = d.cover || null; state.desc = d.desc || ""; state.inspiration = d.inspiration || ""; state.tone = d.tone || ""; state.feed = d.feed || ""; state.song = d.song || null; state.themes = d.themes || [];
    editingSlug = d.editingSlug || null;
    // an older draft's song block becomes the topic's soundtrack
    (d.blocks || []).forEach(function (b) { if (b.type === "song" && !state.song && b.src) state.song = { src: b.src, title: b.title || "", artist: b.artist || "", album: b.album || "", art: b.art || "", start: +b.start || 0 }; });
    state.blocks = (d.blocks || []).filter(function (b) { return b.type !== "song"; }).map(function (b) { return Object.assign({ id: uid() }, b); });
    if (!state.blocks.length) state.blocks.push({ id: uid(), type: "text", head: false, html: "" });
    selectedId = null; render(); clean();
  }
  function showDraftBanner() {
    var raw = null; try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) {}
    if (!raw) return; var d; try { d = JSON.parse(raw); } catch (e) { return; }
    var bar = document.createElement("div"); bar.className = "draft-banner";
    var span = document.createElement("span"); span.textContent = "Saved draft from " + new Date(d.savedAt || Date.now()).toLocaleString();
    var resume = document.createElement("button"); resume.className = "sbtn"; resume.textContent = "Resume"; resume.addEventListener("click", function () { loadDraftData(d); bar.remove(); });
    var discard = document.createElement("button"); discard.className = "sbtn"; discard.textContent = "Discard"; discard.addEventListener("click", function () { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} bar.remove(); });
    bar.appendChild(span); bar.appendChild(resume); bar.appendChild(discard);
    document.body.appendChild(bar);
  }
  var draftBtn = document.getElementById("draftBtn");
  if (draftBtn) draftBtn.addEventListener("click", function () { saveDraft(this); });

  /* ---------- reading + committing on the live branch (shared by publish, delete, schedule, themes) ---------- */
  function b64utf8(s) { return decodeURIComponent(escape(atob(String(s).replace(/\n/g, "")))); }
  // a JSON file on the live branch; `fallback` only when it doesn't exist (any other failure stops the caller —
  // carrying on with an empty index would wipe the curation page)
  async function ghJSON(path, token, fallback) {
    try { var r = await gh("/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH, { cache: "no-store" }, token); return JSON.parse(b64utf8(r.content)); }
    catch (e) { if (/not found/i.test(String(e && e.message))) return fallback; throw e; }
  }
  // files: [{ path, text } | { path, base64 } | { path, remove: true }] — one commit
  async function commitFiles(token, files, message) {
    var ref = await gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH, {}, token), baseSha = ref.object.sha;
    var baseCommit = await gh("/repos/" + REPO + "/git/commits/" + baseSha, {}, token);
    var items = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.remove) { items.push({ path: f.path, mode: "100644", type: "blob", sha: null }); continue; }
      var body = f.base64 != null ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" };
      var bl = await gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: JSON.stringify(body) }, token);
      items.push({ path: f.path, mode: "100644", type: "blob", sha: bl.sha });
    }
    var tree = await gh("/repos/" + REPO + "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: items }) }, token);
    var commit = await gh("/repos/" + REPO + "/git/commits", { method: "POST", body: JSON.stringify({ message: message, tree: tree.sha, parents: [baseSha] }) }, token);
    await gh("/repos/" + REPO + "/git/refs/heads/" + BRANCH, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) }, token);
  }
  function needToken() {
    var token = (localStorage.getItem(TOKEN_KEY) || "").trim();
    if (!token) alert("Set your GitHub token first — open Publish and paste it.");
    return token;
  }

  /* ---------- the RSS feed: /curation/feed.xml, rebuilt with the index (the same file the
     go-live Action writes, so the two never fight over it) ---------- */
  var SITE = "https://buildtoberemembered.com";
  function xmlEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"); }
  function rfcDate(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""), d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : new Date();
    return d.toUTCString();
  }
  function feedXML(index) {
    var items = index.slice().sort(function (a, b) { return (+b.no || 0) - (+a.no || 0); }).map(function (t) {
      var link = SITE + "/curation/" + t.slug + "/", pic = t.thumb || t.feed || "";
      if (pic && pic.indexOf("http") !== 0) pic = SITE + pic;
      var body = (pic ? '<p><img src="' + xmlEsc(pic) + '" alt=""></p>' : "") + "<p>" + xmlEsc(t.desc || "") + "</p>";
      return "    <item>\n      <title>" + xmlEsc(t.title || "Untitled") + "</title>\n      <link>" + link + "</link>\n"
        + '      <guid isPermaLink="true">' + link + "</guid>\n      <pubDate>" + rfcDate(t.date) + "</pubDate>\n"
        + "      <dc:creator>" + xmlEsc(t.author || "") + "</dc:creator>"
        + (t.themes || []).map(function (x) { return "\n      <category>" + xmlEsc(x) + "</category>"; }).join("")
        + "\n      <description><![CDATA[" + body + "]]></description>"
        + (pic ? '\n      <media:content url="' + xmlEsc(pic) + '" medium="image"/>' : "") + "\n    </item>";
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">\n'
      + "  <channel>\n    <title>builtoberemembered — Curation</title>\n    <link>" + SITE + "/curation/</link>\n"
      + '    <atom:link href="' + SITE + '/curation/feed.xml" rel="self" type="application/rss+xml"/>\n'
      + "    <description>An ongoing curation — topics worth remembering.</description>\n    <language>en</language>\n"
      + "    <lastBuildDate>" + new Date().toUTCString() + "</lastBuildDate>\n" + items.join("\n") + "\n  </channel>\n</rss>\n";
  }

  /* ---------- schedule: a topic can go live later. Its index entry waits in scheduled.json;
     a GitHub Action (every 10 min) moves it into the index once its time has come ---------- */
  var SCHED_PATH = "curation/topics/scheduled.json";
  function isoLocal(d) {
    var off = -d.getTimezoneOffset(), a = Math.abs(off);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":00"
      + (off >= 0 ? "+" : "-") + pad2(Math.floor(a / 60)) + ":" + pad2(a % 60);
  }
  function inputLocal(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function niceWhen(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + ", " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  var editingScheduled = null;   // publishAt of the scheduled topic being edited
  var planAt = null;             // a day picked on the calendar for a new topic
  async function goLiveNow(slug, btn) {
    var token = needToken(); if (!token) return;
    if (!confirm("Put this scheduled topic live now?")) return;
    if (btn) { btn.disabled = true; btn.textContent = "Going live…"; }
    try {
      var sched = await ghJSON(SCHED_PATH, token, []), s = sched.filter(function (x) { return x.slug === slug; })[0];
      if (!s) throw new Error("It isn’t scheduled any more (it may have just gone live).");
      var index = await ghJSON("curation/topics/index.json", token, []), topic = await ghJSON("curation/topics/" + slug + ".json", token, null);
      var today = new Date().toISOString().slice(0, 10), entry = Object.assign({}, s.entry, { date: today });
      index = [entry].concat(index.filter(function (t) { return t.slug !== slug; }));
      var files = [
        { path: "curation/topics/index.json", text: JSON.stringify(index, null, 2) },
        { path: SCHED_PATH, text: JSON.stringify(sched.filter(function (x) { return x.slug !== slug; }), null, 2) },
        { path: "curation/feed.xml", text: feedXML(index) }
      ];
      if (topic) { topic.date = today; delete topic.publishAt; files.push({ path: "curation/topics/" + slug + ".json", text: JSON.stringify(topic, null, 2) }); }
      await commitFiles(token, files, 'Curation: go live "' + (entry.title || slug) + '"');
      if (editingSlug === slug) editingScheduled = null;
      setTimeout(refreshViews, 400);
    } catch (e) { alert("Couldn’t put it live: " + (e && e.message || e)); if (btn) { btn.disabled = false; btn.textContent = "Go live now"; } }
  }
  async function reschedule(slug, when) {
    var token = needToken(); if (!token) return false;
    try {
      var sched = await ghJSON(SCHED_PATH, token, []), s = sched.filter(function (x) { return x.slug === slug; })[0];
      if (!s) throw new Error("It isn’t scheduled any more.");
      s.publishAt = isoLocal(when); s.entry.date = s.publishAt.slice(0, 10);
      var topic = await ghJSON("curation/topics/" + slug + ".json", token, null), files = [{ path: SCHED_PATH, text: JSON.stringify(sched, null, 2) }];
      if (topic) { topic.publishAt = s.publishAt; topic.date = s.entry.date; files.push({ path: "curation/topics/" + slug + ".json", text: JSON.stringify(topic, null, 2) }); }
      await commitFiles(token, files, 'Curation: reschedule "' + (s.entry.title || slug) + '" for ' + niceWhen(s.publishAt));
      if (editingSlug === slug) editingScheduled = s.publishAt;
      schedCache = sched; return true;
    } catch (e) { alert("Couldn’t reschedule: " + (e && e.message || e)); return false; }
  }
  // the site's copies lag a deploy (~1 min) behind a commit; what Studio just wrote wins meanwhile
  var schedCache = null, indexCache = null;
  function siteJSON(path) { return fetch(path, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }); }
  function loadLists() {
    return Promise.all([siteJSON("/curation/topics/index.json"), siteJSON("/" + SCHED_PATH)]).then(function (r) {
      indexCache = r[0] || []; if (!schedCache || r[1].length || !schedCache.length) schedCache = r[1] || [];
      var live = {}; indexCache.forEach(function (t) { live[t.slug] = 1; });
      schedCache = schedCache.filter(function (s) { return !live[s.slug]; });
      knownThemes = themeList(indexCache.concat(schedCache.map(function (s) { return s.entry; })));
      return { index: indexCache, sched: schedCache };
    });
  }
  function refreshViews() {
    if (document.body.classList.contains("view-topics")) renderTopicsList();
    if (document.body.classList.contains("view-calendar")) renderCalendar();
  }

  /* ---------- themes: a few words per topic, stamped on its card; the feed filters by them ---------- */
  var knownThemes = [];
  function themeList(list) {
    var seen = {}, out = [];
    list.forEach(function (t) { ((t && t.themes) || []).forEach(function (x) { var k = x.toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(x); } }); });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }
  function cleanTheme(v) { v = String(v || "").replace(/\s+/g, " ").trim(); return v ? v.charAt(0).toUpperCase() + v.slice(1) : ""; }
  // chips + an input; `list` is edited in place, `changed` runs after each edit
  function themeEditor(list, changed) {
    var wrap = document.createElement("div"); wrap.className = "theme-ed";
    function paint() {
      wrap.innerHTML = "";
      var chips = document.createElement("div"); chips.className = "theme-chips";
      list.forEach(function (x, i) {
        var c = document.createElement("button"); c.type = "button"; c.className = "theme-chip is-on"; c.title = "Remove";
        c.innerHTML = '<span></span><i aria-hidden="true">×</i>'; c.firstChild.textContent = x;
        c.addEventListener("click", function () { list.splice(i, 1); changed(); paint(); });
        chips.appendChild(c);
      });
      knownThemes.filter(function (x) { return !list.some(function (y) { return y.toLowerCase() === x.toLowerCase(); }); }).forEach(function (x) {
        var c = document.createElement("button"); c.type = "button"; c.className = "theme-chip"; c.textContent = "+ " + x;
        c.addEventListener("click", function () { list.push(x); changed(); paint(); });
        chips.appendChild(c);
      });
      var inp = document.createElement("input"); inp.className = "insp-input theme-input"; inp.placeholder = list.length ? "Add another…" : "Add a theme (e.g. Music video) and press Return";
      inp.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== ",") return;
        e.preventDefault(); var v = cleanTheme(inp.value);
        if (v && !list.some(function (y) { return y.toLowerCase() === v.toLowerCase(); })) { list.push(v); if (knownThemes.indexOf(v) < 0) knownThemes.push(v); changed(); paint(); wrap.querySelector(".theme-input").focus(); }
        else inp.value = "";
      });
      wrap.appendChild(chips); wrap.appendChild(inp);
    }
    paint();
    return wrap;
  }
  function themesField() {
    state.themes = state.themes || [];
    var w = themeEditor(state.themes, touch);
    var n = document.createElement("div"); n.className = "insp-empty"; n.style.marginTop = "8px";
    n.textContent = "Stamped on the card; readers can filter the feed by them.";
    w.appendChild(n); return w;
  }
  // re-tag a published topic without republishing it (no re-render, its date stays)
  async function saveThemes(slug, themes, btn) {
    var token = needToken(); if (!token) return false;
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try {
      var index = await ghJSON("curation/topics/index.json", token, []), topic = await ghJSON("curation/topics/" + slug + ".json", token, null);
      var sched = await ghJSON(SCHED_PATH, token, []), files = [];
      var set = function (o) { if (themes.length) o.themes = themes.slice(); else delete o.themes; };
      index.forEach(function (t) { if (t.slug === slug) set(t); });
      sched.forEach(function (s) { if (s.slug === slug) set(s.entry); });
      if (topic) { set(topic); files.push({ path: "curation/topics/" + slug + ".json", text: JSON.stringify(topic, null, 2) }); }
      files.push({ path: "curation/topics/index.json", text: JSON.stringify(index, null, 2) }, { path: "curation/feed.xml", text: feedXML(index) });
      if (sched.some(function (s) { return s.slug === slug; })) files.push({ path: SCHED_PATH, text: JSON.stringify(sched, null, 2) });
      await commitFiles(token, files, 'Curation: themes for "' + ((topic && topic.title) || slug) + '"');
      if (editingSlug === slug) state.themes = themes.slice();
      return true;
    } catch (e) { alert("Couldn’t save the themes: " + (e && e.message || e)); return false; }
    finally { if (btn) { btn.disabled = false; btn.textContent = "Save"; } }
  }

  /* ---------- Calendar: published and scheduled topics on a month ---------- */
  var calMonth = (function () { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
  function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function renderCalendar() {
    var box = document.getElementById("calView"); if (!box) return;
    loadLists().then(function (L) {
      var byDay = {};
      L.index.forEach(function (t) { if (t.date) (byDay[t.date] = byDay[t.date] || []).push({ t: t, live: true }); });
      L.sched.forEach(function (s) { var d = new Date(s.publishAt); if (!isNaN(d)) (byDay[ymd(d)] = byDay[ymd(d)] || []).push({ t: s.entry, at: s.publishAt, slug: s.slug }); });
      var now = new Date(), today = ymd(now), y = calMonth.getFullYear(), m = calMonth.getMonth();
      var first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
      var title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      // the cadence line: how this month is going, and what's next
      var monthCount = L.index.filter(function (t) { return (t.date || "").slice(0, 7) === ymd(first).slice(0, 7); }).length;
      var lastLive = L.index.map(function (t) { return t.date; }).filter(Boolean).sort().pop();
      var since = lastLive ? Math.round((new Date(ymd(now)) - new Date(lastLive)) / 864e5) : null;
      var next = L.sched.slice().sort(function (a, b) { return Date.parse(a.publishAt) - Date.parse(b.publishAt); })[0];
      var bits = [monthCount + (monthCount === 1 ? " topic" : " topics") + " published in " + first.toLocaleDateString("en-GB", { month: "long" })];
      if (since != null) bits.push("last one " + (since === 0 ? "today" : since === 1 ? "yesterday" : since + " days ago"));
      bits.push(next ? "next: " + (next.entry.title || next.slug) + " · " + niceWhen(next.publishAt) : "nothing scheduled");
      var h = '<div class="cal-head"><div class="cal-title"><h2>' + title + '</h2><p class="cal-cadence">' + htmlEsc(bits.join(" · ")) + "</p></div>"
        + '<div class="cal-nav"><button class="sbtn" data-cal="-1" type="button" aria-label="Previous month">‹</button><button class="sbtn" data-cal="0" type="button">Today</button><button class="sbtn" data-cal="1" type="button" aria-label="Next month">›</button></div></div>'
        + '<div class="cal-legend"><span><i class="cal-dot"></i>Published</span><span><i class="cal-dot is-sched"></i>Scheduled — drag to another day</span><span class="cal-hint">Click a free day to plan a new topic</span></div>'
        + '<div class="cal-grid">' + ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (d) { return '<div class="cal-dow">' + d + "</div>"; }).join("");
      for (var i = 0; i < lead; i++) h += '<div class="cal-day is-out"></div>';
      for (var d = 1; d <= days; d++) {
        var key = ymd(new Date(y, m, d)), evs = byDay[key] || [], past = key < today;
        h += '<div class="cal-day' + (key === today ? " is-today" : "") + (past ? " is-past" : "") + '" data-day="' + key + '"><span class="cal-n">' + d + "</span>"
          + evs.map(function (e) {
            var t = e.t || {}, thumb = t.thumb || t.feed || t.cover || "";
            return '<button type="button" class="cal-ev' + (e.live ? "" : " is-sched") + '" data-slug="' + htmlEsc(t.slug || e.slug) + '"' + (e.live ? "" : ' draggable="true" data-at="' + htmlEsc(e.at) + '"')
              + ' title="' + htmlEsc((t.title || "") + (e.live ? "" : " — " + niceWhen(e.at))) + '">'
              + (thumb ? '<img src="' + htmlEsc(thumb) + '" alt="">' : "") + '<span class="cal-ev-t">' + (e.live ? "" : '<b>' + niceWhen(e.at).split(", ")[1] + "</b> ") + htmlEsc(t.title || t.slug || "") + "</span></button>";
          }).join("")
          + (past ? "" : '<span class="cal-plan" aria-hidden="true">+ Plan</span>') + "</div>";
      }
      var tail = (7 - ((lead + days) % 7)) % 7; for (var k = 0; k < tail; k++) h += '<div class="cal-day is-out"></div>';
      box.innerHTML = h + "</div>";
    });
  }
  function htmlEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  (function () {
    var box = document.getElementById("calView"); if (!box) return;
    box.addEventListener("click", function (e) {
      var nav = e.target.closest("[data-cal]");
      if (nav) { var v = +nav.getAttribute("data-cal"), now = new Date(); calMonth = v === 0 ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(calMonth.getFullYear(), calMonth.getMonth() + v, 1); renderCalendar(); return; }
      var ev = e.target.closest(".cal-ev"); if (ev) { editTopic(ev.getAttribute("data-slug")); return; }
      var day = e.target.closest(".cal-day[data-day]:not(.is-past)");
      if (day) {
        if (!okToLeave()) return;
        var p = day.getAttribute("data-day").split("-");
        newTopic(true); planAt = new Date(+p[0], +p[1] - 1, +p[2], 18, 0);
        docState();
      }
    });
    var dragSlug = null, dragAt = null;
    box.addEventListener("dragstart", function (e) { var ev = e.target.closest(".cal-ev.is-sched"); if (!ev) return; dragSlug = ev.getAttribute("data-slug"); dragAt = ev.getAttribute("data-at"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragSlug); ev.classList.add("is-dragging"); });
    box.addEventListener("dragend", function () { dragSlug = null; [].forEach.call(box.querySelectorAll(".is-dragging, .is-drop"), function (x) { x.classList.remove("is-dragging", "is-drop"); }); });
    box.addEventListener("dragover", function (e) { var day = dragSlug && e.target.closest(".cal-day[data-day]:not(.is-past)"); if (!day) return; e.preventDefault(); e.stopPropagation(); [].forEach.call(box.querySelectorAll(".is-drop"), function (x) { if (x !== day) x.classList.remove("is-drop"); }); day.classList.add("is-drop"); });
    box.addEventListener("drop", function (e) {
      var day = dragSlug && e.target.closest(".cal-day[data-day]:not(.is-past)"); if (!day) return;
      e.preventDefault(); e.stopPropagation();
      var old = new Date(dragAt), p = day.getAttribute("data-day").split("-"), when = new Date(+p[0], +p[1] - 1, +p[2], old.getHours(), old.getMinutes());
      if (ymd(when) === ymd(old)) return;
      if (when < new Date()) { alert("That time has already passed."); return; }
      var slug = dragSlug; day.classList.add("is-saving");
      reschedule(slug, when).then(function (ok) { if (ok) { schedCache.forEach(function (s) { if (s.slug === slug) s.publishAt = isoLocal(when); }); } renderCalendar(); });
    });
  })();

  /* ---------- Stats: Umami's numbers for the site and for each topic ---------- */
  var UMAMI_SITE = "acc04168-9788-4b72-ac3c-0bc99353c40e", UMAMI_KEY = "btbr_umami_key", statsRange = 30, statsMemo = {};
  function umami(path, params) {
    var key = (localStorage.getItem(UMAMI_KEY) || "").trim();
    var q = Object.keys(params || {}).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    var url = "https://api.umami.is/v1/websites/" + UMAMI_SITE + path + (q ? "?" + q : "");
    var hit = statsMemo[url]; if (hit && Date.now() - hit.at < 5 * 60e3) return hit.p;
    // x-umami-api-key, not Authorization: Umami's CORS answer is "Allow-Headers: *", which Safari doesn't take to cover Authorization
    var p = fetch(url, { headers: { "x-umami-api-key": key, Accept: "application/json" } }).catch(function () {
      throw new Error("The browser couldn’t reach Umami — a content blocker may be blocking umami.is on this page.");
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error("Umami didn’t accept the API key.");
      if (!r.ok) throw new Error("Umami answered " + r.status + ".");
      return r.json();
    });
    p.catch(function () { delete statsMemo[url]; });
    statsMemo[url] = { at: Date.now(), p: p };
    return p;
  }
  function rangeOf(days) { var end = Date.now(); return { startAt: end - days * 864e5, endAt: end }; }
  var TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();
  function topicPath(slug) { return "/curation/" + slug + "/"; }
  // views per topic over the range: its own address (/curation/<slug>/) is what the room shows while open
  function topicViews(days) {
    return umami("/metrics", Object.assign({ type: "path", limit: 500 }, rangeOf(days))).then(function (rows) {
      var m = {}; (rows || []).forEach(function (r) { var k = /^\/curation\/([^\/]+)\/?$/.exec(r.x || ""); if (k && k[1] !== "topics" && k[1] !== "media") m[decodeURIComponent(k[1])] = (m[decodeURIComponent(k[1])] || 0) + (+r.y || 0); });
      return m;
    });
  }
  function topicReads(days) {
    return umami("/event-data/values", Object.assign({ eventName: "topic-read", propertyName: "slug" }, rangeOf(days))).then(function (rows) {
      var m = {}; (rows || []).forEach(function (r) { m[r.value] = +r.total || 0; }); return m;
    }, function () { return {}; });
  }
  function daySeries(days, path) {
    var p = Object.assign({ unit: "day", timezone: TZ }, rangeOf(days)); if (path) p.path = path;
    return umami("/pageviews", p).then(function (r) { return fillDays(r && r.pageviews || [], days); });
  }
  function fillDays(rows, days) {
    var m = {}; rows.forEach(function (r) { m[String(r.x).slice(0, 10)] = (+r.y || 0); });
    var out = [], d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - days + 1);
    for (var i = 0; i < days; i++) { var k = ymd(d); out.push({ day: k, y: m[k] || 0 }); d.setDate(d.getDate() + 1); }
    return out;
  }
  function compact(n) { n = +n || 0; return n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K" : n.toLocaleString("en-GB"); }
  function sparkSVG(pts, w, h) {
    if (!pts.length) return "";
    var max = Math.max.apply(null, pts.map(function (p) { return p.y; })) || 1, step = w / Math.max(1, pts.length - 1);
    var xy = pts.map(function (p, i) { return [+(i * step).toFixed(1), +(h - 3 - (p.y / max) * (h - 6)).toFixed(1)]; });
    var line = xy.map(function (p) { return p.join(","); }).join(" "), last = xy[xy.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline points="' + line + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.5"/></svg>';
  }
  function statsSetupHTML(msg) {
    return '<div class="stats-setup"><h2>Connect Umami</h2><p>Studio reads the visits from your Umami Cloud account. Make an API key in <a href="https://cloud.umami.is/settings/api-keys" target="_blank" rel="noopener">Umami → Settings → API keys</a> and paste it here. It stays in this browser, like your GitHub token.</p>'
      + (msg ? '<p class="stats-err">' + htmlEsc(msg) + "</p>" : "")
      + '<div class="stats-keyrow"><input class="insp-input" id="umamiKey" type="password" placeholder="api_…" autocomplete="off"><button class="sbtn primary" id="umamiSave" type="button">Connect</button></div></div>';
  }
  function renderStats() {
    var box = document.getElementById("statsView"); if (!box) return;
    if (!(localStorage.getItem(UMAMI_KEY) || "").trim()) { box.innerHTML = statsSetupHTML(); return; }
    var days = statsRange, r = rangeOf(days);
    box.innerHTML = '<div class="stats-head"><h2>Stats</h2><div class="lang-seg stats-range" role="group" aria-label="Range">'
      + [7, 30, 90].map(function (d) { return '<button type="button" data-days="' + d + '" aria-pressed="' + (d === days) + '">' + d + " days</button>"; }).join("")
      + '</div><button class="linkbtn stats-forget" type="button">Change key</button></div><p class="topics-loading">Loading…</p>';
    Promise.all([
      umami("/stats", Object.assign({ compare: "prev" }, r)),
      daySeries(days),
      topicViews(days),
      topicReads(days),
      umami("/metrics", Object.assign({ type: "referrer", limit: 6 }, r)).catch(function () { return []; }),
      loadLists()
    ]).then(function (res) {
      if (statsRange !== days) return;
      var st = res[0] || {}, series = res[1], views = res[2], reads = res[3], refs = res[4] || [], list = res[5].index.slice();
      list.sort(function (a, b) { return (views[b.slug] || 0) - (views[a.slug] || 0) || (+b.no || 0) - (+a.no || 0); });
      var cmp = st.comparison || {};
      var opens = 0, readSum = 0, readBase = 0;
      list.forEach(function (t) { opens += views[t.slug] || 0; if (reads[t.slug]) { readSum += reads[t.slug]; } readBase += reads[t.slug] != null ? (views[t.slug] || 0) : 0; });
      var readPct = readBase ? Math.round(readSum / readBase * 100) : null;
      function delta(now, prev) {
        if (!prev) return "";
        var d = Math.round((now - prev) / prev * 100), up = d >= 0;
        return '<span class="kpi-delta ' + (up ? "is-up" : "is-down") + '">' + (up ? "▲ " : "▼ ") + Math.abs(d) + "%</span>";
      }
      var avg = st.visits ? Math.round((st.totaltime || 0) / st.visits) : 0;
      var kpis = [
        ["Visitors", compact(st.visitors), delta(st.visitors, cmp.visitors)],
        ["Page views", compact(st.pageviews), delta(st.pageviews, cmp.pageviews)],
        ["Topic opens", compact(opens), ""],
        ["Read to the end", readPct == null ? "—" : readPct + "%", readPct == null ? '<span class="kpi-note">counting from now on</span>' : '<span class="kpi-note">of opens, where tracked</span>'],
        ["Time per visit", avg ? Math.floor(avg / 60) + ":" + pad2(avg % 60) : "—", ""]
      ];
      var h = box.querySelector(".stats-head").outerHTML
        + '<div class="kpi-row">' + kpis.map(function (k) { return '<div class="kpi"><div class="kpi-label">' + k[0] + '</div><div class="kpi-value">' + k[1] + "</div>" + k[2] + "</div>"; }).join("") + "</div>"
        + '<section class="stats-card"><div class="stats-card-head"><h3>Page views per day</h3><span class="kpi-note">vs the ' + days + ' days before: ' + compact(cmp.pageviews || 0) + "</span></div>" + lineChart(series) + "</section>"
        + '<div class="stats-cols"><section class="stats-card stats-topics"><div class="stats-card-head"><h3>Topics</h3><span class="kpi-note">opens · read to the end</span></div><div class="st-rows">'
        + list.map(function (t) {
          var v = views[t.slug] || 0, rd = reads[t.slug] || 0;
          return '<button type="button" class="st-row" data-slug="' + htmlEsc(t.slug) + '"><img class="st-thumb" src="' + htmlEsc(t.thumb || t.feed || t.cover || "") + '" alt=""><span class="st-name"><b>' + htmlEsc(t.title || t.slug) + '</b><span>No. ' + ("00" + (t.no || "")).slice(-3) + " · " + niceDate(t.date) + '</span></span><span class="st-spark" data-path="' + htmlEsc(topicPath(t.slug)) + '"></span>'
            + '<span class="st-num">' + compact(v) + '</span><span class="st-num st-read">' + (rd ? Math.min(100, Math.round(rd / Math.max(1, v) * 100)) + "%" : "—") + "</span></button>";
        }).join("") + "</div></section>"
        + '<section class="stats-card stats-refs"><div class="stats-card-head"><h3>Where readers come from</h3></div>' + refsHTML(refs) + "</section></div>";
      box.innerHTML = h;
      wireLineChart(box.querySelector(".lc"), series);
      [].forEach.call(box.querySelectorAll(".st-spark"), function (el) {
        daySeries(Math.min(days, 30), el.getAttribute("data-path")).then(function (s) { el.innerHTML = sparkSVG(s, 96, 26); }, function () {});
      });
    }).catch(function (e) {
      var msg = e && e.message || String(e);
      if (/API key/.test(msg)) { box.innerHTML = statsSetupHTML(msg); return; }
      var l = box.querySelector(".topics-loading"); if (l) l.textContent = "Couldn’t load the stats: " + msg;
    });
  }
  function refsHTML(refs) {
    refs = refs.filter(function (r) { return r.x; });
    if (!refs.length) return '<p class="kpi-note" style="padding:6px 0">Mostly direct visits — no referring sites in this period.</p>';
    var max = Math.max.apply(null, refs.map(function (r) { return +r.y || 0; })) || 1;
    return '<div class="ref-rows">' + refs.map(function (r) {
      return '<div class="ref-row"><span class="ref-name">' + htmlEsc(String(r.x).replace(/^www\./, "")) + '</span><span class="ref-bar"><i style="width:' + Math.max(2, (+r.y || 0) / max * 100) + '%"></i></span><span class="ref-n">' + compact(r.y) + "</span></div>";
    }).join("") + "</div>";
  }
  // one series: a 2px line over a 10% wash, hairline grid, a crosshair + tooltip on hover
  function lineChart(series) {
    var W = 760, H = 200, L = 36, R = 12, T = 12, B = 24;
    var max = Math.max.apply(null, series.map(function (p) { return p.y; })), top = niceTop(max), iw = W - L - R, ih = H - T - B;
    var x = function (i) { return L + (series.length < 2 ? iw / 2 : i / (series.length - 1) * iw); }, y = function (v) { return T + ih - v / top * ih; };
    var grid = [0, 0.5, 1].map(function (f) { var v = Math.round(top * f); return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + compact(v) + "</text>"; }).join("");
    var pts = series.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.y).toFixed(1); });
    var every = Math.ceil(series.length / 6), ticks = series.map(function (p, i) {
      if (i % every && i !== series.length - 1) return "";
      var d = new Date(p.day + "T12:00:00"); return '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + "</text>";
    }).join("");
    var last = series.length - 1;
    return '<div class="lc"><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Page views per day">'
      + '<g class="lc-grid">' + grid + "</g>"
      + '<polygon class="lc-area" points="' + x(0) + "," + y(0) + " " + pts.join(" ") + " " + x(last) + "," + y(0) + '"/>'
      + '<polyline class="lc-line" points="' + pts.join(" ") + '"/>'
      + '<circle class="lc-end" cx="' + x(last) + '" cy="' + y(series[last].y) + '" r="4"/>'
      + '<g class="lc-axis">' + ticks + "</g>"
      + '<line class="lc-cross" y1="' + T + '" y2="' + (T + ih) + '" x1="0" x2="0"/><circle class="lc-dot" r="4" cx="0" cy="0"/></svg><div class="lc-tip" hidden></div></div>';
  }
  function niceTop(v) { if (v <= 5) return 5; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function wireLineChart(el, series) {
    if (!el) return;
    var svg = el.querySelector("svg"), cross = el.querySelector(".lc-cross"), dot = el.querySelector(".lc-dot"), tip = el.querySelector(".lc-tip");
    var W = 760, L = 36, R = 12, T = 12, ih = 200 - 12 - 24, top = niceTop(Math.max.apply(null, series.map(function (p) { return p.y; })));
    function show(e) {
      var b = svg.getBoundingClientRect(), fx = (e.clientX - b.left) / b.width * W;
      var i = Math.max(0, Math.min(series.length - 1, Math.round((fx - L) / (W - L - R) * (series.length - 1))));
      var px = L + (series.length < 2 ? 0 : i / (series.length - 1) * (W - L - R)), py = T + ih - series[i].y / top * ih;
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); dot.setAttribute("cx", px); dot.setAttribute("cy", py);
      el.classList.add("is-hover"); tip.hidden = false;
      tip.innerHTML = "<b>" + series[i].y.toLocaleString("en-GB") + "</b> page views<br><span>" + new Date(series[i].day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + "</span>";
      var left = px / W * b.width; tip.style.left = Math.min(b.width - tip.offsetWidth - 4, Math.max(4, left - tip.offsetWidth / 2)) + "px";
    }
    el.addEventListener("pointermove", show);
    el.addEventListener("pointerleave", function () { el.classList.remove("is-hover"); tip.hidden = true; });
  }
  (function () {
    var box = document.getElementById("statsView"); if (!box) return;
    box.addEventListener("click", function (e) {
      if (e.target.closest("#umamiSave")) {
        var v = (document.getElementById("umamiKey").value || "").trim(); if (!v) return;
        localStorage.setItem(UMAMI_KEY, v); statsMemo = {}; renderStats(); return;
      }
      if (e.target.closest(".stats-forget")) { if (confirm("Forget the Umami key on this device?")) { localStorage.removeItem(UMAMI_KEY); statsMemo = {}; renderStats(); } return; }
      var rb = e.target.closest("[data-days]"); if (rb) { statsRange = +rb.getAttribute("data-days"); renderStats(); return; }
      var row = e.target.closest(".st-row"); if (row) editTopic(row.getAttribute("data-slug"));
    });
    box.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "umamiKey") document.getElementById("umamiSave").click(); });
  })();
  // a quiet line of numbers on each Topics row: opens over 7 days + their trend
  function topicRowStats(listEl) {
    if (!(localStorage.getItem(UMAMI_KEY) || "").trim()) return;
    topicViews(7).then(function (views) {
      [].forEach.call(listEl.querySelectorAll(".topic-row[data-slug]"), function (row) {
        var slug = row.getAttribute("data-slug"), slot = row.querySelector(".topic-stat"); if (!slot) return;
        slot.innerHTML = '<span class="topic-stat-n">' + compact(views[slug] || 0) + "</span><span>opens · 7 d</span>";
        daySeries(7, topicPath(slug)).then(function (s) { slot.insertAdjacentHTML("afterbegin", sparkSVG(s, 64, 22)); }, function () {});
      });
    }, function () {});
  }

  /* ---------- EN | FR: the two languages side by side, field by field ---------- */
  var translating = false, trOnlyMissing = false;
  function trFields() {
    var out = [{ label: "Title", o: state, key: "title", kind: "line" }];
    var n = 0;
    state.blocks.forEach(function (b) {
      n++;
      var at = " · block " + n;
      if (b.type === "text") out.push({ label: (b.head ? "Heading" : "Text") + at, o: b, key: "html", kind: "rich" });
      else if (b.type === "quote") { out.push({ label: "Quote" + at, o: b, key: "text", kind: "rich" }); out.push({ label: "Quote, who said it" + at, o: b, key: "cite", kind: "line" }); }
      else if (b.type === "hand") out.push({ label: "Handwritten" + at, o: b, key: "text", kind: "plain" });
      else if (b.type === "sign") out.push({ label: "Signature" + at, o: b, key: "text", kind: "line" });
      else if (b.type === "image") {
        out.push({ label: "Picture caption" + at, o: b, key: "caption", kind: "rich", thumb: b.src });
        out.push({ label: "Picture note" + at, o: b, key: "note", kind: "line", thumb: b.src });
        out.push({ label: "Picture description (alt)" + at, o: b, key: "alt", kind: "line", thumb: b.src });
      } else if (b.type === "video") out.push({ label: "Video caption" + at, o: b, key: "caption", kind: "rich" });
      else if (b.type === "board") (b.items || []).forEach(function (it, i) { if (it.kind !== "video") out.push({ label: "Board picture " + (i + 1) + " note" + at, o: it, key: "note", kind: "line", thumb: it.src }); });
    });
    // only what has English to translate
    return out.filter(function (f) { return plain(f.o[f.key]); });
  }
  function frOf(f) { return f.o === state ? (state.fr && state.fr.title) || "" : (f.o.fr && f.o.fr[f.key]) || ""; }
  function setFr(f, v) {
    if (f.o === state) { state.fr = state.fr || {}; state.fr.title = v; return; }
    f.o.fr = f.o.fr || {};
    if (plain(v)) f.o.fr[f.key] = v; else delete f.o.fr[f.key];
  }
  function renderTranslate() {
    var box = document.getElementById("trView"); if (!box) return;
    var fields = trFields(), done = fields.filter(function (f) { return plain(frOf(f)); }).length;
    box.innerHTML = '<div class="tr-head"><div><h2>French, side by side</h2><p class="tr-sub">English is the source. Anything left empty shows in English on the French site.</p></div>'
      + '<div class="tr-progress"><span class="tr-count"><b>' + done + "</b> of " + fields.length + ' translated</span><span class="tr-meter"><i style="width:' + (fields.length ? done / fields.length * 100 : 0) + '%"></i></span>'
      + '<label class="tr-only"><input type="checkbox" id="trOnly"' + (trOnlyMissing ? " checked" : "") + "> Only what’s missing</label></div></div>"
      + '<div class="tr-cols"><span>English</span><span>Français</span></div><div class="tr-rows"></div>';
    var rows = box.querySelector(".tr-rows");
    if (!fields.length) rows.innerHTML = '<p class="topics-empty">Write the English first — its fields show up here to translate.</p>';
    fields.forEach(function (f) {
      var row = document.createElement("div"); row.className = "tr-row";
      var miss = !plain(frOf(f)); row.classList.toggle("is-missing", miss); if (trOnlyMissing && !miss) row.hidden = true;
      var lab = document.createElement("div"); lab.className = "tr-label"; lab.textContent = f.label;
      var en = document.createElement("div"); en.className = "tr-en" + (f.kind === "plain" ? " is-plain" : "");
      if (f.thumb) { var im = document.createElement("img"); im.src = f.thumb; im.alt = ""; im.className = "tr-thumb"; en.appendChild(im); }
      var ent = document.createElement("div"); if (f.kind === "rich") ent.innerHTML = cleanRich(f.o[f.key]); else ent.textContent = f.o[f.key]; en.appendChild(ent);
      var fr = document.createElement("div"); fr.className = "tr-fr" + (f.kind === "plain" ? " is-plain" : ""); fr.contentEditable = "true"; fr.spellcheck = true; fr.lang = "fr";
      fr.dataset.ph = "Missing — write the French here";
      if (f.kind === "rich") fr.innerHTML = frOf(f); else fr.textContent = frOf(f);
      fr.addEventListener("input", function () {
        var v = f.kind === "rich" ? fr.innerHTML : (f.kind === "plain" ? fr.innerText.replace(/\n$/, "") : fr.textContent);
        setFr(f, v); touch();
        var m = !plain(v); row.classList.toggle("is-missing", m);
        var all = trFields(), d = all.filter(function (x) { return plain(frOf(x)); }).length;
        box.querySelector(".tr-count").innerHTML = "<b>" + d + "</b> of " + all.length + " translated";
        box.querySelector(".tr-meter i").style.width = (all.length ? d / all.length * 100 : 0) + "%";
      });
      fr.addEventListener("keydown", function (e) { if (e.key === "Enter" && f.kind === "line") e.preventDefault(); });
      fr.addEventListener("paste", function (e) {
        if (!e.clipboardData) return; e.preventDefault();
        var h = f.kind === "rich" && e.clipboardData.getData("text/html");
        if (h) document.execCommand("insertHTML", false, cleanRich(h)); else document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      });
      row.appendChild(lab); row.appendChild(en); row.appendChild(fr); rows.appendChild(row);
    });
    var only = box.querySelector("#trOnly");
    if (only) only.addEventListener("change", function () { trOnlyMissing = only.checked; [].forEach.call(rows.querySelectorAll(".tr-row"), function (r) { r.hidden = trOnlyMissing && !r.classList.contains("is-missing"); }); });
  }
  function setTranslating(on) {
    translating = on;
    document.body.classList.toggle("view-translate", on);
    var tv = document.getElementById("trView"); if (tv) tv.hidden = !on;
    [].forEach.call(langSeg.children, function (c) { c.setAttribute("aria-pressed", String(on ? c.dataset.lang === "both" : c.dataset.lang === lang)); });
    if (on) { hideFmtBar(); selectedId = null; renderTranslate(); }
    else render();
  }

  render();
  showDraftBanner();
  loadLists().catch(function () {});
})();
