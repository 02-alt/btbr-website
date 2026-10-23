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
    bylineEl.textContent = state.author || "Author";
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
      iw.className = "b-media" + (b.src ? " has-src" : "");
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
        if (yt) { var f = document.createElement("iframe"); f.src = "https://www.youtube.com/embed/" + yt; f.allowFullscreen = true; vw.appendChild(f); }
        else { var v = document.createElement("video"); v.src = b.src; v.controls = true; vw.appendChild(v); }
      } else { vw.innerHTML = "<span>click or drop a video</span>"; vw.addEventListener("click", function () { pickVideo(b); }); }
      wireMediaDrop(vw, b);
      return withCaption(vw, b);
    }
    return renderBoard(b);
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
    board.style.background = b.bg;
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
        b.items.push({ id: uid(), kind: kind, src: URL.createObjectURL(f), name: f.name, x: x, y: y, w: 42, z: ++b.zc });
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
    var media;
    if (it.kind === "video") {
      media = document.createElement("video");
      media.src = it.src; media.muted = true; media.loop = true; media.autoplay = true;
      media.playsInline = true; media.setAttribute("playsinline", "");
      media.play().catch(function () {});
    } else {
      media = document.createElement("img"); media.src = it.src;
    }
    media.draggable = false; wrap.appendChild(media);
    var rs = document.createElement("div"); rs.className = "board-resize"; rs.textContent = "⤡"; wrap.appendChild(rs);
    wrap.addEventListener("pointerdown", function (e) {
      if (document.body.classList.contains("is-preview")) return;
      select(b.id);
      if (e.target === rs) { boardResize(e, b, board, it, wrap); return; }
      boardMove(e, b, board, it, wrap);
    });
    return wrap;
  }
  function selItem(board, id) {
    board.querySelectorAll(".board-item").forEach(function (el) { el.classList.toggle("is-sel", el.dataset.iid === id); });
  }
  function boardMove(e, b, board, it, wrap) {
    e.preventDefault(); e.stopPropagation();
    selItem(board, it.id);
    it.z = ++b.zc; wrap.style.zIndex = it.z;
    wrap.classList.add("is-dragging");
    board.classList.add("is-arranging");
    wrap.setPointerCapture(e.pointerId);
    var brd = board.getBoundingClientRect();
    var r = wrap.getBoundingClientRect();
    var offX = e.clientX - r.left, offY = e.clientY - r.top;
    var wPct = r.width / brd.width * 100, hPct = r.height / brd.height * 100;
    function mv(ev) {
      it.x = clamp((ev.clientX - brd.left - offX) / brd.width * 100, 0, 100 - wPct);
      it.y = clamp((ev.clientY - brd.top - offY) / brd.height * 100, 0, 100 - hPct);
      wrap.style.left = it.x + "%"; wrap.style.top = it.y + "%";
    }
    function up() { wrap.removeEventListener("pointermove", mv); wrap.classList.remove("is-dragging"); board.classList.remove("is-arranging"); }
    wrap.addEventListener("pointermove", mv);
    wrap.addEventListener("pointerup", up, { once: true });
  }
  function boardResize(e, b, board, it, wrap) {
    e.preventDefault(); e.stopPropagation();
    selItem(board, it.id);
    wrap.setPointerCapture(e.pointerId);
    var brd = board.getBoundingClientRect();
    var left = wrap.getBoundingClientRect().left;
    function mv(ev) {
      it.w = clamp((ev.clientX - left) / brd.width * 100, 12, 100 - it.x);
      wrap.style.width = it.w + "%";
    }
    function up() { wrap.removeEventListener("pointermove", mv); }
    wrap.addEventListener("pointermove", mv);
    wrap.addEventListener("pointerup", up, { once: true });
  }
  function addBoardMedia(b, kind) {
    if (b.items.length >= 6) return;
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = kind === "video" ? "video/*" : "image/*";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var n = b.items.length;
      b.items.push({ id: uid(), kind: kind, src: URL.createObjectURL(f), name: f.name, x: 8 + n * 6, y: 8 + n * 6, w: 42, z: ++b.zc });
      render(); select(b.id);
    });
    inp.click();
  }
  function boardHasVideo(b) { return b.items.some(function (it) { return it.kind === "video"; }); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
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
      if (f) { b.src = URL.createObjectURL(f); b.name = f.name; render(); select(b.id); }
    });
  }

  /* ---------- export a board to a high-res PNG ---------- */
  function boardIndex(b) { return state.blocks.filter(function (x) { return x.type === "board"; }).indexOf(b); }
  function boardFilename(i) {
    var base = (state.title || "board").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "board";
    return base + "-board-" + (i + 1) + ".png";
  }
  function exportBoardToPNG(b) {
    var SIZE = 2048; // 1:1 board → crisp 2048×2048 export
    var canvas = document.createElement("canvas"); canvas.width = SIZE; canvas.height = SIZE;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = b.bg || "#ebebef"; ctx.fillRect(0, 0, SIZE, SIZE);
    var items = b.items.slice().sort(function (a, c) { return (a.z || 0) - (c.z || 0); });
    Promise.all(items.map(function (it) {
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () { res({ it: it, im: im }); };
        im.onerror = function () { res(null); };
        im.src = it.src;
      });
    })).then(function (arr) {
      arr.forEach(function (o) {
        if (!o) return;
        var dw = o.it.w / 100 * SIZE;
        var dh = dw * (o.im.naturalHeight / o.im.naturalWidth);
        ctx.drawImage(o.im, o.it.x / 100 * SIZE, o.it.y / 100 * SIZE, dw, dh);
      });
      canvas.toBlob(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = boardFilename(boardIndex(b));
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      }, "image/png");
    });
  }

  /* ---------- export a board with video → looping WebM (native capture) ---------- */
  function exportBoardToWebM(b, btn) {
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      alert("This browser can't record WebM — try Chrome or a recent Safari.");
      return;
    }
    var SIZE = 1080;
    var canvas = document.createElement("canvas"); canvas.width = SIZE; canvas.height = SIZE;
    var ctx = canvas.getContext("2d");
    var items = b.items.slice().sort(function (a, c) { return (a.z || 0) - (c.z || 0); });
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }
    Promise.all(items.map(function (it) {
      return new Promise(function (res) {
        if (it.kind === "video") {
          var v = document.createElement("video");
          v.src = it.src; v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute("playsinline", "");
          v.addEventListener("loadeddata", function () { res({ it: it, el: v, vid: true }); }, { once: true });
          v.addEventListener("error", function () { res(null); }, { once: true });
          v.load();
        } else {
          var im = new Image();
          im.onload = function () { res({ it: it, el: im, vid: false }); };
          im.onerror = function () { res(null); };
          im.src = it.src;
        }
      });
    })).then(function (media) {
      media = media.filter(Boolean);
      var durs = media.filter(function (m) { return m.vid; }).map(function (m) { return m.el.duration; }).filter(function (d) { return isFinite(d) && d > 0; });
      var loopMs = Math.min(15000, (durs.length ? Math.max.apply(null, durs) : 3) * 1000);
      var stream = canvas.captureStream(30);
      var mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9"
               : MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8"
               : "video/webm";
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 });
      var chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        var blob = new Blob(chunks, { type: "video/webm" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = boardFilename(boardIndex(b)).replace(/\.png$/, ".webm");
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
        media.forEach(function (m) { if (m.vid) m.el.pause(); });
        if (btn) { btn.disabled = false; btn.textContent = label; }
      };
      media.forEach(function (m) { if (m.vid) { try { m.el.currentTime = 0; } catch (e) {} m.el.play().catch(function () {}); } });
      var raf;
      function frame() {
        ctx.fillStyle = b.bg || "#ebebef"; ctx.fillRect(0, 0, SIZE, SIZE);
        media.forEach(function (m) {
          var it = m.it, el = m.el;
          var nw = m.vid ? el.videoWidth : el.naturalWidth, nh = m.vid ? el.videoHeight : el.naturalHeight;
          if (!nw || !nh) return;
          var dw = it.w / 100 * SIZE, dh = dw * (nh / nw);
          try { ctx.drawImage(el, it.x / 100 * SIZE, it.y / 100 * SIZE, dw, dh); } catch (e) {}
        });
        raf = requestAnimationFrame(frame);
      }
      frame(); rec.start();
      if (btn) btn.textContent = "Recording…";
      setTimeout(function () { cancelAnimationFrame(raf); if (rec.state !== "inactive") rec.stop(); }, loopMs + 120);
    });
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
  function authorSelect() {
    if (AUTHORS.indexOf(state.author) === -1) { state.author = AUTHORS[0]; bylineEl.textContent = state.author; }
    var s = document.createElement("select"); s.className = "insp-select";
    AUTHORS.forEach(function (n) { var o = document.createElement("option"); o.value = n; o.textContent = n; if (n === state.author) o.selected = true; s.appendChild(o); });
    s.addEventListener("change", function () { state.author = s.value; bylineEl.textContent = s.value; });
    return s;
  }

  function renderInspector() {
    inspectorEl.innerHTML = "";
    // document settings (always)
    var docSec = document.createElement("div"); docSec.className = "insp-section";
    var dt = document.createElement("div"); dt.className = "insp-title"; dt.textContent = "Topic"; docSec.appendChild(dt);
    docSec.appendChild(field("Author", authorSelect()));
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
    } else if (b.type === "video") {
      sec.appendChild(field("Video URL", textInput(b.src, "YouTube link or .mp4", function (v) { b.src = v; rerenderBlock(b.id); })));
      var hint = document.createElement("div"); hint.className = "insp-empty"; hint.textContent = "YouTube links embed automatically; direct .mp4 files get a player. Caption: type under the video; select text to colour it.";
      sec.appendChild(hint);
    } else if (b.type === "board") {
      // background: swatches + colour picker
      var colorRow = document.createElement("div"); colorRow.className = "insp-color";
      var sw = document.createElement("div"); sw.className = "insp-swatches";
      ["#ebebef", "#111113", "#f4ece2", "#dfe7e4", "#ffffff"].forEach(function (c) {
        var s = document.createElement("button"); s.type = "button"; s.style.background = c;
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
          var row = document.createElement("div"); row.className = "insp-item";
          var th = document.createElement("img"); th.className = "thumb"; th.src = it.src; row.appendChild(th);
          var nm = document.createElement("span"); nm.className = "iname"; nm.textContent = it.name || "image"; row.appendChild(nm);
          var rm = document.createElement("button"); rm.type = "button"; rm.className = "irm"; rm.innerHTML = "&times;"; rm.title = "Remove";
          rm.addEventListener("click", function () { b.items = b.items.filter(function (x) { return x.id !== it.id; }); render(); select(b.id); });
          row.appendChild(rm); list.appendChild(row);
        });
        sec.appendChild(field("Media (" + b.items.length + "/6)", list));
      }
      var full = b.items.length >= 6;
      var addRow = document.createElement("div"); addRow.className = "insp-seg";
      var addImg = document.createElement("button"); addImg.type = "button"; addImg.textContent = "Add image"; addImg.disabled = full;
      addImg.addEventListener("click", function () { addBoardMedia(b, "image"); });
      var addVid = document.createElement("button"); addVid.type = "button"; addVid.textContent = "Add video"; addVid.disabled = full;
      addVid.addEventListener("click", function () { addBoardMedia(b, "video"); });
      addRow.appendChild(addImg); addRow.appendChild(addVid);
      sec.appendChild(addRow);
      if (full) { var mx = document.createElement("div"); mx.className = "insp-empty"; mx.style.marginTop = "6px"; mx.textContent = "Maximum 6 items."; sec.appendChild(mx); }
      var bh = document.createElement("div"); bh.className = "insp-empty"; bh.style.marginTop = "10px";
      bh.textContent = "Drop or add images and videos; drag to place, drag the ⤡ corner to resize. Ratios are kept.";
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
          : { id: uid(), type: "board", bg: "#ebebef", items: [], zc: 0 };
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
      b.src = URL.createObjectURL(f); render(); select(b.id);
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
  function exportDoc() {
    var out = JSON.stringify({ title: state.title, fr: state.fr, author: state.author, blocks: state.blocks }, null, 2);
    if (navigator.clipboard) navigator.clipboard.writeText(out);
    console.log(out);
    alert("Topic copied to clipboard as JSON (also logged to the console). This is the data a publish step would commit.");
  }

  /* ---------- wire up ---------- */
  titleEl.addEventListener("input", function () { setTr(state, "title", titleEl.value); });
  var langSeg = document.getElementById("langSeg");
  langSeg.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-lang]"); if (!btn || btn.dataset.lang === lang) return;
    lang = btn.dataset.lang;
    [].forEach.call(langSeg.children, function (c) { c.setAttribute("aria-pressed", c === btn ? "true" : "false"); });
    document.querySelector(".doc").lang = lang;
    hideCapToolbar();
    render();
    if (document.body.classList.contains("is-preview")) document.querySelectorAll(".b-text, .b-cap").forEach(function (t) { t.contentEditable = "false"; });
  });
  document.getElementById("addBlock").addEventListener("click", function (e) { e.stopPropagation(); openPicker(e.currentTarget); });
  document.getElementById("exportBtn").addEventListener("click", exportDoc);
  document.getElementById("publishBtn").addEventListener("click", openPub);
  document.getElementById("previewBtn").addEventListener("click", function () {
    var on = document.body.classList.toggle("is-preview");
    this.textContent = on ? "Edit" : "Preview";
    document.querySelectorAll(".b-text, .b-cap").forEach(function (t) { t.contentEditable = on ? "false" : "true"; });
    if (on) hideCapToolbar();
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

  /* ---------- caption colour-emphasis toolbar ---------- */
  var capTb = null;
  function buildCapToolbar() {
    if (capTb) return capTb;
    capTb = document.createElement("div"); capTb.className = "cap-toolbar"; capTb.hidden = true;
    var g = document.createElement("button"); g.type = "button"; g.className = "cap-swatch grad"; g.title = "Gradient emphasis";
    g.addEventListener("mousedown", function (e) { e.preventDefault(); applyCapGrad(); });
    capTb.appendChild(g);
    var plain = document.createElement("button"); plain.type = "button"; plain.className = "cap-plain"; plain.textContent = "Plain";
    plain.addEventListener("mousedown", function (e) { e.preventDefault(); applyCapPlain(); });
    capTb.appendChild(plain);
    document.body.appendChild(capTb);
    return capTb;
  }
  function hideCapToolbar() { if (capTb) capTb.hidden = true; }
  function capFromSelection() {
    var s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    var n = s.anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
    var cap = el && el.closest && el.closest(".b-cap");
    return (cap && cap.isContentEditable) ? cap : null;
  }
  function updateCapToolbar() {
    var cap = capFromSelection(); var tb = buildCapToolbar();
    if (!cap) { tb.hidden = true; return; }
    var rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { tb.hidden = true; return; }
    tb.hidden = false;
    tb.style.left = (rect.left + rect.width / 2) + "px";
    tb.style.top = rect.top + "px";
  }
  function saveCap(cap) { var blk = cap.closest(".block"); var b = blk && blockById(blk.dataset.id); if (b) setTr(b, "caption", cap.innerHTML); }
  function applyCapGrad() {
    var cap = capFromSelection(); if (!cap) return;
    var sel = window.getSelection(); if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0); if (range.collapsed) return;
    var span = document.createElement("span"); span.className = "cap-grad";
    try { span.appendChild(range.extractContents()); range.insertNode(span); } catch (e) { return; }
    cap.normalize();
    var r = document.createRange(); r.selectNodeContents(span); sel.removeAllRanges(); sel.addRange(r);
    saveCap(cap); updateCapToolbar();
  }
  function applyCapPlain() {
    var cap = capFromSelection(); if (!cap) return;
    var range = window.getSelection().getRangeAt(0);
    [].slice.call(cap.querySelectorAll(".cap-grad")).forEach(function (s) {
      if (range.intersectsNode(s)) { while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s); s.remove(); }
    });
    cap.normalize(); saveCap(cap); hideCapToolbar();
  }
  document.addEventListener("selectionchange", updateCapToolbar);
  window.addEventListener("scroll", function () { if (capTb && !capTb.hidden) updateCapToolbar(); }, true);

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
    return new Promise(function (resolve) {
      var SIZE = 2048; var c = document.createElement("canvas"); c.width = c.height = SIZE; var ctx = c.getContext("2d");
      ctx.fillStyle = b.bg || "#ebebef"; ctx.fillRect(0, 0, SIZE, SIZE);
      var items = b.items.slice().sort(function (a, d) { return (a.z || 0) - (d.z || 0); });
      Promise.all(items.map(function (it) { return new Promise(function (r) { var im = new Image(); im.onload = function () { r({ it: it, im: im }); }; im.onerror = function () { r(null); }; im.src = it.src; }); }))
        .then(function (arr) { arr.forEach(function (o) { if (!o) return; var dw = o.it.w / 100 * SIZE, dh = dw * (o.im.naturalHeight / o.im.naturalWidth); ctx.drawImage(o.im, o.it.x / 100 * SIZE, o.it.y / 100 * SIZE, dw, dh); }); c.toBlob(resolve, "image/png"); });
    });
  }
  function boardToWebMBlob(b) {
    return new Promise(function (resolve, reject) {
      if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) { reject(new Error("This browser can't record WebM")); return; }
      var SIZE = 1080; var c = document.createElement("canvas"); c.width = c.height = SIZE; var ctx = c.getContext("2d");
      var items = b.items.slice().sort(function (a, d) { return (a.z || 0) - (d.z || 0); });
      Promise.all(items.map(function (it) {
        return new Promise(function (r) {
          if (it.kind === "video") { var v = document.createElement("video"); v.src = it.src; v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.addEventListener("loadeddata", function () { r({ it: it, el: v, vid: true }); }, { once: true }); v.addEventListener("error", function () { r(null); }, { once: true }); v.load(); }
          else { var im = new Image(); im.onload = function () { r({ it: it, el: im, vid: false }); }; im.onerror = function () { r(null); }; im.src = it.src; }
        });
      })).then(function (media) {
        media = media.filter(Boolean);
        var durs = media.filter(function (m) { return m.vid; }).map(function (m) { return m.el.duration; }).filter(function (d) { return isFinite(d) && d > 0; });
        var loopMs = Math.min(15000, (durs.length ? Math.max.apply(null, durs) : 3) * 1000);
        var mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
        var rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 12000000 }); var chunks = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () { media.forEach(function (m) { if (m.vid) m.el.pause(); }); resolve(new Blob(chunks, { type: "video/webm" })); };
        media.forEach(function (m) { if (m.vid) { try { m.el.currentTime = 0; } catch (e) {} m.el.play().catch(function () {}); } });
        var raf; function frame() { ctx.fillStyle = b.bg || "#ebebef"; ctx.fillRect(0, 0, SIZE, SIZE); media.forEach(function (m) { var it = m.it, el = m.el, nw = m.vid ? el.videoWidth : el.naturalWidth, nh = m.vid ? el.videoHeight : el.naturalHeight; if (!nw || !nh) return; var dw = it.w / 100 * SIZE, dh = dw * (nh / nw); try { ctx.drawImage(el, it.x / 100 * SIZE, it.y / 100 * SIZE, dw, dh); } catch (e) {} }); raf = requestAnimationFrame(frame); }
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
      else if (b.type === "image") {
        if (!b.src) continue;
        if (b.src.indexOf("/curation/media/") === 0) { if (!cover) cover = b.src; outBlocks.push(withFr({ type: "image", src: b.src, alt: b.alt || "", caption: b.caption || "", inset: !!b.inset }, b, ["alt", "caption"])); continue; }
        var bl = await blobFromSrc(b.src), ext = extFromType(bl.type), p = "curation/media/" + slug + "/img-" + (++mi) + "." + ext;
        files.push({ path: p, base64: await blobToBase64(bl) }); if (!cover) cover = "/" + p;
        outBlocks.push(withFr({ type: "image", src: "/" + p, alt: b.alt || "", caption: b.caption || "", inset: !!b.inset }, b, ["alt", "caption"]));
      } else if (b.type === "video") {
        if (!b.src) continue;
        if (/youtu\.?be/.test(b.src)) { outBlocks.push(withFr({ type: "video", src: b.src, caption: b.caption || "" }, b, ["caption"])); }
        else if (b.src.indexOf("/curation/media/") === 0) { outBlocks.push(withFr({ type: "video", src: b.src, caption: b.caption || "", loop: true }, b, ["caption"])); }
        else { var bl2 = await blobFromSrc(b.src), ext2 = extFromType(bl2.type), p2 = "curation/media/" + slug + "/vid-" + (++mi) + "." + ext2; files.push({ path: p2, base64: await blobToBase64(bl2) }); outBlocks.push(withFr({ type: "video", src: "/" + p2, caption: b.caption || "", loop: true }, b, ["caption"])); }
      } else if (b.type === "board") {
        if (!b.items.length) continue; var vid = boardHasVideo(b);
        log("Rendering board (" + (vid ? "WebM" : "PNG") + ")…");
        var bb = vid ? await boardToWebMBlob(b) : await boardToPNGBlob(b);
        var ext3 = vid ? "webm" : "png", p3 = "curation/media/" + slug + "/board-" + (++mi) + "." + ext3;
        files.push({ path: p3, base64: await blobToBase64(bb) });
        if (vid) outBlocks.push({ type: "video", src: "/" + p3, caption: "", loop: true });
        else { if (!cover) cover = "/" + p3; outBlocks.push({ type: "image", src: "/" + p3, alt: state.title || "", caption: "", inset: false }); }
      }
    }
    var topic = { slug: slug, title: state.title || "Untitled", author: state.author || "", date: date, cover: cover, blocks: outBlocks };
    var frTitle = (state.fr && state.fr.title || "").trim();
    var langs = ["en"];
    if (frTitle || outBlocks.some(function (x) { return x.fr; })) { langs.push("fr"); topic.fr = frTitle ? { title: frTitle } : {}; }
    topic.langs = langs;
    files.push({ path: "curation/topics/" + slug + ".json", text: JSON.stringify(topic, null, 2) });
    log("Updating index…");
    var index = [];
    try { var idx = await gh("/repos/" + REPO + "/contents/curation/topics/index.json?ref=" + BRANCH, {}, token); index = JSON.parse(decodeURIComponent(escape(atob(idx.content.replace(/\n/g, ""))))); } catch (e) { index = []; }
    index = index.filter(function (t) { return t.slug !== slug; });
    var firstText = outBlocks.filter(function (b) { return b.type === "text" && b.html; })[0];
    var desc = firstText ? plain(firstText.html).slice(0, 160) : "";
    var entry = { slug: slug, title: topic.title, author: topic.author, date: date, cover: cover, desc: desc, langs: langs };
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
    publish(token, log).then(function () { btn.disabled = false; btn.textContent = "Publish now"; })
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
    var nb = { id: uid(), type: pb.type };
    if (pb.type === "text") { nb.head = !!pb.head; nb.html = pb.html || ""; }
    else if (pb.type === "image") { nb.src = pb.src || ""; nb.alt = pb.alt || ""; nb.caption = pb.caption || ""; nb.inset = !!pb.inset; }
    else if (pb.type === "video") { nb.src = pb.src || ""; nb.caption = pb.caption || ""; }
    if (pb.fr) nb.fr = pb.fr;
    return nb;
  }
  function editTopic(slug) {
    fetch("/curation/topics/" + slug + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (t) {
      state.title = t.title || "";
      state.fr = { title: (t.fr && t.fr.title) || "" };
      state.author = t.author || "Isaac";
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
    state.title = ""; state.fr = { title: "" }; state.author = "Isaac";
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
      (t.blocks || []).forEach(function (b) { if (b.src && b.src.indexOf("/curation/media/") === 0) mediaPaths.push(b.src.replace(/^\//, "")); });
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

  render();
})();
