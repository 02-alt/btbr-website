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
  var opts = { slug: q.get("t") || "djh20", textStyle: q.get("style") || "blur", video: q.get("video") || "subtitle", cover: q.get("cover") || "museum", folio: q.get("folio") !== "0" };
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
    var everyPhoto = photoPool(), blocks = topic.blocks || [], nth = 0;
    var hero = /\.(jpe?g|webp)($|\?)/i.test(topic.cover || "") ? topic.cover : (everyPhoto[0] || topic.cover);
    var out = [{ kind: "cover", cover: o.cover || "museum", key: "cover", auto: hero, photo: picks.cover || hero }];
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
          var second = photos.length > 1 ? photos[(k + 1) % photos.length] : everyPhoto[(everyPhoto.indexOf(auto) + 1) % everyPhoto.length];
          out.push({ kind: "text", style: o.textStyle, nth: nth++, photo2: second, key: key, auto: auto, photo: picks[key] || auto, lines: p.lines, size: p.size, part: pages.length > 1 ? (k + 1) + "/" + pages.length : "" });
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
      return loadImg(s.photo).then(function (im) {
        s.light = false;
        return (COVERS[s.cover] || COVERS.museum)(ctx, s, im);
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
    // polaroid: prints taped over the label card, their notes in Isaac's hand — five arrangements,
    // taken in turn, so polaroid slides that follow each other never repeat
    polaroid: function (ctx, s, im, st) {
      var lh = s.size * st.lh, cw = W - 2 * M, ch = linesH(s.lines, lh) + 2 * TEXT.padY, v = (s.nth || 0) % 5;
      var top = v === 2;                                         // the one arrangement with the card on top
      var cy = top ? 84 : Math.max(600, H - FOOT - ch - 30);
      wall(ctx);
      function words() {
        card(ctx, M, cy, cw, ch);
        drawLines(ctx, s.lines, M + TEXT.padX, cy + TEXT.padY - s.size * 0.18, s.size, lh, st.family, "#222");
        part(ctx, s, M + cw - 26, cy + ch - 20);
      }
      if (!im) { words(); return; }
      if (top) {                                                 // 3 · card first, the print hanging from its foot, bottom right
        words();
        var pw3 = Math.min(400, H - FOOT - (cy + ch - 34) - 140);
        print(ctx, im, s.photo, W - M - pw3 - 44 + 20, cy + ch - 34, pw3, pw3, -0.035, "top");
        return;
      }
      if (v === 3) {                                             // 4 · a pair, crossed, the second photo beside the first
        return loadImg(s.photo2).then(function (im2) {
          var pw = 330, PH = pw + 2 * 16 + 69, py = Math.max(36, cy - PH + 34);
          words();
          print(ctx, im, s.photo, M - 10, py + 10, pw, pw, -0.06, "corner");
          if (im2 && im2 !== im) print(ctx, im2, s.photo2, W - M - pw - 32 + 10, py - 4, pw, pw, 0.05, "top");
        });
      }
      if (v === 4) {                                             // 5 · one wide print, nearly straight, taped at both corners
        var ww = 680, wh = Math.round(ww * 0.62), WPH = wh + Math.round(ww * 0.048) + Math.round(ww * 0.21);
        words();
        print(ctx, im, s.photo, (W - ww - 66) / 2, Math.max(40, cy - WPH + 34), ww, wh, -0.012, "both");
        return;
      }
      words();
      var pw1 = 460, PH1 = pw1 + 22 + 96;
      if (v === 1) print(ctx, im, s.photo, M - 20, Math.max(40, cy - PH1 + 34), pw1, pw1, -0.05, "corner");   // 2 · top left, tape across the corner
      else print(ctx, im, s.photo, W - M - pw1 - 44 + 20, Math.max(40, cy - PH1 + 34), pw1, pw1, 0.045, "top"); // 1 · top right
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

  // a print: white border, the photo, its note written under it, a piece of tape
  function print(ctx, im, src, x, y, pw, ph, angle, tapeAt) {
    var b = bare(im) || { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
    var fr = Math.round(pw * 0.048), bottom = Math.round(pw * 0.21), PW = pw + 2 * fr, PH = ph + fr + bottom;
    ctx.save(); ctx.translate(x + PW / 2, y + PH / 2); ctx.rotate(angle); ctx.translate(-PW / 2, -PH / 2);
    shadowed(ctx, function () { ctx.fillStyle = "#fdfcf9"; ctx.fillRect(0, 0, PW, PH); }, 0.24, 36, 16);
    cover(ctx, im, fr, fr, pw, ph, 0, b);
    var size = Math.min(32, Math.max(22, Math.round(pw * 0.065))), note = noteOf(src) || topic.title;
    ctx.font = font(size, HAND); ctx.fillStyle = "#1f1d20";
    noteLines(ctx, note, size, HAND, pw, 2).forEach(function (ln, k) {
      ctx.fillText(ln.map(function (w) { return w.parts.map(function (p) { return p.t; }).join(""); }).join(" "), fr + 4, ph + fr + size * 1.3 + k * size * 1.12);
    });
    ctx.fillStyle = "rgba(235,228,205,0.82)";
    function strip(cx, cy, a) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillRect(-70, -18, 140, 40); ctx.restore(); }
    if (tapeAt === "top") strip(PW / 2, -8, -0.06);
    if (tapeAt === "corner") strip(18, 18, -0.75);
    if (tapeAt === "both") { strip(28, 6, -0.6); strip(PW - 28, 6, 0.6); }
    ctx.restore();
  }

  /* ---------- the cover, ten ways ---------- */
  var COVER_NAMES = ["museum", "repeat", "split", "tunnel", "bleed", "poster", "grid", "board", "magazine", "ink"];
  // film: grain and a warm 70s grade, laid over what's on the slide
  var grainTile = null;
  function filmGrade(ctx, warmth) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = "rgba(214,130,60," + (warmth || 0.5) + ")"; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "multiply";
    var v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(40,20,10,0.55)"); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (!grainTile) {
      grainTile = document.createElement("canvas"); grainTile.width = grainTile.height = 160;
      var g = grainTile.getContext("2d"), d = g.createImageData(160, 160);
      for (var i = 0; i < d.data.length; i += 4) { var n = 110 + Math.random() * 40; d.data[i] = d.data[i + 1] = d.data[i + 2] = n; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
    }
    ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.35; ctx.fillStyle = ctx.createPattern(grainTile, "repeat"); ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  function crop(im) { return bare(im) || unbar(im); }
  function titleLine(ctx, t, x, y, size, color, align, weight, track) {
    ctx.save(); ctx.font = font(size, SANS, false, weight || 700); ctx.fillStyle = color; ctx.textAlign = align || "left";
    if (track && ctx.letterSpacing !== undefined) ctx.letterSpacing = track;
    ctx.fillText(t, x, y); ctx.restore();
  }
  function descOf() { return String(topic.desc || "").trim().replace(/[.,;:]+$/, ""); }
  var CREAM = "#f3e7c9";
  var COVERS = {
    museum: function (ctx, s) {
      wall(ctx);
      return loadImg(s.photo === s.auto ? topic.cover : s.photo).then(function (im) {
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

    // 70s · repeat: the same shot cut into bands, each band slid sideways — the opening titles of a 70s film
    repeat: function (ctx, s, im) {
      ctx.fillStyle = "#0b0907"; ctx.fillRect(0, 0, W, H); s.light = true;
      var n = 5, gap = 10, titleH = 300, bh = (H - titleH - gap * n) / n, b = im ? crop(im) : null;
      var shifts = [-0.16, 0.12, 0, -0.08, 0.18];
      if (im) for (var k = 0; k < n; k++) {
        var zoom = 1.35 + (k % 2) * 0.12, sw = b.w / zoom, sh = sw * bh / W;
        var sx = b.x + (b.w - sw) / 2 + shifts[k] * b.w, sy = b.y + b.h * 0.42 - sh / 2;
        sx = Math.max(b.x, Math.min(b.x + b.w - sw, sx)); sy = Math.max(b.y, Math.min(b.y + b.h - sh, sy));
        ctx.drawImage(im, sx, sy, sw, sh, 0, gap + k * (bh + gap), W, bh);
      }
      filmGrade(ctx, 0.55);
      var ty = H - titleH + 40;
      titleLine(ctx, topic.title.toUpperCase(), W / 2, ty + 110, 120, CREAM, "center", 800, "6px");
      ctx.font = font(30, SERIF, true); ctx.fillStyle = "rgba(243,231,201,0.75)"; ctx.textAlign = "center";
      ctx.fillText("a curation by " + topic.author + (descOf() ? " \u00B7 " + descOf() : ""), W / 2, ty + 170); ctx.textAlign = "left";
    },
    // 70s · split screen: one shot in nine panels at nine framings, the title in the middle one (The Thomas Crown Affair)
    split: function (ctx, s, im) {
      ctx.fillStyle = "#0b0907"; ctx.fillRect(0, 0, W, H); s.light = true;
      var g = 12, cw = (W - 4 * g) / 3, chh = (H - 4 * g) / 3, b = im ? crop(im) : null;
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
        var x = g + c * (cw + g), y = g + r * (chh + g), k = r * 3 + c;
        if (k === 4) continue;
        if (!im) continue;
        var zoom = 1 + (k % 4) * 0.45, sw = Math.min(b.w, b.h * cw / chh) / zoom, sh = sw * chh / cw;
        var fx = [0.3, 0.5, 0.7, 0.4, 0.5, 0.6, 0.35, 0.5, 0.65][k], fy = [0.35, 0.45, 0.4, 0.55, 0.5, 0.45, 0.6, 0.5, 0.55][k];
        var sx = Math.max(b.x, Math.min(b.x + b.w - sw, b.x + b.w * fx - sw / 2)), sy = Math.max(b.y, Math.min(b.y + b.h - sh, b.y + b.h * fy - sh / 2));
        ctx.drawImage(im, sx, sy, sw, sh, x, y, cw, chh);
      }
      filmGrade(ctx, 0.5);
      var mx = g + cw + g, my = g + chh + g;
      ctx.fillStyle = "#0b0907"; ctx.fillRect(mx, my, cw, chh);
      var size = fitText(ctx, topic.title.toUpperCase(), 64, SANS, cw - 40, false, 800);
      titleLine(ctx, topic.title.toUpperCase(), mx + cw / 2, my + chh / 2 + size * 0.2, size, CREAM, "center", 800, "3px");
      ctx.font = font(20, SERIF, true); ctx.fillStyle = "rgba(243,231,201,0.7)"; ctx.textAlign = "center";
      ctx.fillText(topic.author, mx + cw / 2, my + chh / 2 + size * 0.2 + 40); ctx.textAlign = "left";
    },
    // 70s · tunnel: the shot inside itself, frame after frame, falling toward the title
    tunnel: function (ctx, s, im) {
      ctx.fillStyle = "#0b0907"; ctx.fillRect(0, 0, W, H); s.light = true;
      var b = im ? crop(im) : null, x = 0, y = 0, w = W, h = H;
      for (var k = 0; k < 6 && im; k++) {
        cover(ctx, im, x, y, w, h, 0, b);
        ctx.strokeStyle = "#0b0907"; ctx.lineWidth = 14; ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
        var nw = w * 0.74, nh = h * 0.74; x += (w - nw) / 2; y += (h - nh) * 0.42; w = nw; h = nh;
      }
      filmGrade(ctx, 0.5);
      var g2 = ctx.createLinearGradient(0, H - 420, 0, H); g2.addColorStop(0, "rgba(11,9,7,0)"); g2.addColorStop(1, "rgba(11,9,7,0.85)");
      ctx.fillStyle = g2; ctx.fillRect(0, H - 420, W, 420);
      titleLine(ctx, topic.title.toUpperCase(), W / 2, H - 170, 104, CREAM, "center", 800, "8px");
      ctx.font = font(28, SERIF, true); ctx.fillStyle = "rgba(243,231,201,0.75)"; ctx.textAlign = "center";
      ctx.fillText(topic.author + (descOf() ? " \u00B7 " + descOf() : ""), W / 2, H - 116); ctx.textAlign = "left";
    },
    // bleed: the photo edge to edge, the museum label in its corner
    bleed: function (ctx, s, im) {
      ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H);
      if (im) cover(ctx, im, 0, 0, W, H, 0, crop(im));
      coverLabel(ctx, 70, null, 620);
      s.light = true;
    },
    // poster: the title huge on the wall, the photo below, the credits beside it
    poster: function (ctx, s, im) {
      wall(ctx);
      var t = topic.title, size = fitText(ctx, t, 230, SANS, W - 140, false, 800);
      titleLine(ctx, t, 62, 70 + size * 0.86, size, onWall(1), "left", 800, "-4px");
      var y = 70 + size + 30;
      ctx.font = font(34, SERIF, true); ctx.fillStyle = onWall(0.7); ctx.fillText(descOf(), 70, y + 10);
      if (im) cover(ctx, im, 70, y + 50, W - 140, H - FOOT - (y + 50) - 40, 4, crop(im));
      ctx.font = font(20, SANS, false, 600); ctx.fillStyle = onWall(0.6); ctx.textAlign = "right";
      ctx.fillText(topic.author + (topic.no ? "  \u00B7  No. " + pad(topic.no) : ""), W - 70, y + 10); ctx.textAlign = "left";
    },
    // grid: the whole topic at a glance — nine of its photos, the label in the middle
    grid: function (ctx, s, im) {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      var all = [s.photo].concat(pool.filter(function (p) { return p !== s.photo; })), list = [];
      for (var k = 0; k < 9; k++) list.push(all[k % all.length]);                 // fewer than nine photos: they come round again
      var g = 6, cw = (W - 2 * g) / 3, chh = (H - 2 * g) / 3;
      return Promise.all(list.map(loadImg)).then(function (ims) {
        ims.forEach(function (p, k) { if (p) cover(ctx, p, (k % 3) * (cw + g), Math.floor(k / 3) * (chh + g), cw, chh, 0, crop(p)); });
        coverLabel(ctx, null, null, 560, true);
      });
    },
    // board: the topic's first board, as it hangs on the site, its label under it
    board: function (ctx, s) {
      wall(ctx);
      var first = (topic.blocks || []).filter(function (b) { return b.type === "image" && b.board; })[0];
      return loadImg(first ? first.src : s.photo).then(function (im) {
        if (im) {
          var b = alphaBox(im), k = Math.min((W - 120) / b.w, 820 / b.h), dw = b.w * k, dh = b.h * k;
          ctx.drawImage(im, b.x, b.y, b.w, b.h, (W - dw) / 2, 70, dw, dh);
          coverLabel(ctx, M, Math.min(70 + dh - 40, H - FOOT - 260), 640);
        } else coverLabel(ctx, M, 300, 640);
      });
    },
    // magazine: the photo across the top, the title set big in Charter on the paper below
    magazine: function (ctx, s, im) {
      ctx.fillStyle = "#fbfaf7"; ctx.fillRect(0, 0, W, H);
      var ph = 860;
      if (im) cover(ctx, im, 0, 0, W, ph, 0, crop(im));
      titleLine(ctx, "builtoberemembered", 60, 76, 30, "#fff", "left", 700, "1px");
      ctx.save(); ctx.font = font(120, SERIF); ctx.fillStyle = "#111"; ctx.fillText(topic.title, 56, ph + 150); ctx.restore();
      ctx.font = font(34, SERIF, true); ctx.fillStyle = "#444"; ctx.fillText(descOf(), 60, ph + 214);
      ctx.font = font(20, SANS); ctx.fillStyle = "#777";
      ctx.fillText(topic.author + "  \u00B7  " + String(topic.date || "").replace(/-/g, ".") + (topic.no ? "  \u00B7  No. " + pad(topic.no) : ""), 60, ph + 270);
    },
    // ink: the photo dimmed, the title written over it in Isaac's hand
    ink: function (ctx, s, im) {
      ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H); s.light = true;
      if (im) { cover(ctx, im, 0, 0, W, H, 0, crop(im)); focusPull(ctx, [[300, 0], [560, 1], [900, 1], [1150, 0]]); }
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 18;
      var size = 200; ctx.font = font(size, HAND); while (size > 80 && ctx.measureText(topic.title).width > W - 160) { size -= 8; ctx.font = font(size, HAND); }
      ctx.fillStyle = "#fbf8f2"; ctx.fillText(topic.title, 80, 640);
      ctx.font = font(52, HAND); ctx.fillText(descOf(), 86, 740);
      ctx.restore();
      ctx.font = font(22, SANS); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillText(topic.author + (topic.no ? "  \u00B7  No. " + pad(topic.no) : ""), 86, H - 110);
    }
  };
  // the museum label (as on the site) — "Author, / Title, desc" — at (x, y) or centred
  function coverLabel(ctx, x, y, cw, centred) {
    var desc = descOf(), size = 46, lh = size * 1.13;
    var words = plainRuns(topic.author + ",").concat([{ br: true }], plainRuns(topic.title + (desc ? ", " + desc : "")));
    var lines = wrap(words, size, SANS, cw - 84), ch = 40 + linesH(lines, lh) + 84;
    if (centred) { x = (W - cw) / 2; y = (H - ch) / 2; }
    if (x == null) x = 70;
    if (y == null) y = H - FOOT - ch - 20;
    card(ctx, x, y, cw, ch);
    drawLines(ctx, lines, x + 42, y + 30, size, lh, SANS, "#111");
    ctx.font = font(20, SANS); ctx.fillStyle = "#111"; ctx.textAlign = "right";
    if (topic.no) ctx.fillText("No. " + pad(topic.no), x + cw - 40, y + ch - 32);
    ctx.textAlign = "left";
  }

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
      chips(); fitPhone();
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
    var row = $("photoRow"), isVideo = s.kind === "video";
    var first = isVideo ? s.stills : [s.auto], labels = isVideo ? s.labels : ["Auto"];
    var others = pool.filter(function (p) { return first.indexOf(p) < 0; });
    row.hidden = !s.auto || first.length + others.length < 2;
    if (row.hidden) { closePicker(); return; }
    function fix(im, src) { if (/i\.ytimg\.com/.test(src)) im.onerror = function () { im.onerror = null; im.src = src.replace("maxresdefault", "hqdefault").replace(/maxres(\d)/, "hq$1"); }; im.src = src; }
    function label(src) {
      var k = first.indexOf(src);
      if (src === s.auto) return isVideo ? "Automatic · frame " + labels[k] : "Automatic · nearest image";
      if (k >= 0) return labels[k] === "Cover" ? "The video\u2019s cover" : "Frame " + labels[k] + " of the video";
      return "Photo " + (others.indexOf(src) + 1) + " of the topic";
    }
    $("photoHead").textContent = isVideo ? "Picture" : "Photo";
    $("photoNote").textContent = label(s.photo);
    fix($("pickThumb"), s.photo);
    $("pickerTitle").textContent = (isVideo ? "Picture" : "Photo") + " · slide " + (slides.indexOf(s) + 1);
    // the picker's grid: the video's own frames first, then every photo of the topic
    var body = $("pickerBody"); body.innerHTML = "";
    [[isVideo ? "From the video" : "Suggested", first, labels], ["From the topic", others, []]].forEach(function (grp) {
      if (!grp[1].length) return;
      var h = document.createElement("h4"); h.textContent = grp[0]; body.appendChild(h);
      var grid = document.createElement("div"); grid.className = "photos"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", grp[0]);
      grp[1].forEach(function (src, k) {
        var b = document.createElement("button"); b.type = "button"; b.className = "ph";
        b.setAttribute("aria-pressed", String(s.photo === src));
        b.setAttribute("aria-label", label(src));
        var im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.decoding = "async"; fix(im, src);
        b.appendChild(im);
        if (grp[2][k]) { var t = document.createElement("span"); t.textContent = grp[2][k] + (src === s.auto && isVideo ? " · Auto" : ""); b.appendChild(t); }
        b.addEventListener("click", function () {
          s.photo = src;
          if (src === s.auto) delete picks[s.key]; else picks[s.key] = src;
          [].forEach.call(body.querySelectorAll(".ph"), function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          $("photoNote").textContent = label(src); fix($("pickThumb"), src);
          paint(s, slides.indexOf(s));
        });
        grid.appendChild(b);
      });
      body.appendChild(grid);
    });
  }
  // open beside the phone (so the slide stays in view), or as a sheet from the bottom on a small screen
  function placePicker() {
    var pk = $("picker"); if (pk.hidden) return;
    var ph = document.querySelector(".phone").getBoundingClientRect(), w = 344, gap = 24;
    var left = ph.right + gap <= innerWidth - w - 16 ? ph.right + gap : Math.max(16, ph.left - gap - w);
    pk.style.left = left + "px"; pk.style.top = Math.max(16, ph.top) + "px";
    pk.style.maxHeight = Math.min(ph.height, innerHeight - 32) + "px";
    pk.style.transformOrigin = left > ph.right ? "left center" : "right center";
  }
  function openPicker() { $("picker").hidden = false; $("pickBtn").setAttribute("aria-expanded", "true"); placePicker(); var on = $("pickerBody").querySelector('[aria-pressed="true"]'); (on || $("pickerDone")).focus({ preventScroll: true }); }
  function closePicker() { if ($("picker").hidden) return; $("picker").hidden = true; $("pickBtn").setAttribute("aria-expanded", "false"); }



  // the style pickers: each choice drawn with this topic's own first text / video slide
  var chipsFor = "";
  function chips() {
    if (chipsFor === topic.slug) return; chipsFor = topic.slug;
    [["cover", "chipsCover", "secCover", COVER_NAMES, "cover"],
     ["text", "chipsText", "secText", ["blur", "strip", "cinema", "half", "polaroid"], "textStyle"],
     ["video", "chipsVideo", "secVideo", ["subtitle", "bands"], "video"]].forEach(function (g) {
      var kind = g[0], box = $(g[1]), names = g[3], key = g[4];
      var sample = plan(opts).filter(function (s) { return s.kind === kind; })[0];
      $(g[2]).hidden = !sample;
      if (!sample) return;
      box.innerHTML = "";
      names.reduce(function (p, name) {
        var o = { textStyle: opts.textStyle, video: opts.video, cover: opts.cover }; o[key] = name;
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

  // the phone is drawn at its true size and zoomed to the height the layout leaves it
  function fitPhone() {
    var phone = document.querySelector(".phone");
    if (innerWidth <= 760) { phone.style.zoom = ""; return; }
    var dock = document.body.classList.contains("lay-dock") ? document.querySelector(".panel").offsetHeight + 52 : 40;
    var h = Math.max(420, Math.min(document.body.classList.contains("lay-side") ? 860 : 820, innerHeight - 52 - dock));
    phone.style.zoom = String(h / 820);
    var t = $("track"); if (t) t.scrollLeft = at * t.clientWidth;
    placePicker();
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
    $("pickBtn").addEventListener("click", function () { $("picker").hidden ? openPicker() : closePicker(); });
    $("pickerDone").addEventListener("click", function () { closePicker(); $("pickBtn").focus(); });
    document.addEventListener("pointerdown", function (e) {
      if (!$("picker").hidden && !$("picker").contains(e.target) && !$("pickBtn").contains(e.target) && !document.querySelector(".post").contains(e.target)) closePicker();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("picker").hidden) { closePicker(); $("pickBtn").focus(); } });
    addEventListener("resize", placePicker);
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
    addEventListener("resize", function () { fitPhone(); track.scrollLeft = at * track.clientWidth; });
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
      document.body.classList.add("lay-" + (q.get("layout") || "dock"));
      fitPhone(); requestAnimationFrame(fitPhone);
      wire(); return render();
    }).catch(function (e) { $("count").textContent = "Couldn’t load “" + opts.slug + "”: " + e.message; });
  }
  start();
})();
