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
  var opts = { slug: q.get("t") || "djh20", textStyle: q.get("style") || "blur", note: q.get("note") || "focus", folio: q.get("folio") !== "0" };
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
  function style() { return STYLES[opts.textStyle] || STYLES.blur; }
  function textPages(words) {
    var st = style(), innerW = st.w, maxH = st.maxH, family = st.family;
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
  function plan() {
    var out = [{ kind: "cover" }], blocks = topic.blocks || [];
    var tailFrom = blocks.length;                    // trailing hand/sign close the carousel, after the sources
    while (tailFrom > 0 && /^(hand|sign)$/.test(blocks[tailFrom - 1].type)) tailFrom--;
    blocks.forEach(function (b, i) {
      if (i === tailFrom && topic.inspiration) out.push({ kind: "sources" });
      if (b.type === "text") {
        var words = runsFromHTML(b.html); if (!words.length) return;
        if (b.head) { out.push({ kind: "chapter", words: words }); return; }
        var pages = textPages(words), photos = nearestPhotos(blocks, i);
        pages.forEach(function (p, k) {
          var key = i + ":" + k, auto = photos[k % photos.length];
          out.push({ kind: "text", key: key, auto: auto, photo: picks[key] || auto, lines: p.lines, size: p.size, part: pages.length > 1 ? (k + 1) + "/" + pages.length : "" });
        });
      } else if (b.type === "image" && b.src) {
        out.push(b.board ? { kind: "board", src: b.src } : { kind: "photo", src: b.src, caption: b.caption });
      } else if (b.type === "video" && b.src) {
        out.push({ kind: "video", src: b.src, caption: b.caption, wtitle: b.wtitle });
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
        return (TEXTS[opts.textStyle] || TEXTS.blur)(ctx, s, im, style());
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
      wall(ctx);
      var id = ytId(s.src);
      return Promise.all([id ? ytThumb(id) : Promise.resolve(null), id ? ytInfo(id) : Promise.resolve({})]).then(function (r) {
        var thumb = r[0], title = s.wtitle || (r[1] && r[1].title) || "Film";
        return MacWin.videoChrome({ ratio: "16:9", title: title }, 1280, 720).then(function (chw) {
          var dw = W - 2 * 50, k = dw / chw.w, dh = chw.h * k, X = 50, Y = (H - FOOT - dh) / 2 - 40, hh = chw.hole;
          var hx = X + hh.x * k, hy = Y + hh.y * k, hw = hh.w * k, hhh = hh.h * k;
          ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 28;
          ctx.fillStyle = "#1e1e1e"; ctx.beginPath(); ctx.roundRect(X + 4, Y + 4, dw - 8, dh - 8, 14 * k); ctx.fill(); ctx.restore();
          ctx.fillStyle = "#000"; ctx.fillRect(hx, hy, hw, hhh);
          if (thumb) cover(ctx, thumb, hx, hy, hw, hhh, hh.r * k);
          ctx.drawImage(chw.img, X, Y, dw, dh);
          // a quiet play button: frosted disc, white triangle
          var cx = hx + hw / 2, cy = hy + hhh / 2, r = 62;
          ctx.fillStyle = "rgba(0,0,0,0.38)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(cx - 18, cy - 28); ctx.lineTo(cx + 30, cy); ctx.lineTo(cx - 18, cy + 28); ctx.closePath(); ctx.fill();
          ctx.font = font(34, SERIF, true); ctx.fillStyle = onWall(0.88);
          ctx.fillText(plain(s.caption) || "Watch the film — link in bio", X + 6, Y + dh + 70);
          if (s.caption) { ctx.font = font(24, SANS); ctx.fillStyle = onWall(0.5); ctx.fillText("Watch it — link in bio", X + 6, Y + dh + 116); }
        });
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
        return (NOTES[opts.note] || NOTES.focus)(ctx, s, im);
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

  /* ---------- the handwritten note, five ways ---------- */
  // the note in Isaac's hand, as big as fits the box
  function fitHand(text, maxW, maxH, start, min, k) {
    k = k || 1.32;
    for (var size = start; size >= min; size -= 2) {
      var lines = wrap(plainRuns(text), size, HAND, maxW);
      if (linesH(lines, size * k) <= maxH || size === min) return { lines: lines, size: size, lh: size * k, h: linesH(lines, size * k) };
    }
  }
  function lineText(ln) { return ln.map(function (w) { return w.parts.map(function (p) { return p.t; }).join(""); }).join(" "); }
  function rotated(ctx, cx, cy, a, fn) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.translate(-cx, -cy); fn(); ctx.restore(); }
  function tape(ctx, x, y, a, w) {
    rotated(ctx, x, y, a, function () { ctx.fillStyle = "rgba(235,228,205,0.82)"; ctx.fillRect(x - (w || 140) / 2, y - 20, w || 140, 40); });
  }
  function bleed(ctx, im) { ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H); cover(ctx, im, 0, 0, W, H, 0, bare(im)); }
  var PAPER = "#fdfcf8";
  var NOTES = {
    // 1 · focus: the photo edge to edge, out of focus around a white card
    focus: function (ctx, s, im) {
      var f = fitHand(s.text, W - 2 * M - 150, 700, 66, 50);
      var cw = W - 2 * M - 40, ch = f.h + 150, cx = (W - cw) / 2, cy = (H - FOOT - ch) / 2 + 10;
      if (im) {
        bleed(ctx, im);
        focusPull(ctx, [[cy - 280, 0], [cy - 10, 1], [cy + ch + 10, 1], [cy + ch + 280, 0]]);
        var g = ctx.createLinearGradient(0, H - 260, 0, H);
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.35)");
        ctx.fillStyle = g; ctx.fillRect(0, H - 260, W, 260);
        s.light = true;
      } else wall(ctx);
      rotated(ctx, W / 2, cy + ch / 2, -0.018, function () {
        card(ctx, cx, cy, cw, ch);
        drawLines(ctx, f.lines, cx + 72, cy + 62, f.size, f.lh, HAND, "#1f1d20");
      });
    },
    // 2 · ink: written straight onto the photo in white, the picture softened and dimmed behind the words
    ink: function (ctx, s, im) {
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
    },
    // 3 · postcard: the back of a card, the note on the left, the photo as its stamp, addressed to the site
    postcard: function (ctx, s, im) {
      wall(ctx);
      var pw = 980, ph = 660, px = (W - pw) / 2, py = (H - FOOT - ph) / 2 + 10;
      rotated(ctx, W / 2, py + ph / 2, -0.022, function () {
        shadowed(ctx, function () { ctx.fillStyle = PAPER; ctx.fillRect(px, py, pw, ph); }, 0.16, 40, 18);
        var mid = px + pw * 0.56;
        ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(mid, py + 70, 2, ph - 140);
        var f = fitHand(s.text, mid - px - 100, ph - 150, 50, 34, 1.3);
        drawLines(ctx, f.lines, px + 56, py + (ph - f.h) / 2 - 10, f.size, f.lh, HAND, "#1f1d20");
        // the stamp: the photo in a perforated white border
        var sw = 190, sh = 230, sx = px + pw - 56 - sw, sy = py + 50;
        ctx.fillStyle = "#fff"; ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = PAPER;
        for (var t = 0; t <= sw; t += 16) { ctx.beginPath(); ctx.arc(sx + t, sy, 5, 0, 7); ctx.arc(sx + t, sy + sh, 5, 0, 7); ctx.fill(); }
        for (t = 0; t <= sh; t += 16) { ctx.beginPath(); ctx.arc(sx, sy + t, 5, 0, 7); ctx.arc(sx + sw, sy + t, 5, 0, 7); ctx.fill(); }
        if (im) cover(ctx, im, sx + 14, sy + 14, sw - 28, sh - 28, 0, bare(im));
        // the postmark, over the stamp's corner
        var mx = sx - 18, my = sy + sh - 40;
        ctx.strokeStyle = "rgba(30,28,32,0.45)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(mx, my, 62, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(mx, my, 50, 0, 7); ctx.stroke();
        ctx.font = font(17, SANS, false, 600); ctx.fillStyle = "rgba(30,28,32,0.5)"; ctx.textAlign = "center";
        ctx.fillText(topic.title, mx, my - 2); ctx.font = font(13, SANS); ctx.fillText(String(topic.date || "").replace(/-/g, "."), mx, my + 18);
        ctx.textAlign = "left";
        for (var k = 0; k < 4; k++) {
          ctx.beginPath(); ctx.moveTo(mx + 80 + k * 26, my - 34); ctx.bezierCurveTo(mx + 96 + k * 26, my - 12, mx + 64 + k * 26, my + 12, mx + 80 + k * 26, my + 34); ctx.stroke();
        }
        // the address, written in
        var ax = mid + 44, aw = px + pw - 56 - ax, ay = py + ph - 250;
        ["you,", "who read it all", SITE].forEach(function (t, k) {
          var ly = ay + k * 74;
          ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(ax, ly + 14, aw, 2);
          var sz = 34; ctx.font = font(sz, HAND);
          while (sz > 20 && ctx.measureText(t).width > aw - 10) { sz -= 2; ctx.font = font(sz, HAND); }
          ctx.fillStyle = "#1f1d20"; ctx.fillText(t, ax + 6, ly);
        });
      });
    },
    // 4 · sticky: the photo's window on the wall, a square note stuck over its corner
    sticky: function (ctx, s, im) {
      wall(ctx);
      if (im) shadowed(ctx, function () { contain(ctx, im, 70, 70, W - 140, 760); }, 0.22, 40, 18);
      var n = 500, nx = 96, ny = H - FOOT - n - 30;
      rotated(ctx, nx + n / 2, ny + n / 2, -0.04, function () {
        shadowed(ctx, function () { ctx.fillStyle = "#fbf4d2"; ctx.fillRect(nx, ny, n, n); }, 0.2, 26, 12);
        var g = ctx.createLinearGradient(0, ny, 0, ny + 60); g.addColorStop(0, "rgba(0,0,0,0.06)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(nx, ny, n, 60);
        var f = fitHand(s.text, n - 90, n - 110, 52, 34, 1.3);
        drawLines(ctx, f.lines, nx + 46, ny + (n - f.h) / 2, f.size, f.lh, HAND, "#1f1d20");
      });
    },
    // 5 · letter: a ruled sheet, the note on its lines, the photo tucked behind the corner
    letter: function (ctx, s, im) {
      wall(ctx);
      var lw = 840, rule = 78, f = fitHand(s.text, lw - 200, 8 * rule, 56, 40, rule / 56);
      var lh0 = Math.max(560, 150 + (f.lines.length + 2) * rule + 40), lx = (W - lw) / 2 - 20, ly = (H - FOOT - lh0) / 2 + 40;
      if (im) {
        rotated(ctx, lx + lw - 40, ly + 40, 0.09, function () {
          var b = bare(im) || { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight }, pw = 360, ph = pw * Math.min(b.h / b.w, 1.2);
          shadowed(ctx, function () { ctx.fillStyle = "#fff"; ctx.fillRect(lx + lw - 260, ly - 70, pw + 24, ph + 24); }, 0.2, 24, 10);
          cover(ctx, im, lx + lw - 248, ly - 58, pw, ph, 0, b);
        });
      }
      rotated(ctx, lx + lw / 2, ly + lh0 / 2, 0.012, function () {
        shadowed(ctx, function () { ctx.fillStyle = PAPER; ctx.fillRect(lx, ly, lw, lh0); }, 0.16, 36, 16);
        var top = ly + 150;
        for (var y = top; y < ly + lh0 - 60; y += rule) { ctx.fillStyle = "rgba(70,110,160,0.16)"; ctx.fillRect(lx + 50, y, lw - 100, 2); }
        ctx.fillStyle = "rgba(200,70,70,0.22)"; ctx.fillRect(lx + 104, ly + 40, 2, lh0 - 80);
        f.lines.forEach(function (ln, k) {
          ctx.font = font(f.size, HAND); ctx.fillStyle = "#1f1d20";
          ctx.fillText(lineText(ln), lx + 130, top - 14 + k * rule);
        });
      });
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

  /* ---------- render ---------- */
  var token = 0;
  function render() {
    var my = ++token;
    slides = plan(); pool = photoPool();
    var strip = $("strip"); strip.innerHTML = "";
    $("count").textContent = slides.length + " slides" + (slides.length > 20 ? " — Instagram allows 20: untick some" : "");
    $("count").classList.toggle("warn", slides.length > 20);
    var jobs = slides.map(function (s, i) {
      var c = document.createElement("canvas"); c.width = W; c.height = H; s.canvas = c;
      var fig = document.createElement("figure"); fig.className = "slide" + (skip[i] ? " is-off" : "");
      var tag = document.createElement("label"); tag.className = "slide-tag";
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !skip[i];
      cb.addEventListener("change", function () { skip[i] = !cb.checked; fig.classList.toggle("is-off", !!skip[i]); });
      tag.appendChild(cb); tag.appendChild(document.createTextNode(" " + pad(i + 1) + " · " + s.kind));
      var foot = document.createElement("div"); foot.className = "slide-foot"; foot.appendChild(tag);
      if (s.auto && pool.length > 1) foot.appendChild(picker(s, i));
      fig.appendChild(c); fig.appendChild(foot); strip.appendChild(fig);
      c.title = "Click to download this slide";
      c.addEventListener("click", function () { blobOf(c).then(function (b) { save(b, fileName(i)); }); });
      return s;
    });
    var n = slides.length;
    // draw in order (each slide waits on its own images only)
    return jobs.reduce(function (p, s, i) {
      return p.then(function () { if (my === token) return paint(s, i); });
    }, Promise.resolve()).then(function () {
      if (my !== token) return;
      var cap = $("caption"); cap.value = caption(); cap.style.height = ""; cap.style.height = (cap.scrollHeight + 4) + "px";
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
  // ‹ Photo 3 / 18 › — step a text slide through the topic's photos; back on the rule's choice it says "auto"
  function picker(s, i) {
    var wrap = document.createElement("span"); wrap.className = "slide-pick";
    var prev = document.createElement("button"), next = document.createElement("button"), lab = document.createElement("span");
    prev.type = next.type = "button"; prev.textContent = "\u2039"; next.textContent = "\u203A";
    prev.setAttribute("aria-label", "Previous photo"); next.setAttribute("aria-label", "Next photo");
    function label() {
      var at = pool.indexOf(s.photo);
      lab.textContent = s.photo === s.auto ? "auto" : (at + 1) + " / " + pool.length;
      lab.title = s.photo === s.auto ? "Picked by the nearest image block" : "Picked by hand";
    }
    function step(d) {
      var at = pool.indexOf(s.photo); at = ((at < 0 ? 0 : at + d) % pool.length + pool.length) % pool.length;
      s.photo = pool[at];
      if (s.photo === s.auto) delete picks[s.key]; else picks[s.key] = s.photo;
      label(); paint(s, i);
    }
    prev.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });
    label(); wrap.appendChild(prev); wrap.appendChild(lab); wrap.appendChild(next);
    return wrap;
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
    if (navigator.canShare && navigator.canShare({ files: [probe] })) share.hidden = false;
    share.addEventListener("click", function () {
      var btn = this, was = btn.textContent; busy(btn, true, "Preparing…");
      chosen().then(function (files) {
        if (navigator.clipboard) navigator.clipboard.writeText($("caption").value).catch(function () {});
        return navigator.share({ files: files });
      }).catch(function () {}).finally(function () { busy(btn, false, was); });
    });
    $("copyCap").addEventListener("click", function () {
      var btn = this; navigator.clipboard.writeText($("caption").value).then(function () {
        btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy caption"; }, 1400);
      });
    });
    document.querySelectorAll("[data-style]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.style === opts.textStyle));
      b.addEventListener("click", function () {
        opts.textStyle = b.dataset.style;
        document.querySelectorAll("[data-style]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        skip = {}; render();
      });
    });
    document.querySelectorAll("[data-note]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.note === opts.note));
      b.addEventListener("click", function () {
        opts.note = b.dataset.note;
        document.querySelectorAll("[data-note]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        render();
      });
    });
    $("folio").checked = opts.folio;
    $("folio").addEventListener("change", function () { opts.folio = this.checked; render(); });
    $("topic").addEventListener("change", function () { location.search = "?t=" + encodeURIComponent(this.value); });
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
      (list.length ? list : [{ slug: topic.slug, title: topic.title }]).forEach(function (t) {
        var o = document.createElement("option"); o.value = t.slug; o.textContent = t.title || t.slug; o.selected = t.slug === topic.slug; sel.appendChild(o);
      });
      document.documentElement.style.setProperty("--tone", topic.tone || "#e6e4e6");
      wire(); return render();
    }).catch(function (e) { $("count").textContent = "Couldn't load “" + opts.slug + "”: " + e.message; });
  }
  start();
})();
