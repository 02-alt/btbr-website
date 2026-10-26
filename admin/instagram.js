/* Instagram export — a published topic, re-set as a 4:5 carousel.

   One slide per block, drawn on canvas with the room's own materials: the
   topic's tone as the wall, white museum-label cards, Charter for reading,
   Isaac's hand for notes, the boards' Mac windows as they are. A text block
   is never bare text: it borrows the photo nearest to it (blurred behind the
   card, or as a strip above it). Long text flows onto as many slides as it
   needs. Out: numbered JPEGs (ZIP), the share sheet on a phone, a caption. */
(function () {
  "use strict";

  var W = 1080, H = 1350, M = 90;                 // Instagram's tallest feed post
  var FOOT = 104;                                  // reserved for the folio line
  var SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  var SERIF = 'Charter, "Iowan Old Style", Georgia, serif';
  var HAND = '"My Hand", Charter, Georgia, serif';
  var SITE = "builtoberemembered.com";

  var q = new URLSearchParams(location.search);
  var opts = { slug: q.get("t") || "djh20", textStyle: q.get("style") || "blur", video: q.get("video") || "subtitle", folio: q.get("folio") !== "0" };
  var topic = null, slides = [], skip = {}, picks = {}, pool = [];
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- loading ---------- */
  var imgs = {};
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (!imgs[src]) imgs[src] = new Promise(function (res) {
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src;
    });
    return imgs[src];
  }
  function ytId(u) { var m = String(u || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : ""; }
  function ytInfo(id) {
    return fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id))
      .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
  }
  function ytThumb(id) {
    return loadImg("https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg").then(function (im) {
      return im && im.naturalWidth > 200 ? im : loadImg("https://i.ytimg.com/vi/" + id + "/hqdefault.jpg");
    });
  }

  // YouTube keeps three real frames of every video (at ¼, ½ and ¾ of its length), 1280×720 when it can
  function ytFrames(id) {
    return Promise.all([1, 2, 3].map(function (n) {
      return loadImg("https://i.ytimg.com/vi/" + id + "/maxres" + n + ".jpg").then(function (im) {
        return im && im.naturalWidth > 200 ? im : loadImg("https://i.ytimg.com/vi/" + id + "/hq" + n + ".jpg");
      });
    })).then(function (a) { return a.filter(Boolean); });
  }
  // a YouTube still by URL, falling back to its 480px twin when the HD one doesn't exist
  function ytImg(url) {
    return loadImg(url).then(function (im) {
      return im && im.naturalWidth > 200 ? im : loadImg(url.replace("maxresdefault", "hqdefault").replace(/maxres(\d)\.jpg/, "hq$1.jpg"));
    });
  }
  function ytStills(id) {
    var b = "https://i.ytimg.com/vi/" + id + "/";
    return { srcs: [b + "maxresdefault.jpg", b + "maxres1.jpg", b + "maxres2.jpg", b + "maxres3.jpg"], labels: ["Cover", "\u00BC", "\u00BD", "\u00BE"] };
  }
  // a video file of your own: ten stills taken across it (5% … 95%)
  var fileStills = {};
  function videoStills(src) {
    if (fileStills[src]) return fileStills[src];
    return (fileStills[src] = new Promise(function (res) {
      var v = document.createElement("video"), out = [], k = 0;
      v.crossOrigin = "anonymous"; v.muted = true; v.preload = "auto"; v.src = src;
      function next() {
        if (k >= 10) { res(out); return; }
        v.currentTime = v.duration * (0.05 + 0.1 * k);
      }
      v.addEventListener("loadedmetadata", next);
      v.addEventListener("seeked", function () {
        var c = document.createElement("canvas"); c.width = Math.min(1280, v.videoWidth); c.height = Math.round(c.width * v.videoHeight / v.videoWidth);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        try { out.push(c.toDataURL("image/jpeg", 0.9)); } catch (e) {}
        k++; next();
      });
      v.addEventListener("error", function () { res(out); });
    }));
  }
  // the picture without its black bars, top and bottom (letterbox) and either side (pillarbox)
  function unbar(im) {
    var w = 96, h = Math.max(1, Math.round(w * im.naturalHeight / im.naturalWidth)), c = document.createElement("canvas"); c.width = w; c.height = h;
    var t = c.getContext("2d"); t.drawImage(im, 0, 0, w, h);
    var d = t.getImageData(0, 0, w, h).data;
    function lit(x, y) { var i = (y * w + x) * 4; return d[i] + d[i + 1] + d[i + 2] > 60; }
    function darkRow(y, a, b) { for (var x = a; x <= b; x++) if (lit(x, y)) return false; return true; }
    function darkCol(x, a, b) { for (var y = a; y <= b; y++) if (lit(x, y)) return false; return true; }
    var y0 = 0, y1 = h - 1, x0 = 0, x1 = w - 1;
    while (y0 < h / 3 && darkRow(y0, 0, w - 1)) y0++;
    while (y1 > h * 2 / 3 && darkRow(y1, 0, w - 1)) y1--;
    while (x0 < w / 3 && darkCol(x0, y0, y1)) x0++;
    while (x1 > w * 2 / 3 && darkCol(x1, y0, y1)) x1--;
    if (y0) y0++; if (y1 < h - 1) y1--; if (x0) x0++; if (x1 < w - 1) x1--;   // a pixel more, past the soft edge
    var kx = im.naturalWidth / w, ky = im.naturalHeight / h;
    return { x: x0 * kx, y: y0 * ky, w: (x1 - x0 + 1) * kx, h: (y1 - y0 + 1) * ky };
  }


  /* ---------- text ---------- */
  var mctx = document.createElement("canvas").getContext("2d");
  function font(size, family, italic, weight) { return (italic ? "italic " : "") + (weight || 400) + " " + size + "px " + family; }

  // rich text → words, each remembering whether it's italic; <br> / </p> → paragraph breaks
  function runsFromHTML(html) {
    var doc = new DOMParser().parseFromString("<div>" + String(html || "") + "</div>", "text/html");
    var words = [];
    (function walk(n, it) {
      n.childNodes.forEach(function (c) {
        if (c.nodeType === 3) {
          c.nodeValue.replace(/ /g, " ").split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { words.push({ sp: true }); return; }
            var prev = words[words.length - 1];
            if (prev && !prev.sp && !prev.br) prev.parts.push({ t: w, i: it });   // "<em>Ex Machina</em>," stays one word
            else words.push({ parts: [{ t: w, i: it }] });
          });
        } else if (c.nodeType === 1) {
          var tag = c.tagName.toLowerCase();
          if (tag === "br") { words.push({ br: true }); return; }
          walk(c, it || tag === "em" || tag === "i");
          if (tag === "p" || tag === "div") words.push({ br: true, para: true });
        }
      });
    })(doc.body.firstChild, false);
    var out = [];
    words.filter(function (w) { return !w.sp; }).forEach(function (w) {
      var prev = out[out.length - 1];
      if (w.br && (!prev || prev.br)) { if (prev) prev.para = true; return; }   // a run of breaks → one paragraph gap
      out.push(w.br ? { br: true, para: !!w.para } : w);
    });
    while (out.length && out[out.length - 1].br) out.pop();
    return out;
  }
  function plainRuns(text) {
    var out = [];
    String(text || "").split("\n").forEach(function (ln, i) {
      if (i) out.push({ br: true });
      ln.split(/\s+/).forEach(function (w) { if (w) out.push({ parts: [{ t: w, i: false }] }); });
    });
    return out;
  }
  function wordW(w, size, family) {
    return w.parts.reduce(function (s, p) { mctx.font = font(size, family, p.i); return s + mctx.measureText(p.t).width; }, 0);
  }
  // greedy wrap; a lone last word pulls its neighbour down with it (no widows)
  function wrap(words, size, family, maxW) {
    mctx.font = font(size, family); var sp = mctx.measureText(" ").width;
    var lines = [], cur = [], cw = 0;
    words.forEach(function (w) {
      if (w.br) { lines.push(cur); cur = []; cur.gap = !!w.para; cw = 0; return; }
      var ww = wordW(w, size, family);
      if (cur.length && cw + sp + ww > maxW) { lines.push(cur); cur = []; cw = 0; }
      cw += (cur.length ? sp : 0) + ww; cur.push(w);
    });
    if (cur.length) lines.push(cur);
    var n = lines.length;
    if (n > 1 && lines[n - 1].length === 1 && lines[n - 2].length > 3 && !lines[n - 1].gap) lines[n - 1].unshift(lines[n - 2].pop());
    return lines;
  }
  var GAP = 0.6;                                     // a paragraph's breath, in lines
  function linesH(lines, lh) {
    return lines.reduce(function (h, ln, i) { return h + lh + (i && ln.gap ? GAP * lh : 0); }, 0);
  }
  function drawLines(ctx, lines, x, y, size, lh, family, color) {
    ctx.fillStyle = color; ctx.textBaseline = "alphabetic";
    mctx.font = font(size, family); var sp = mctx.measureText(" ").width;
    var top = y;
    lines.forEach(function (ln, li) {
      if (li && ln.gap) top += GAP * lh;
      var cx = x, by = top + size; top += lh;
      ln.forEach(function (w) {
        w.parts.forEach(function (p) { ctx.font = font(size, family, p.i); ctx.fillText(p.t, cx, by); cx += ctx.measureText(p.t).width; });
        cx += sp;
      });
    });
  }

  /* ---------- drawing helpers ---------- */
  function card(ctx, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = "rgba(40,30,40,0.13)"; ctx.shadowBlur = 44; ctx.shadowOffsetY = 22;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
    ctx.shadowColor = "rgba(40,30,40,0.06)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1; ctx.fill();
    ctx.restore();
  }
  function cover(ctx, im, x, y, w, h, r, sr) {       // object-fit: cover, rounded; sr = the part of the image to use
    sr = sr || { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
    var k = Math.max(w / sr.w, h / sr.h), sw = w / k, sh = h / k;
    ctx.save(); if (r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip(); }
    ctx.drawImage(im, sr.x + (sr.w - sw) / 2, sr.y + (sr.h - sh) / 2, sw, sh, x, y, w, h);
    ctx.restore();
  }
  // a board's window PNG is the Preview window baked at 2× around the photo (MacWin: 37pt title bar,
  // 3pt sides, the long side of the photo 720pt) — this is the photo alone, for layouts that go edge to edge
  function bare(im) {
    if (!/board-\d+-\d+\.png($|\?)/i.test(im.src)) return null;
    var k = Math.max(im.naturalWidth / 726, im.naturalHeight / 760), e = 5 * k;
    return { x: 3 * k + e, y: 37 * k + e, w: im.naturalWidth - 6 * k - 2 * e, h: im.naturalHeight - 40 * k - 2 * e };
  }
  // what's already on the slide, blurred, faded in along y by stops [[y, 0..1], …]
  function focusPull(ctx, stops) {
    var b = document.createElement("canvas"); b.width = W; b.height = H;
    var bc = b.getContext("2d");
    if (typeof bc.filter === "string") { bc.filter = "blur(14px)"; bc.drawImage(ctx.canvas, 0, 0); bc.filter = "none"; }
    else { var sm = document.createElement("canvas"); sm.width = W / 12; sm.height = H / 12; sm.getContext("2d").drawImage(ctx.canvas, 0, 0, sm.width, sm.height); bc.imageSmoothingQuality = "high"; bc.drawImage(sm, 0, 0, W, H); }
    var m = bc.createLinearGradient(0, 0, 0, H);
    stops.forEach(function (st) { m.addColorStop(Math.max(0, Math.min(1, st[0] / H)), "rgba(0,0,0," + st[1] + ")"); });
    bc.globalCompositeOperation = "destination-in"; bc.fillStyle = m; bc.fillRect(0, 0, W, H);
    ctx.drawImage(b, 0, 0);
  }
  function shadowed(ctx, fn, a, blur, dy) {
    ctx.save(); ctx.shadowColor = "rgba(20,15,20," + (a || 0.22) + ")"; ctx.shadowBlur = blur || 50; ctx.shadowOffsetY = dy || 24; fn(); ctx.restore();
  }
  function contain(ctx, im, x, y, w, h) {             // a window (or photo) whole, centred in the box, trimmed to its own edges
    var b = /\.png($|\?)/i.test(im.src) ? alphaBox(im) : { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
    var k = Math.min(w / b.w, h / b.h), dw = b.w * k, dh = b.h * k;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, b.x, b.y, b.w, b.h, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  function blurred(ctx, im, tone) {                  // the photo, out of focus, washed in the topic's tone
    var tmp = document.createElement("canvas"), tw = 54, th = Math.round(tw * H / W);
    tmp.width = tw; tmp.height = th;
    var t = tmp.getContext("2d"); t.imageSmoothingQuality = "high"; cover(t, im, 0, 0, tw, th);
    ctx.save(); ctx.imageSmoothingQuality = "high";
    if (typeof ctx.filter === "string") ctx.filter = "blur(26px) saturate(0.9)";
    ctx.drawImage(tmp, -60, -60, W + 120, H + 120);
    ctx.restore();
    ctx.fillStyle = hexA(tone, 0.42); ctx.fillRect(0, 0, W, H);
  }
  function hexA(hex, a) {
    var m = String(hex).match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    return m ? "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + "," + a + ")" : hex;
  }
  function isDark(hex) {
    var m = String(hex || "").match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i); if (!m) return false;
    return (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255 < 0.45;
  }
  function onWall(a) { return isDark(topic.tone) ? "rgba(255,255,255," + a + ")" : "rgba(17,17,17," + a + ")"; }
  function wall(ctx) { ctx.fillStyle = topic.tone || "#e6e4e6"; ctx.fillRect(0, 0, W, H); }
  function folio(ctx, i, n, light) {                // just the page count, quiet, bottom right
    if (!opts.folio) return;
    ctx.font = font(20, SANS); ctx.fillStyle = light ? "rgba(255,255,255,0.6)" : onWall(0.38); ctx.textBaseline = "alphabetic"; ctx.textAlign = "right";
    ctx.fillText((i + 1) + " / " + n, W - 56, H - 48);
    ctx.textAlign = "left";
  }

  function plain(html) { return html ? new DOMParser().parseFromString(String(html), "text/html").body.textContent.replace(/\u00a0/g, " ").trim() : ""; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function alphaBox(im) {                            // where a board's windows actually are
    var s = 256, c = document.createElement("canvas"); c.width = s; c.height = s;
    var t = c.getContext("2d"); t.drawImage(im, 0, 0, s, s);
    var d = t.getImageData(0, 0, s, s).data, x0 = s, y0 = s, x1 = 0, y1 = 0;
    for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) if (d[(y * s + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 <= x0) return { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
    var kx = im.naturalWidth / s, ky = im.naturalHeight / s;
    return { x: x0 * kx, y: y0 * ky, w: (x1 - x0 + 1) * kx, h: (y1 - y0 + 1) * ky };
  }

  /* ---------- the plan: blocks → slides ---------- */
  // the photos of the image block nearest to block i (after it first): a board gives all its windows
  function nearestPhotos(blocks, i) {
    function photosOf(b) {
      if (!b || b.type !== "image") return null;
      return b.board && b.board.items && b.board.items.length ? b.board.items.map(function (it) { return it.src; }) : [b.src];
    }
    for (var d = 1; d < blocks.length; d++) {
      var p = photosOf(blocks[i + d]) || photosOf(blocks[i - d]); if (p) return p;
    }
    return [topic.cover];
  }
  // every photo in the topic, in reading order: what the ‹ › under a text slide steps through
  function noteOf(src) {
    var n = "";
    (topic.blocks || []).forEach(function (b) {
      (b.board && b.board.items || []).forEach(function (it) { if (it.src === src && it.note) n = it.note; });
    });
    return n.trim();
  }
  function photoPool() {
    var out = [];
    (topic.blocks || []).forEach(function (b) {
      if (b.type !== "image") return;
      (b.board && b.board.items && b.board.items.length ? b.board.items.map(function (it) { return it.src; }) : [b.src])
        .forEach(function (src) { if (src && out.indexOf(src) < 0) out.push(src); });
    });
    if (topic.cover && out.indexOf(topic.cover) < 0) out.push(topic.cover);
    return out;
  }
  var TEXT = { size: 42, min: 36, lh: 1.5, padX: 64, padY: 58 };
  var STYLES = {
    blur:     { family: SERIF, size: 42, min: 36, lh: 1.5, w: W - 2 * M - 128, maxH: 960 },
    strip:    { family: SERIF, size: 42, min: 36, lh: 1.5, w: W - 2 * M - 128, maxH: 640 },
    cinema:   { family: SANS, size: 46, min: 40, lh: 1.24, w: W - 2 * 76, maxH: 600 },
    half:     { family: SERIF, size: 38, min: 34, lh: 1.45, w: W - 2 * 84, maxH: 560 },
    polaroid: { family: SERIF, size: 38, min: 34, lh: 1.48, w: W - 2 * M - 128, maxH: 520 }
  };
  function textPages(words, name) {
    var st = STYLES[name] || STYLES.blur, innerW = st.w, maxH = st.maxH, family = st.family;
    for (var s = st.size; s >= st.min; s -= 2) {
      var lines = wrap(words, s, family, innerW);
      if (linesH(lines, s * st.lh) <= maxH) return [{ lines: lines, size: s }];
    }
    var s2 = st.size - 2, lh = s2 * st.lh, all = wrap(words, s2, family, innerW);
    var n = Math.ceil(linesH(all, lh) / maxH), target = linesH(all, lh) / n, pages = [], cur = [];
    all.forEach(function (ln) {                      // balanced pages, not a stub at the end; a paragraph gap is the best place to turn
      var h = linesH(cur.concat([ln]), lh), more = pages.length < n - 1;
      if (cur.length && (h > maxH || (more && ln.gap && linesH(cur, lh) >= target * 0.7) || (more && h > target * 1.08))) {
        pages.push({ lines: cur, size: s2 }); cur = [];
      }
      cur.push(ln);
    });
    if (cur.length) pages.push({ lines: cur, size: s2 });
    return pages;
  }
  function plan(o) {
    o = o || opts;
    var out = [{ kind: "cover" }], blocks = topic.blocks || [];
    var tailFrom = blocks.length;                    // trailing hand/sign close the carousel, after the sources
    while (tailFrom > 0 && /^(hand|sign)$/.test(blocks[tailFrom - 1].type)) tailFrom--;
    blocks.forEach(function (b, i) {
      if (i === tailFrom && topic.inspiration) out.push({ kind: "sources" });
      if (b.type === "text") {
        var words = runsFromHTML(b.html); if (!words.length) return;
        if (b.head) { out.push({ kind: "chapter", words: words }); return; }
        var pages = textPages(words, o.textStyle), photos = nearestPhotos(blocks, i);
        pages.forEach(function (p, k) {
          var key = i + ":" + k, auto = photos[k % photos.length];
          out.push({ kind: "text", style: o.textStyle, key: key, auto: auto, photo: picks[key] || auto, lines: p.lines, size: p.size, part: pages.length > 1 ? (k + 1) + "/" + pages.length : "" });
        });
      } else if (b.type === "image" && b.src) {
        out.push(b.board ? { kind: "board", src: b.src } : { kind: "photo", src: b.src, caption: b.caption });
      } else if (b.type === "video" && b.src) {
        var vid = ytId(b.src), st = vid ? ytStills(vid) : { srcs: [], labels: [] }, vkey = "video:" + i;
        out.push({ kind: "video", video: o.video, src: b.src, caption: b.caption, wtitle: b.wtitle, key: vkey,
          stills: st.srcs, labels: st.labels, auto: st.srcs[2] || "", photo: picks[vkey] || st.srcs[2] || "" });
      } else if (b.type === "quote" && b.text) {
        out.push({ kind: "quote", text: b.text, cite: b.cite });
      } else if ((b.type === "hand" || b.type === "sign") && b.text) {
        var last = photoPool().filter(function (p) { return p !== topic.cover; }).pop() || topic.cover;
        out.push({ kind: b.type, text: b.text, key: "note:" + i, auto: last, photo: picks["note:" + i] || last });
      }
    });
    if (tailFrom === blocks.length && topic.inspiration) out.push({ kind: "sources" });
    return out;
  }

  /* ---------- the slides ---------- */
  var draw = {
    cover: function (ctx, s) {
      wall(ctx);
      return loadImg(topic.cover).then(function (im) {
        // the museum label, overlapping the photo's foot: "Author, / Title, desc"
        var desc = String(topic.desc || "").trim().replace(/[.,;:]+$/, "");
        var words = plainRuns(topic.author + ",").concat([{ br: true }], plainRuns(topic.title + (desc ? ", " + desc : "")));
        var cw = 680, size = 50, lines = wrap(words, size, SANS, cw - 84), lh = size * 1.13, ch = 44 + linesH(lines, lh) + 96;
        var k = im ? Math.min((W - 2 * M) / im.naturalWidth, 800 / im.naturalHeight) : 0, w = im ? im.naturalWidth * k : 0, h = im ? im.naturalHeight * k : 0;
        var y = Math.max(70, (H - FOOT - (h + ch - 80)) / 2), bottom = y;
        if (im) {
          ctx.save(); ctx.shadowColor = "rgba(40,30,40,0.18)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
          ctx.fillStyle = "#000"; ctx.beginPath(); ctx.roundRect(M, y, w, h, 6); ctx.fill(); ctx.restore();
          cover(ctx, im, M, y, w, h, 6); bottom = y + h;
        }
        var cy = Math.min(bottom - 80, H - FOOT - ch - 40);
        card(ctx, M, cy, cw, ch);
        drawLines(ctx, lines, M + 42, cy + 34, size, lh, SANS, "#111");
        ctx.font = font(20, SANS); ctx.fillStyle = "#111"; ctx.textAlign = "right";
        if (topic.no) ctx.fillText("No. " + pad(topic.no), M + cw - 40, cy + ch - 36);
        ctx.textAlign = "left";
        if (topic.song && topic.song.title) {
          ctx.font = font(24, SANS); ctx.fillStyle = "rgba(17,17,17,0.55)";
          ctx.fillText("♪  " + topic.song.title + (topic.song.artist ? " · " + topic.song.artist : ""), M + 42, cy + ch - 36);
        }
      });
    },

    text: function (ctx, s) {
      return loadImg(s.photo).then(function (im) {
        s.light = false;
        return (TEXTS[s.style] || TEXTS.blur)(ctx, s, im, STYLES[s.style] || STYLES.blur);
      });
    },


    chapter: function (ctx, s) {
      wall(ctx);
      var lines = wrap(s.words, 72, SERIF, W - 2 * M), lh = 72 * 1.2;
      drawLines(ctx, lines, M, (H - FOOT - linesH(lines, lh)) / 2, 72, lh, SERIF, onWall(1));
      return Promise.resolve();
    },

    board: function (ctx, s) {
      wall(ctx);
      return loadImg(s.src).then(function (im) {
        if (!im) return;
        var b = alphaBox(im), padB = 0.03 * Math.max(b.w, b.h);
        b = { x: b.x - padB, y: b.y - padB, w: b.w + 2 * padB, h: b.h + 2 * padB };   // keep the windows' shadows
        var aw = W - 80, ah = H - FOOT - 70, k = Math.min(aw / b.w, ah / b.h);
        var dw = b.w * k, dh = b.h * k;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(im, b.x, b.y, b.w, b.h, (W - dw) / 2, 50 + (ah - dh) / 2, dw, dh);
      });
    },

    photo: function (ctx, s) {
      wall(ctx);
      return loadImg(s.src).then(function (im) {
        if (!im) return;
        var capH = s.caption ? 70 : 0, k = Math.min((W - 2 * M) / im.naturalWidth, (H - FOOT - 140 - capH) / im.naturalHeight);
        var w = im.naturalWidth * k, h = im.naturalHeight * k, x = (W - w) / 2, y = (H - FOOT - h - capH) / 2;
        ctx.save(); ctx.shadowColor = "rgba(40,30,40,0.18)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill(); ctx.restore();
        cover(ctx, im, x, y, w, h, 6);
        if (s.caption) { ctx.font = font(24, SANS); ctx.fillStyle = onWall(0.6); ctx.fillText(plain(s.caption), x, y + h + 46); }
      });
    },

    video: function (ctx, s) {
      var id = ytId(s.src);
      var own = id ? null : videoStills(s.src).then(function (list) {   // a file: its own stills stand in for YouTube's
        if (list.length && !s.stills.length) {
          s.stills = list; s.labels = list.map(function (u, k) { return (5 + 10 * k) + "%"; });
          s.auto = list[4]; if (!picks[s.key]) s.photo = s.auto;
          if (slides[at] === s) photos(s);
        }
        return Promise.all(list.map(loadImg));
      });
      return Promise.all([id ? ytThumb(id) : own.then(function (a) { return a[0]; }), id ? ytInfo(id) : {},
                          id ? ytFrames(id) : own.then(function (a) { return [a[2], a[5], a[8]].filter(Boolean); }),
                          s.photo ? (id ? ytImg(s.photo) : loadImg(s.photo)) : null]).then(function (r) {
        var v = { thumb: r[0], info: r[1] || {}, frames: r[2] || [], pick: r[3] };
        v.title = plain(s.caption) || s.wtitle || v.info.title || "Film";
        v.by = v.info.author_name || "";
        s.light = false;
        return (VIDEOS[s.video] || VIDEOS.subtitle)(ctx, s, v);
      });
    },


    quote: function (ctx, s) {
      wall(ctx);
      var size = 54, words = plainRuns("“" + s.text.trim() + "”"), lines = wrap(words, size, SANS, W - 2 * M - 120), lh = size * 1.16;
      var ch = 70 + linesH(lines, lh) + (s.cite ? 90 : 60), cy = (H - FOOT - ch) / 2;
      card(ctx, M, cy, W - 2 * M, ch);
      drawLines(ctx, lines, M + 60, cy + 52, size, lh, SANS, "#111");
      if (s.cite) { ctx.font = font(26, SANS); ctx.fillStyle = "rgba(17,17,17,0.55)"; ctx.fillText("— " + s.cite, M + 60, cy + ch - 48); }
      return Promise.resolve();
    },

    hand: function (ctx, s) {
      return loadImg(s.photo).then(function (im) {
        s.light = false;
        inkNote(ctx, s, im);
      });
    },


    sign: function (ctx, s) {
      wall(ctx);
      ctx.font = font(120, HAND); ctx.fillStyle = isDark(topic.tone) ? "#f4f1ed" : "#1f1d20"; ctx.textAlign = "right";
      ctx.fillText(s.text, W - M - 20, (H - FOOT) / 2 + 40);
      ctx.textAlign = "left";
      return Promise.resolve();
    },

    // the closing credits card, as in the room
    sources: function (ctx) {
      wall(ctx);
      var items = String(topic.inspiration || "").split(/\n+/).map(function (l) { return l.trim(); })
        .filter(function (l) { return l && !/^(inspirations?|sources?)\s*:?$/i.test(l); })
        .map(function (l) { return /^https?:\/\//.test(l) ? l.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : l; });
      var cw = W - 2 * M, size = 30, lh = size * 1.4, innerW = cw - 2 * 56 - 70;
      var rows = items.map(function (t) { return wrap(plainRuns(t), size, SANS, innerW); });
      var ch = 52 + 60 + rows.reduce(function (s, r) { return s + r.length * lh + 34; }, 0) + 36, cy = Math.max(60, (H - FOOT - ch) / 2);
      card(ctx, M, cy, cw, ch);
      ctx.font = font(44, SANS); ctx.fillStyle = "#111"; ctx.fillText("Sources", M + 56, cy + 52 + 36);
      var y = cy + 52 + 60 + 20;
      rows.forEach(function (lines, i) {
        ctx.fillStyle = "rgba(0,0,0,0.08)"; ctx.fillRect(M + 56, y - 2, cw - 112, 2);
        ctx.font = font(size, SANS); ctx.fillStyle = "#8a888b"; ctx.fillText(pad(i + 1), M + 56, y + 14 + size);
        drawLines(ctx, lines, M + 56 + 70, y + 14, size, lh, SANS, "#111");
        y += lines.length * lh + 34;
      });
      return Promise.resolve();
    }
  };

  /* ---------- text slides, one per style ---------- */
  function part(ctx, s, x, y, light) {
    if (!s.part) return;
    ctx.font = font(18, SANS); ctx.fillStyle = light ? "rgba(255,255,255,0.55)" : "rgba(17,17,17,0.4)";
    ctx.textAlign = "right"; ctx.fillText(s.part, x, y); ctx.textAlign = "left";
  }
  function noteLines(ctx, text, size, family, maxW, maxLines) {
    var lines = wrap(plainRuns(text), size, family, maxW);
    return lines.slice(0, maxLines);
  }
  var TEXTS = {
    // the label card over the nearest photo, out of focus
    blur: function (ctx, s, im, st) {
      var lh = s.size * st.lh, cw = W - 2 * M, ch = linesH(s.lines, lh) + 2 * TEXT.padY;
      if (im) blurred(ctx, im, topic.tone || "#e6e4e6"); else wall(ctx);
      var cy = (H - FOOT - ch) / 2 + 10;
      card(ctx, M, cy, cw, ch);
      drawLines(ctx, s.lines, M + TEXT.padX, cy + TEXT.padY - s.size * 0.18, s.size, lh, st.family, "#222");
      part(ctx, s, M + cw - 26, cy + ch - 20);
    },
    // the photo's window above the label card
    strip: function (ctx, s, im, st) {
      var lh = s.size * st.lh, cw = W - 2 * M, ch = linesH(s.lines, lh) + 2 * TEXT.padY, cy;
      wall(ctx);
      var gap = 28, stripH = Math.min(520, H - FOOT - 80 - ch - gap - 70);
      var top = Math.max(70, (H - FOOT - (stripH + gap + ch)) / 2);
      if (im && stripH >= 200) { contain(ctx, im, M, top, cw, stripH); cy = top + stripH + gap; }
      else cy = (H - FOOT - ch) / 2;
      card(ctx, M, cy, cw, ch);
      drawLines(ctx, s.lines, M + TEXT.padX, cy + TEXT.padY - s.size * 0.18, s.size, lh, st.family, "#222");
      part(ctx, s, M + cw - 26, cy + ch - 20);
    },
    // film still: the photo edge to edge, the words set over its darkened foot like a subtitle card
    cinema: function (ctx, s, im, st) {
      var lh = s.size * st.lh, th = linesH(s.lines, lh);
      ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H);
      var top = H - 120 - th;
      if (im) {
        cover(ctx, im, 0, 0, W, H, 0, bare(im));
        focusPull(ctx, [[top - 320, 0], [top - 30, 1]]);   // a soft focus pull behind the words
      }
      var g = ctx.createLinearGradient(0, top - 380, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.45, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0.86)");
      ctx.fillStyle = g; ctx.fillRect(0, top - 380, W, H - top + 380);
      drawLines(ctx, s.lines, 76, top, s.size, lh, st.family, "#fff");
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(76, top - 46, 44, 3);
      part(ctx, s, W - 76, top - 36, true);
      s.light = true;
    },
    // half page: the photo bleeds off the top, the words sit on paper below, its note as the caption
    half: function (ctx, s, im, st) {
      var lh = s.size * st.lh, th = linesH(s.lines, lh), note = noteOf(s.photo);
      var textTop = H - FOOT - th - (note ? 64 : 20), split = Math.min(textTop - 70, 620);
      ctx.fillStyle = "#fbfaf8"; ctx.fillRect(0, 0, W, H);
      if (im) cover(ctx, im, 0, 0, W, split, 0, bare(im));
      var y = split + 34;
      if (note) { ctx.font = font(20, SANS); ctx.fillStyle = "rgba(17,17,17,0.45)"; ctx.fillText(note, 84, y + 20); y += 50; }
      drawLines(ctx, s.lines, 84, y + (H - FOOT - y - th) / 2 - s.size * 0.2, s.size, lh, st.family, "#222");
      part(ctx, s, W - 84, H - FOOT + 2);
      s.light = false;
    },
    // polaroid: a print taped over the label card, its note written under it in Isaac's hand
    polaroid: function (ctx, s, im, st) {
      var lh = s.size * st.lh, cw = W - 2 * M, ch = linesH(s.lines, lh) + 2 * TEXT.padY;
      wall(ctx);
      var cy = Math.max(600, H - FOOT - ch - 30);
      card(ctx, M, cy, cw, ch);
      drawLines(ctx, s.lines, M + TEXT.padX, cy + TEXT.padY - s.size * 0.18, s.size, lh, st.family, "#222");
      part(ctx, s, M + cw - 26, cy + ch - 20);
      if (!im) return;
      var b = bare(im) || { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
      var pw = 460, fr = 22, bottom = 96, ph = pw, PW = pw + 2 * fr, PH = ph + fr + bottom;
      var px = W - M - PW + 20, py = Math.max(40, cy - PH + 34);   // pinned to the card's top edge, clear of the words
      ctx.save(); ctx.translate(px + PW / 2, py + PH / 2); ctx.rotate(0.045); ctx.translate(-PW / 2, -PH / 2);
      shadowed(ctx, function () { ctx.fillStyle = "#fdfcf9"; ctx.fillRect(0, 0, PW, PH); }, 0.24, 36, 16);
      cover(ctx, im, fr, fr, pw, ph, 0, b);
      var note = noteOf(s.photo) || topic.title;
      ctx.font = font(30, HAND); ctx.fillStyle = "#1f1d20";
      noteLines(ctx, note, 30, HAND, pw, 2).forEach(function (ln, k) {
        ctx.fillText(ln.map(function (w) { return w.parts.map(function (p) { return p.t; }).join(""); }).join(" "), fr + 4, ph + fr + 40 + k * 34);
      });
      ctx.fillStyle = "rgba(235,228,205,0.82)"; ctx.translate(PW / 2, -8); ctx.rotate(-0.06); ctx.fillRect(-70, -18, 140, 40);   // tape
      ctx.restore();
    }
  };

  /* ---------- the handwritten note ---------- */
  // the note in Isaac's hand, as big as fits the box
  function fitHand(text, maxW, maxH, start, min, k) {
    k = k || 1.32;
    for (var size = start; size >= min; size -= 2) {
      var lines = wrap(plainRuns(text), size, HAND, maxW);
      if (linesH(lines, size * k) <= maxH || size === min) return { lines: lines, size: size, lh: size * k, h: linesH(lines, size * k) };
    }
  }
  function bleed(ctx, im) { ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H); cover(ctx, im, 0, 0, W, H, 0, bare(im)); }
  // written straight onto the photo in white, the picture softened and dimmed behind the words
  function inkNote(ctx, s, im) {
    var f = fitHand(s.text, W - 2 * 96, 760, 92, 60, 1.25), y = (H - f.h) / 2 - 20;
    if (im) {
      bleed(ctx, im);
      focusPull(ctx, [[y - 300, 0], [y, 1], [y + f.h, 1], [y + f.h + 300, 0]]);
      ctx.fillStyle = "rgba(0,0,0,0.38)"; ctx.fillRect(0, 0, W, H);
      s.light = true;
    } else wall(ctx);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 18;
    drawLines(ctx, f.lines, 96, y, f.size, f.lh, HAND, im ? "#fbf8f2" : onWall(1));
    ctx.restore();
  }

  /* ---------- the video slide ---------- */
  function fitText(ctx, t, size, family, maxW, italic, weight) {
    ctx.font = font(size, family, italic, weight);
    while (size > 14 && ctx.measureText(t).width > maxW) { size -= 1; ctx.font = font(size, family, italic, weight); }
    return size;
  }
  var VIDEOS = {
    // subtitle: one frame edge to edge, the title set as a film subtitle across its foot
    subtitle: function (ctx, s, v) {
      var im = v.pick || v.frames[1] || v.thumb; s.light = true;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      if (im) cover(ctx, im, 0, 0, W, H, 0, bare(im) || unbar(im));
      var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      fitText(ctx, v.title, 44, SANS, W - 160, false, 500);
      ctx.lineJoin = "round"; ctx.lineWidth = 7; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(v.title, W / 2, H - 200);
      ctx.fillStyle = "#fff"; ctx.fillText(v.title, W / 2, H - 200);
      ctx.font = font(24, SANS); ctx.lineWidth = 5; var sub = (v.by ? v.by + " \u00B7 " : "") + "link in bio";
      ctx.strokeText(sub, W / 2, H - 150); ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fillText(sub, W / 2, H - 150);
      ctx.textAlign = "left";
    },
    // bands: the three frames stacked edge to edge, the title over the last one
    bands: function (ctx, s, v) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); s.light = true;
      var fr = (v.frames.length ? v.frames : [v.thumb]).slice();
      if (v.pick && s.photo !== s.auto) fr[Math.min(1, fr.length - 1)] = v.pick;
      var gap = 8, bh = (H - gap * (fr.length - 1)) / fr.length;
      fr.forEach(function (im, k) { if (im) cover(ctx, im, 0, k * (bh + gap), W, bh, 0, bare(im) || unbar(im)); });
      var g = ctx.createLinearGradient(0, H - 380, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = g; ctx.fillRect(0, H - 380, W, 380);
      fitText(ctx, v.title, 44, SANS, W - 152, false, 500); ctx.fillStyle = "#fff"; ctx.fillText(v.title, 76, H - 140);
      ctx.font = font(24, SANS); ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.fillText("\u25B6  " + (v.by ? v.by + " \u00B7 " : "") + "link in bio", 76, H - 96);
    }
  };

  /* ---------- caption ---------- */
  function caption() {
    var first = (topic.blocks || []).filter(function (b) { return b.type === "text" && !b.head; })[0];
    var lead = first ? plain(String(first.html).replace(/<\/p>|<br\s*\/?>/gi, "\n")).replace(/\n{3,}/g, "\n\n") : "";
    var parts = [topic.title + (topic.desc ? " — " + topic.desc : ""), lead];
    parts.push("The full topic, with the film and every source: link in bio → " + SITE + "/curation/" + topic.slug);
    if (topic.song && topic.song.title) parts.push("♪ " + topic.song.title + (topic.song.artist ? " — " + topic.song.artist : ""));
    return parts.filter(Boolean).join("\n\n").slice(0, 2200);
  }

  /* ---------- render: the post, as it will look on a phone ---------- */
  var token = 0, at = 0;
  function render() {
    var my = ++token;
    slides = plan(); pool = photoPool();
    var track = $("track"); track.innerHTML = "";
    slides.forEach(function (s, i) {
      var c = document.createElement("canvas"); c.width = W; c.height = H; s.canvas = c;
      var fig = document.createElement("figure"); fig.className = "slide" + (skip[i] ? " is-off" : "");
      fig.setAttribute("aria-label", "Slide " + (i + 1) + ", " + s.kind);
      var off = document.createElement("span"); off.className = "off-badge"; off.textContent = "Not in the post";
      fig.appendChild(c); fig.appendChild(off); track.appendChild(fig);
      s.fig = fig;
    });
    at = Math.min(at, slides.length - 1);
    track.scrollLeft = at * track.clientWidth;
    dots(); sync();
    // draw in order (each slide waits on its own images only)
    return slides.reduce(function (p, s, i) {
      return p.then(function () { if (my === token) return paint(s, i); });
    }, Promise.resolve()).then(function () {
      if (my !== token) return;
      if (!$("caption").value) setCaption(caption());
      chips();
      if (q.get("dump")) {                           // dev: hand the slides to a headless browser
        var pre = document.createElement("pre"); pre.id = "dump"; pre.dataset.kinds = slides.map(function (s) { return s.kind; }).join(",");
        pre.textContent = slides.map(function (s) { return s.canvas.toDataURL("image/jpeg", 0.9); }).join("\n");
        document.body.appendChild(pre);
      }
    });
  }
  function paint(s, i) {
    var ctx = s.canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    return (draw[s.kind] || function () { return Promise.resolve(); })(ctx, s).then(function () { folio(ctx, i, slides.length, s.light); })
      .catch(function (e) { console.error(e); });
  }

  // the carousel: pill, dots, and the panel's "This slide" follow the slide in view
  function kept() { return slides.filter(function (s, i) { return !skip[i]; }).length; }
  function dots() {
    var d = $("dots"); d.innerHTML = "";
    slides.forEach(function (s, i) { var e = document.createElement("i"); if (skip[i]) e.className = "off"; d.appendChild(e); });
  }
  function sync() {
    var n = slides.length, s = slides[at]; if (!s) return;
    $("pill").textContent = (at + 1) + "/" + n;
    // like Instagram: no more than seven dots at once, the window following the slide, its edges smaller
    var lo = Math.max(0, Math.min(at - 3, n - 7)), hi = lo + 6;
    [].forEach.call($("dots").children, function (e, i) {
      e.classList.toggle("on", i === at);
      e.hidden = i < lo || i > hi;
      e.classList.toggle("edge", (i === lo && lo > 0) || (i === hi && hi < n - 1));
    });
    $("prev").hidden = at === 0; $("next").hidden = at === n - 1;
    $("slideName").textContent = (at + 1) + " · " + KIND[s.kind];
    $("include").checked = !skip[at];
    var k = kept();
    $("count").textContent = k + " of " + n + " slides" + (k > 20 ? " — Instagram takes 20" : "");
    $("count").classList.toggle("warn", k > 20);
    $("dlZip").textContent = "Download " + k + " images + caption";
    photos(s);
  }
  var KIND = { cover: "Cover", text: "Text", chapter: "Heading", board: "Board", photo: "Photo", video: "Video", quote: "Quote", hand: "Note", sign: "Signature", sources: "Sources" };
  function go(i) {
    var track = $("track"); at = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: at * track.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    sync();
  }

  // This slide · Photo: the topic's photos, the rule's pick marked "Auto"
  function photos(s) {
    var row = $("photoRow"), box = $("photos"), isVideo = s.kind === "video";
    var first = isVideo ? s.stills : [s.auto], labels = isVideo ? s.labels : ["Auto"];
    var list = first.concat(pool.filter(function (p) { return first.indexOf(p) < 0; }));
    row.hidden = !s.auto || list.length < 2;
    $("photoHead").textContent = isVideo ? "Picture" : "Photo";
    if (row.hidden) return;
    box.innerHTML = "";
    function note() {
      $("photoNote").textContent = s.photo === s.auto
        ? (isVideo ? "Automatic \u2014 the frame from halfway through." : "Automatic \u2014 the nearest image block.")
        : (first.indexOf(s.photo) >= 0 ? "A frame from the video." : "A photo from the topic.");
    }
    list.forEach(function (src, k) {
      var b = document.createElement("button"); b.type = "button"; b.className = "ph";
      b.setAttribute("aria-pressed", String(s.photo === src));
      b.setAttribute("aria-label", labels[k] ? (isVideo ? "Frame " + labels[k] : "Automatic photo") : "Photo " + (k + 1));
      var im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.decoding = "async";
      im.src = src; if (/i\.ytimg\.com/.test(src)) im.onerror = function () { im.onerror = null; im.src = src.replace("maxresdefault", "hqdefault").replace(/maxres(\d)/, "hq$1"); };
      b.appendChild(im);
      if (labels[k]) { var t = document.createElement("span"); t.textContent = labels[k] + (src === s.auto && isVideo ? " \u00B7 Auto" : ""); b.appendChild(t); }
      b.addEventListener("click", function () {
        s.photo = src;
        if (src === s.auto) delete picks[s.key]; else picks[s.key] = src;
        [].forEach.call(box.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        note(); paint(s, slides.indexOf(s));
      });
      box.appendChild(b);
    });
    note();
  }


  // the style pickers: each choice drawn with this topic's own first text / video slide
  var chipsFor = "";
  function chips() {
    if (chipsFor === topic.slug) return; chipsFor = topic.slug;
    [["text", "chipsText", "secText", ["blur", "strip", "cinema", "half", "polaroid"], "textStyle"],
     ["video", "chipsVideo", "secVideo", ["subtitle", "bands"], "video"]].forEach(function (g) {
      var kind = g[0], box = $(g[1]), names = g[3], key = g[4];
      var sample = plan(opts).filter(function (s) { return s.kind === kind; })[0];
      $(g[2]).hidden = !sample;
      if (!sample) return;
      box.innerHTML = "";
      names.reduce(function (p, name) {
        var o = { textStyle: opts.textStyle, video: opts.video }; o[key] = name;
        var s = plan(o).filter(function (x) { return x.kind === kind; })[0];
        var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.name = name;
        b.setAttribute("aria-pressed", String(opts[key] === name));
        var c = document.createElement("canvas"); c.width = 216; c.height = 270;
        var lab = document.createElement("span"); lab.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        b.appendChild(c); b.appendChild(lab); box.appendChild(b);
        b.addEventListener("click", function () {
          opts[key] = name;
          [].forEach.call(box.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          render();
        });
        var full = document.createElement("canvas"); full.width = W; full.height = H;
        return p.then(function () {
          return draw[kind](full.getContext("2d"), s).then(function () {
            var t = c.getContext("2d"); t.imageSmoothingQuality = "high"; t.drawImage(full, 0, 0, c.width, c.height);
          });
        });
      }, Promise.resolve());
    });
  }

  function setCaption(v) { $("caption").value = v; capPreview(); }
  function capPreview() {
    var t = $("caption").value.replace(/\s+/g, " ").trim();
    $("capPreview").textContent = t.length > 96 ? t.slice(0, 96).replace(/\s\S*$/, "") + "…" : t;
  }

  /* ---------- export ---------- */
  function blobOf(c) { return new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.95); }); }
  function fileName(i) { return topic.slug + "-" + pad(i + 1) + ".jpg"; }
  function save(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function chosen() {
    var keep = slides.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return !skip[x.i]; });
    return Promise.all(keep.map(function (x, k) {
      return blobOf(x.s.canvas).then(function (b) { return new File([b], topic.slug + "-" + pad(k + 1) + ".jpg", { type: "image/jpeg" }); });
    }));
  }

  // a stored (uncompressed) ZIP — JPEGs don't shrink anyway
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xffffffff; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(entries) {                            // [{ name, data: Uint8Array }]
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    entries.forEach(function (e) {
      var name = enc.encode(e.name), crc = crc32(e.data), len = e.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true);
      lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, len, true); lh.setUint32(22, len, true);
      lh.setUint16(26, name.length, true);
      parts.push(lh.buffer, name, e.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, len, true); ch.setUint32(24, len, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(ch.buffer, name);
      off += 30 + name.length + len;
    });
    var cdSize = central.reduce(function (s, b) { return s + b.byteLength; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: "application/zip" });
  }

  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }
  function wire() {
    $("dlZip").addEventListener("click", function () {
      var btn = this, was = btn.textContent; busy(btn, true, "Packing…");
      chosen().then(function (files) {
        return Promise.all(files.map(function (f) { return f.arrayBuffer().then(function (ab) { return { name: f.name, data: new Uint8Array(ab) }; }); }));
      }).then(function (entries) {
        entries.push({ name: topic.slug + "-caption.txt", data: new TextEncoder().encode($("caption").value) });
        save(zip(entries), topic.slug + "-instagram.zip");
      }).finally(function () { busy(btn, false, was); });
    });
    var share = $("share");
    var probe = new File([new Blob([""], { type: "image/jpeg" })], "x.jpg", { type: "image/jpeg" });
    var canShare = !!(navigator.canShare && navigator.canShare({ files: [probe] }));
    share.hidden = !canShare;
    $("dlZip").classList.toggle("primary", !canShare); $("dlZip").classList.toggle("ghost", canShare);
    share.addEventListener("click", function () {
      var btn = this, was = btn.textContent; busy(btn, true, "Preparing…");
      chosen().then(function (files) {
        if (navigator.clipboard) navigator.clipboard.writeText($("caption").value).catch(function () {});
        return navigator.share({ files: files });
      }).catch(function () {}).finally(function () { busy(btn, false, was); });
    });
    $("copyCap").addEventListener("click", function () {
      var btn = this; navigator.clipboard.writeText($("caption").value).then(function () {
        btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1400);
      });
    });
    $("caption").addEventListener("input", capPreview);
    $("folio").checked = opts.folio;
    $("folio").addEventListener("change", function () { opts.folio = this.checked; render(); });
    $("include").addEventListener("change", function () {
      skip[at] = !this.checked; if (!skip[at]) delete skip[at];
      slides[at].fig.classList.toggle("is-off", !!skip[at]);
      dots(); sync();
    });
    $("dlOne").addEventListener("click", function () { var s = slides[at]; blobOf(s.canvas).then(function (b) { save(b, fileName(at)); }); });
    $("topic").addEventListener("change", function () { location.search = "?t=" + encodeURIComponent(this.value); });
    $("prev").addEventListener("click", function () { go(at - 1); });
    $("next").addEventListener("click", function () { go(at + 1); });
    var track = $("track"), raf = 0;
    track.addEventListener("scroll", function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        var i = Math.round(track.scrollLeft / track.clientWidth);
        if (i !== at && i >= 0 && i < slides.length) { at = i; sync(); }
      });
    }, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") { go(at + 1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { go(at - 1); e.preventDefault(); }
    });
    addEventListener("resize", function () { track.scrollLeft = at * track.clientWidth; });
  }

  function start() {
    Promise.all([
      fetch("/curation/topics/" + encodeURIComponent(opts.slug) + ".json", { cache: "no-store" }).then(function (r) { return r.json(); }),
      fetch("/curation/topics/index.json", { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return []; }),
      document.fonts.load("40px \"My Hand\"").catch(function () {}),
      document.fonts.load("40px Charter").catch(function () {}),
      document.fonts.load("italic 40px Charter").catch(function () {})
    ]).then(function (r) {
      topic = r[0];
      var list = Array.isArray(r[1]) ? r[1] : (r[1].topics || []), sel = $("topic");
      $("title").textContent = topic.title; $("topicName").textContent = topic.title;
      $("avatar").style.backgroundImage = topic.cover ? "url('" + topic.cover + "')" : "";
      (list.length ? list : [{ slug: topic.slug, title: topic.title }]).forEach(function (t) {
        var o = document.createElement("option"); o.value = t.slug; o.textContent = t.title || t.slug; o.selected = t.slug === topic.slug; sel.appendChild(o);
      });
      document.documentElement.style.setProperty("--tone", topic.tone || "#e6e4e6");
      document.body.classList.add("lay-" + (q.get("layout") || "trio"));
      wire(); return render();
    }).catch(function (e) { $("count").textContent = "Couldn’t load “" + opts.slug + "”: " + e.message; });
  }
  start();
})();
