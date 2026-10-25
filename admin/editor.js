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
    renderInspector();
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
    var box = e.target && e.target.closest && e.target.closest(".b-text, .b-cap, .bq-text, .bq-cite");
    if (!box || !e.clipboardData) return;
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
        if (b.frame !== false && window.MacWin) { vw.classList.add("has-win"); vw.appendChild(MacWin.frameDOM(vm, { ratio: "orig", fit: "fill", title: videoWinTitle(b) }, yt ? 16 : b.nat && b.nat.w, yt ? 9 : b.nat && b.nat.h)); }
        else vw.appendChild(vm);
      } else { vw.innerHTML = "<span>click or drop a video</span>"; vw.addEventListener("click", function () { pickVideo(b); }); }
      wireMediaDrop(vw, b);
      return withCaption(vw, b);
    }
    if (b.type === "quote") {
      var qw = document.createDocumentFragment();
      qw.appendChild(editableLine(b, "text", "bq-text", "A line worth hanging on the wall…", "Une phrase à accrocher au mur…"));
      qw.appendChild(editableLine(b, "cite", "bq-cite", "Who said it", "Qui l’a dit"));
      return qw;
    }
    return renderBoard(b);
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
    if (it.kind === "video" && it.win && window.MacWin) {
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
    var img = document.createElement("img"); img.src = it.src; img.draggable = false; wrap.appendChild(img);
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
        .then(function (arr) { arr.forEach(function (o) { if (!o) return; var dw = o.it.w / 100 * W, dh = dw * (o.im.naturalHeight / o.im.naturalWidth); ctx.save(); if (o.it.win) itemShadow(ctx, dw); ctx.drawImage(o.im, o.it.x / 100 * W, o.it.y / 100 * H, dw, dh); ctx.restore(); }); c.toBlob(resolve, "image/png"); });
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
  function toneField() {
    var sw = document.createElement("div"); sw.className = "insp-swatches";
    TONES.forEach(function (t) {
      var s = document.createElement("button"); s.type = "button"; s.style.background = t[1]; s.title = t[2];
      if ((state.tone || "") === t[0]) s.classList.add("is-on");
      s.addEventListener("click", function () { state.tone = t[0]; renderInspector(); });
      sw.appendChild(s);
    });
    return sw;
  }
  function renderInspector() {
    inspectorEl.innerHTML = "";
    // document settings (always)
    var docSec = document.createElement("div"); docSec.className = "insp-section";
    var dt = document.createElement("div"); dt.className = "insp-title"; dt.textContent = "Topic"; docSec.appendChild(dt);
    docSec.appendChild(field("Author", authorSelect()));
    docSec.appendChild(field("Cover", coverField()));
    var descTa = document.createElement("textarea"); descTa.className = "insp-input insp-textarea"; descTa.rows = 3;
    descTa.placeholder = "Short blurb shown on the card (leave empty to auto-use the opening line)";
    descTa.value = state.desc || "";
    descTa.addEventListener("input", function () { state.desc = descTa.value; });
    docSec.appendChild(field("Description", descTa));
    var inspTa = document.createElement("textarea"); inspTa.className = "insp-input insp-textarea"; inspTa.rows = 3;
    inspTa.placeholder = "Sources / inspiration — one per line";
    inspTa.value = state.inspiration || "";
    inspTa.addEventListener("input", function () { state.inspiration = inspTa.value; });
    docSec.appendChild(field("Inspiration", inspTa));
    docSec.appendChild(field("Room tone", toneField()));
    inspectorEl.appendChild(docSec);

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
        st.textContent = "Block"; sec.appendChild(st);
        var e = document.createElement("div"); e.className = "insp-empty";
        e.textContent = "Select a block to edit its settings, or press + to add one.";
        sec.appendChild(e);
      }
      inspectorEl.appendChild(sec); return;
    }
    st.textContent = b.type.charAt(0).toUpperCase() + b.type.slice(1); sec.appendChild(st);

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
      bh.textContent = "Drop or add images and videos — they arrive in a Preview window (pick a ratio; Fill crops the picture into it). Add text makes a TextEdit window. Drag to place, drag the ⤡ corner to resize.";
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
  function addBlock(type) {
    var b = type === "text" ? { id: uid(), type: "text", head: false, html: "" }
          : type === "image" ? { id: uid(), type: "image", src: "", alt: "", caption: "", inset: false }
          : type === "video" ? { id: uid(), type: "video", src: "", caption: "" }
          : type === "quote" ? { id: uid(), type: "quote", text: "", cite: "" }
          : { id: uid(), type: "board", bg: "none", items: [], zc: 0 };
    var i = selectedId ? state.blocks.findIndex(function (x) { return x.id === selectedId; }) : state.blocks.length - 1;
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
    var btn = e.target.closest("button[data-lang]"); if (!btn || btn.dataset.lang === lang) return;
    lang = btn.dataset.lang;
    [].forEach.call(langSeg.children, function (c) { c.setAttribute("aria-pressed", c === btn ? "true" : "false"); });
    document.querySelector(".doc").lang = lang;
    hideFmtBar();
    render();
    if (document.body.classList.contains("is-preview")) document.querySelectorAll(".b-text, .b-cap, .bq-text, .bq-cite").forEach(function (t) { t.contentEditable = "false"; });
  });
  document.getElementById("addBlock").addEventListener("click", function (e) { e.stopPropagation(); openPicker(e.currentTarget); });
  document.getElementById("exportBtn").addEventListener("click", function () { exportBlocks(this); });
  document.getElementById("publishBtn").addEventListener("click", openPub);
  document.getElementById("previewBtn").addEventListener("click", function () {
    var on = document.body.classList.toggle("is-preview");
    this.textContent = on ? "Edit" : "Preview";
    document.querySelectorAll(".b-text, .b-cap, .bq-text, .bq-cite").forEach(function (t) { t.contentEditable = on ? "false" : "true"; });
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
  async function publish(token, log) {
    log("Preparing…");
    var slug = editingSlug || slugify(state.title) || ("topic-" + Date.now());
    var date = new Date().toISOString().slice(0, 10);
    var files = [], outBlocks = [], cover = null, mi = 0;
    for (var i = 0; i < state.blocks.length; i++) {
      var b = state.blocks[i];
      if (b.type === "text") { outBlocks.push(withFr({ type: "text", head: !!b.head, html: b.html || "" }, b, ["html"])); }
      else if (b.type === "quote") { if (plain(b.text)) outBlocks.push(withFr({ type: "quote", text: cleanRich(b.text || ""), cite: (b.cite || "").trim() }, b, ["text", "cite"])); }
      else if (b.type === "image") {
        if (!b.src) continue;
        if (b.src.indexOf("/curation/media/") === 0) { if (!cover) cover = b.src; outBlocks.push(withFr({ type: "image", src: b.src, alt: b.alt || "", caption: b.caption || "", note: b.note || "", inset: !!b.inset }, b, ["alt", "caption", "note"])); continue; }
        var bl = await blobFromSrc(b.src), ext = extFromType(bl.type), p = "curation/media/" + slug + "/img-" + (++mi) + "." + ext;
        files.push({ path: p, base64: await blobToBase64(bl) }); if (!cover) cover = "/" + p;
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
          if (!cover) cover = "/" + p3;
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
            var bo = { src: ipath, x: +it.x.toFixed(3), y: +it.y.toFixed(3), w: +it.w.toFixed(3), h: +(it.w * dim.h / dim.w).toFixed(3), name: (it.win && it.win.title) || it.name || "" };
            if (it.note) bo.note = it.note;
            if (it.fr && it.fr.note) bo.fr = { note: it.fr.note };
            bitems.push(bo);
          }
          outBlocks.push({ type: "image", src: "/" + p3, alt: state.title || "", caption: "", inset: false, board: { bg: b.bg || "#ebebef", items: bitems } });
        }
      }
    }
    if (state.cover) {
      if (typeof state.cover === "string") {
        if (state.cover.indexOf("/curation/media/") === 0) { cover = state.cover; }
        else { var cbl = await blobFromSrc(state.cover), cext = extFromType(cbl.type), cp = "curation/media/" + slug + "/cover." + cext; files.push({ path: cp, base64: await blobToBase64(cbl) }); cover = "/" + cp; }
      } else if (state.cover.items && state.cover.items.length) {
        var cbb = await coverToPNGBlob(state.cover); var cpb = "curation/media/" + slug + "/cover.png"; files.push({ path: cpb, base64: await blobToBase64(cbb) }); cover = "/" + cpb;
      }
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
    if (state.tone) topic.tone = state.tone;
    var frTitle = (state.fr && state.fr.title || "").trim();
    var langs = ["en"];
    if (frTitle || outBlocks.some(function (x) { return x.fr; })) { langs.push("fr"); topic.fr = frTitle ? { title: frTitle } : {}; }
    topic.langs = langs;
    log("Updating index…");
    var index = [];
    try { var idx = await gh("/repos/" + REPO + "/contents/curation/topics/index.json?ref=" + BRANCH, {}, token); index = JSON.parse(decodeURIComponent(escape(atob(idx.content.replace(/\n/g, ""))))); } catch (e) { index = []; }
    // catalogue number: a topic keeps its number; a new one gets the next
    var prev = index.filter(function (t) { return t.slug === slug; })[0];
    var no = (prev && +prev.no) || (index.reduce(function (m, t, i) { return Math.max(m, +t.no || (index.length - i)); }, 0) + 1);
    topic.no = no;
    files.push({ path: "curation/topics/" + slug + ".json", text: JSON.stringify(topic, null, 2) });
    index = index.filter(function (t) { return t.slug !== slug; });
    var entry = { slug: slug, no: no, title: topic.title, author: topic.author, date: date, cover: cover, desc: desc, langs: langs };
    if (topic.tone) entry.tone = topic.tone;
    if (topic.fr) {
      var firstFr = outBlocks.filter(function (b) { return b.type === "text" && b.fr && b.fr.html; })[0];
      entry.fr = {};
      if (topic.fr.title) entry.fr.title = topic.fr.title;
      if (firstFr) entry.fr.desc = plain(firstFr.fr.html).slice(0, 160);
    }
    index.unshift(entry);
    files.push({ path: "curation/topics/index.json", text: JSON.stringify(index, null, 2) });
    log("Committing " + files.length + " files…");
    var ref = await gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH, {}, token);
    var baseSha = ref.object.sha;
    var baseCommit = await gh("/repos/" + REPO + "/git/commits/" + baseSha, {}, token);
    var treeItems = [];
    for (var k = 0; k < files.length; k++) {
      var f = files[k];
      var body = f.base64 != null ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" };
      var blobResp = await gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: JSON.stringify(body) }, token);
      treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blobResp.sha });
    }
    var tree = await gh("/repos/" + REPO + "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeItems }) }, token);
    var commit = await gh("/repos/" + REPO + "/git/commits", { method: "POST", body: JSON.stringify({ message: 'Curation: publish "' + topic.title + '"', tree: tree.sha, parents: [baseSha] }) }, token);
    await gh("/repos/" + REPO + "/git/refs/heads/" + BRANCH, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) }, token);
    log("✅ Published “" + topic.title + "” → /curation/ (live in ~1–2 min once the site is deployed).");
  }

  var pubModal = document.getElementById("pubModal");
  function openPub() {
    document.getElementById("pubToken").value = localStorage.getItem(TOKEN_KEY) || "";
    var lg = document.getElementById("pubLog"); lg.hidden = true; lg.textContent = "";
    pubModal.hidden = false;
  }
  function closePub() { pubModal.hidden = true; }
  document.getElementById("pubClose").addEventListener("click", closePub);
  document.getElementById("pubBackdrop").addEventListener("click", closePub);
  document.getElementById("pubGo").addEventListener("click", function () {
    var token = document.getElementById("pubToken").value.trim();
    if (!token) { alert("Paste your GitHub token first."); return; }
    if (document.getElementById("pubRemember").checked) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
    var lg = document.getElementById("pubLog"); lg.hidden = false; lg.textContent = "";
    function log(m) { lg.textContent += m + "\n"; lg.scrollTop = lg.scrollHeight; }
    var btn = this; btn.disabled = true; btn.textContent = "Publishing…";
    publish(token, log).then(function () { btn.disabled = false; btn.textContent = "Publish now"; try { localStorage.removeItem("btbr_cur_draft"); } catch (e) {} })
      .catch(function (e) { log("❌ " + (e && e.message || e)); btn.disabled = false; btn.textContent = "Publish now"; });
  });

  /* ---------- Topics tab: list, edit, delete ---------- */
  function switchTab(tab) {
    document.body.classList.toggle("view-topics", tab === "topics");
    var tv = document.getElementById("topicsView"); if (tv) tv.hidden = tab !== "topics";
    [].forEach.call(document.querySelectorAll(".studio-tab"), function (b) { b.classList.toggle("is-active", b.dataset.tab === tab); });
    if (tab === "topics") renderTopicsList();
  }
  function renderTopicsList() {
    var listEl = document.getElementById("topicsList"); if (!listEl) return;
    listEl.innerHTML = '<p class="topics-loading">Loading…</p>';
    fetch("/curation/topics/index.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      if (!list || !list.length) { listEl.innerHTML = '<p class="topics-empty">No topics published yet.</p>'; return; }
      listEl.innerHTML = "";
      list.forEach(function (t) {
        var row = document.createElement("div"); row.className = "topic-row";
        var thumb = document.createElement(t.cover ? "img" : "div"); thumb.className = "topic-thumb"; if (t.cover) thumb.src = t.cover;
        var meta = document.createElement("div"); meta.className = "topic-meta";
        var ti = document.createElement("div"); ti.className = "topic-title"; ti.textContent = t.title || "Untitled";
        var sub = document.createElement("div"); sub.className = "topic-sub"; sub.textContent = (t.author || "") + (t.date ? " · " + t.date : "") + (t.langs && t.langs.length > 1 ? " · EN/FR" : "");
        meta.appendChild(ti); meta.appendChild(sub);
        var acts = document.createElement("div"); acts.className = "topic-acts";
        var ed = document.createElement("button"); ed.type = "button"; ed.textContent = "Edit"; ed.addEventListener("click", function () { editTopic(t.slug); });
        var dl = document.createElement("button"); dl.type = "button"; dl.className = "del"; dl.textContent = "Delete"; dl.addEventListener("click", function () { deleteTopic(t.slug, dl); });
        acts.appendChild(ed); acts.appendChild(dl);
        row.appendChild(thumb); row.appendChild(meta); row.appendChild(acts); listEl.appendChild(row);
      });
    }).catch(function () { listEl.innerHTML = '<p class="topics-empty">Couldn’t load topics.</p>'; });
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
    else if (pb.type === "video") { nb.src = pb.src || ""; nb.caption = pb.caption || ""; if (pb.frame === false || pb.board) nb.frame = false; if (pb.wtitle) nb.wtitle = pb.wtitle; if (pb.board) nb.board = true; }
    if (pb.fr) nb.fr = pb.fr;
    return nb;
  }
  function editTopic(slug) {
    fetch("/curation/topics/" + slug + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (t) {
      state.title = t.title || "";
      state.fr = { title: (t.fr && t.fr.title) || "" };
      state.author = t.author || "Isaac";
      state.cover = t.cover || null;
      state.desc = t.desc || "";
      state.inspiration = t.inspiration || "";
      state.tone = t.tone || "";
      state.blocks = (t.blocks || []).map(blockFromPublished);
      if (!state.blocks.length) state.blocks.push({ id: uid(), type: "text", head: false, html: "" });
      editingSlug = slug;
      selectedId = null;
      switchTab("write");
      render();
    }).catch(function () { alert("Couldn’t load that topic for editing."); });
  }
  function newTopic() {
    editingSlug = null;
    state.title = ""; state.fr = { title: "" }; state.author = "Isaac"; state.cover = null; state.desc = ""; state.inspiration = ""; state.tone = "";
    state.blocks = [{ id: uid(), type: "text", head: false, html: "" }];
    selectedId = null;
    switchTab("write"); render();
  }
  async function deleteTopic(slug, btn) {
    var token = (localStorage.getItem(TOKEN_KEY) || "").trim();
    if (!token) { alert("Set your GitHub token first — open Publish and paste it."); return; }
    if (!confirm("Delete “" + slug + "”? This removes the topic and its media. This can’t be undone.")) return;
    if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }
    try {
      var t = { blocks: [] };
      try { t = await fetch("/curation/topics/" + slug + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }); } catch (e) {}
      var mediaPaths = [];
      (t.blocks || []).forEach(function (b) {
        if (b.src && b.src.indexOf("/curation/media/") === 0) mediaPaths.push(b.src.replace(/^\//, ""));
        ((b.board && b.board.items) || []).forEach(function (it) { if (it.src && it.src.indexOf("/curation/media/") === 0 && mediaPaths.indexOf(it.src.slice(1)) < 0) mediaPaths.push(it.src.slice(1)); });
      });
      var index = [];
      try { var idx = await gh("/repos/" + REPO + "/contents/curation/topics/index.json?ref=" + BRANCH, {}, token); index = JSON.parse(decodeURIComponent(escape(atob(idx.content.replace(/\n/g, ""))))); } catch (e) { index = []; }
      index = index.filter(function (x) { return x.slug !== slug; });
      var ref = await gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH, {}, token);
      var baseSha = ref.object.sha;
      var baseCommit = await gh("/repos/" + REPO + "/git/commits/" + baseSha, {}, token);
      var treeItems = [{ path: "curation/topics/" + slug + ".json", mode: "100644", type: "blob", sha: null }];
      mediaPaths.forEach(function (p) { treeItems.push({ path: p, mode: "100644", type: "blob", sha: null }); });
      var iblob = await gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: JSON.stringify({ content: JSON.stringify(index, null, 2), encoding: "utf-8" }) }, token);
      treeItems.push({ path: "curation/topics/index.json", mode: "100644", type: "blob", sha: iblob.sha });
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
    var copy = { v: 1, savedAt: Date.now(), title: state.title, fr: state.fr, author: state.author, desc: state.desc, inspiration: state.inspiration, tone: state.tone || "", editingSlug: editingSlug, cover: null, blocks: [] };
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
      if (btn) { btn.textContent = "Saved ✓"; setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 1400); }
    } catch (e) {
      if (btn) { btn.textContent = label; btn.disabled = false; }
      var q = /quota/i.test(String(e));
      alert("Couldn’t save the draft" + (q ? " — it’s too large for local storage (big videos/boards don’t fit). Publish is the way to keep heavy topics." : ": " + (e && e.message || e)));
    }
  }
  function loadDraftData(d) {
    state.title = d.title || ""; state.fr = d.fr || { title: "" }; state.author = d.author || "Isaaaaaaaac"; state.cover = d.cover || null; state.desc = d.desc || ""; state.inspiration = d.inspiration || ""; state.tone = d.tone || "";
    editingSlug = d.editingSlug || null;
    state.blocks = (d.blocks || []).map(function (b) { return Object.assign({ id: uid() }, b); });
    if (!state.blocks.length) state.blocks.push({ id: uid(), type: "text", head: false, html: "" });
    selectedId = null; render();
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

  render();
  showDraftBanner();
})();
