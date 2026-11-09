/* Reel export — a published topic, walked through as a gallery.

   The pieces hang along one long wall: framed photos with the feed's white label beside them, lines
   of the text lettered straight onto the wall. A visitor walks past at an even pace, stops in front
   of each one for a moment, and walks on — footsteps, a little echo, daylight from a window behind
   them, now and then a pillar sliding past close to the eye. Everything is drawn on a canvas with
   its own perspective, so the preview and the exported MP4 are the same pictures. */
(function () {
  "use strict";

  var W = 1080, H = 1920, FPS = 30;
  var F = 1500, D = 1640;                  // focal length; the visitor's distance from the wall
  var Y = -90;                             // pieces hang a little above eye level
  var YAW = 5;                             // while walking, eyes run this many degrees ahead
  var RAMP = 0.85;                         // seconds to get up to pace, and to come to a halt
  var PACE = { slow: 600, normal: 750, brisk: 900 };
  var STRIDE = 440;                        // ground covered per footstep at normal pace
  var LEAN = 700;                          // how much closer the visitor steps to a photo they lean in to
  // the light in the room: wall, floor and skirting colours; light pools; the window's daylight; how dark it is
  var MOODS = {
    day: { wall: ["#e4e2e4", "#e1dfe1", "#d9d7d9"], floor: ["#c9c5c3", "#d1cdcb", "#d7d4d2"], base: "#d2cfd0", pool: 0.4,
      sun: ["rgba(255,249,238,0.62)", "rgba(255,249,238,0.42)"], sunSkew: -24, sunTop: -760,
      ink: "#151315", small: "#8f8c90", pillar: ["#b9b6b8", "#cbc8ca", "#d3d0d2", "#c4c1c3"] },
    evening: { wall: ["#ded7d1", "#d9d1cb", "#cec5bf"], floor: ["#b9aea6", "#c3b8b0", "#cbc1b9"], base: "#c8beb7", pool: 0.25,
      sun: ["rgba(255,216,176,0.5)", "rgba(255,208,166,0.34)"], sunSkew: -42, sunTop: -470, grade: "rgba(255,150,70,0.2)",
      ink: "#1d1715", small: "#8c8079", pillar: ["#a89c95", "#bcb0a8", "#c6bab2", "#b3a79f"] },
    night: { wall: ["#5b585a", "#545153", "#49464a"], floor: ["#363334", "#3e3a3b", "#454142"], base: "#3d3a3b", pool: 0, dark: 0.62,
      ink: "#f1eff1", small: "#b4b1b5", pillar: ["#252324", "#2f2c2e", "#353233", "#2a2829"] },
    white: { wall: ["#f7f6f7", "#f4f3f4", "#ecebec"], floor: ["#e2e0df", "#e8e6e5", "#edecea"], base: "#e7e5e6", pool: 0.2,
      ink: "#151315", small: "#8f8c90", pillar: ["#dcdadb", "#e8e6e7", "#efedee", "#e2e0e1"] }
  };
  var SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  var SITE = "builtoberemembered.com";

  var q = new URLSearchParams(location.search);
  var slug = q.get("t") || "";
  var topic = null, reel = null, scene = null, sel = 0;
  var user = { id: 0, buf: null };          // your file or voice, decoded
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- loading ---------- */
  var imgs = {}, loaded = {};
  function loadImg(src) {
    if (!imgs[src]) imgs[src] = new Promise(function (res) {
      var im = new Image(); im.onload = function () { loaded[src] = im; res(im); }; im.onerror = function () { res(null); }; im.src = src;
    });
    return imgs[src];
  }
  // a board's window PNG is the Preview window baked around the photo — this is the photo alone
  function bare(im) {
    if (!/board-\d+-\d+\.png($|\?)/i.test(im.src)) return { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
    var k = Math.max(im.naturalWidth / 726, im.naturalHeight / 760), e = 5 * k;
    return { x: 3 * k + e, y: 37 * k + e, w: im.naturalWidth - 6 * k - 2 * e, h: im.naturalHeight - 40 * k - 2 * e };
  }
  function plain(html) { return new DOMParser().parseFromString(String(html || "").replace(/<\/p>|<br\s*\/?>/gi, " </p>"), "text/html").body.textContent.replace(/ /g, " ").replace(/\s+/g, " ").trim(); }
  function pad3(n) { return ("00" + n).slice(-3); }
  function longDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  /* ---------- what the topic has to hang ---------- */
  function photos() {                      // every picture in the topic, cover first, each once
    var out = [], seen = {};
    function add(src, note) { if (src && !seen[src]) { seen[src] = 1; out.push({ src: src, note: note || "" }); } }
    var notes = {};
    (topic.blocks || []).forEach(function (b) { if (b.board) b.board.items.forEach(function (it) { notes[it.src] = it.note; }); });
    add(topic.cover, notes[topic.cover]);
    (topic.blocks || []).forEach(function (b) {
      if (b.type !== "image") return;
      if (b.board && b.board.items) b.board.items.forEach(function (it) { add(it.src, it.note); });
      else add(b.src, b.caption);
    });
    return out;
  }
  // a photo's note, as the feed's label: "Trevor Hughes,\nThe Bike Messengers (1992-1998)"
  function labelOf(note) {
    note = String(note || "").trim().replace(/\.$/, ""); if (!note) return topic.author + ",\n" + topic.title;
    var m = /^(.*?)\s+[-–—]\s+(.+)$/.exec(note); if (m) return m[2] + ",\n" + m[1];
    m = /^(.*?)\s+by\s+(.+)$/i.exec(note); if (m) return m[2] + ",\n" + m[1];
    return note.replace(/_/g, ", ");
  }
  function sentences() {                   // lines from the text that could go on a wall
    var out = [];
    (topic.blocks || []).forEach(function (b) {
      if (b.type === "text") (plain(b.html).match(/[^.!?]+[.!?]+/g) || []).forEach(function (s) {
        s = s.trim(); var n = s.split(/\s+/).length; if (n >= 4 && n <= 24) out.push(s);
      });
      if (b.type === "quote" && b.text) out.push("“" + b.text.trim() + "”");
    });
    return out;
  }
  function noLine() { return "No. " + pad3(topic.no || 0); }
  function defaults() {
    var desc = String(topic.desc || "").trim().replace(/[.,;:]+$/, "");
    var stops = [{ kind: "text", size: "L", hold: 1.8,
      text: topic.author + ",\n" + topic.title + (desc ? ", " + desc : "") + ",\n" + longDate(topic.date), small: noLine() }];
    // the cover, then the first picture of each board
    var all = photos(), pick = all.slice(0, 1);
    (topic.blocks || []).forEach(function (b) {
      if (b.type === "image" && b.board && b.board.items[0] && pick.length < 5 && !pick.some(function (p) { return p.src === b.board.items[0].src; })) pick.push({ src: b.board.items[0].src, note: b.board.items[0].note });
    });
    pick.forEach(function (p) { stops.push({ kind: "photo", src: p.src, label: labelOf(p.note), size: "M", hold: 1.3 }); });
    (topic.blocks || []).filter(function (b) { return b.type === "quote" && b.text; }).slice(0, 1).forEach(function (b) {
      stops.splice(Math.min(stops.length, 3), 0, { kind: "text", size: "M", hold: 2.6, text: "“" + b.text.trim() + "”", small: b.cite || "" });
    });
    stops.push({ kind: "text", size: "L", hold: 1.6, text: "Read it on\n" + SITE, small: noLine() + " — " + topic.title });
    return { v: 1, stops: stops, pace: "normal", mood: "day", mblur: true, steps: true, sun: true, pillars: true, audio: null };
  }
  var KEY = function () { return "btbr-reel:" + topic.slug; };
  function persist() { try { localStorage.setItem(KEY(), JSON.stringify(reel)); } catch (e) {} }
  function restore() { try { var r = JSON.parse(localStorage.getItem(KEY()) || "null"); if (r && r.v === 1 && r.stops && r.stops.length) return r; } catch (e) {} return null; }

  /* ---------- typesetting on the wall ---------- */
  var mctx = document.createElement("canvas").getContext("2d");
  function setFont(ctx, size, track) { ctx.font = "400 " + size + "px " + SANS; if ("letterSpacing" in ctx) ctx.letterSpacing = (track * size).toFixed(2) + "px"; }
  function wrap(text, size, track, maxW) {
    setFont(mctx, size, track); var out = [];
    String(text || "").split("\n").forEach(function (para) {
      var line = "";
      para.split(/\s+/).filter(Boolean).forEach(function (w) {
        var t = line ? line + " " + w : w;
        if (line && mctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
      });
      out.push(line);
    });
    return out;
  }
  var TEXT = { L: { w: 880, size: 84, lh: 1.04, track: -0.035 }, M: { w: 960, size: 70, lh: 1.06, track: -0.03 } };
  var PHOTO = { S: 400, M: 500, L: 600 };
  var LABEL = { w: 300, pad: 27, size: 33, lh: 1.13, track: -0.022 };

  /* ---------- the scene: where everything hangs, and when the visitor is where ---------- */
  var builds = 0;
  function segTime(d, V) { return 2 * RAMP + Math.max(0, (d - V * RAMP) / V); }
  // fit to a length: share the time left after walking among the stops (in proportion to what you set,
  // never under MIN); walk faster when there isn't enough of it, slower when there's far too much
  function fitTo(gaps, holds, V, T) {
    var MIN = 0.6, n = holds.length, sumH = holds.reduce(function (a, b) { return a + b; }, 0);
    function walk(v) { return gaps.reduce(function (a, d) { return a + segTime(d, v); }, 0); }
    function solve(target, lo, hi) { for (var k = 0; k < 40; k++) { var mid = (lo + hi) / 2; if (walk(mid) > target) lo = mid; else hi = mid; } return (lo + hi) / 2; }
    var VMAX = Math.max(V, 1100);                                          // a brisk walk, never a run
    if (T - walk(V) < MIN * n) V = walk(VMAX) > T - MIN * n ? VMAX : solve(T - MIN * n, V, VMAX);
    else if (T - walk(V) > sumH * 2.5) V = walk(420) < T - sumH * 2.5 ? 420 : solve(T - sumH * 2.5, 420, V);
    var avail = Math.max(MIN * n, T - walk(V)), out = holds.slice(), fixed = {};
    for (var it = 0; it < 6; it++) {
      var free = 0, rest = avail;
      out.forEach(function (h, i) { if (fixed[i]) rest -= MIN; else free += holds[i]; });
      out = out.map(function (h, i) { return fixed[i] ? MIN : holds[i] * rest / (free || 1); });
      var more = false; out.forEach(function (h, i) { if (!fixed[i] && h < MIN) { fixed[i] = more = true; } });
      if (!more) break;
    }
    return { V: V, holds: out };
  }
  function beatGrid() {                     // [seconds per beat, the reel time of a beat], or null
    var bt = reel.beat; if (!bt || !bt.on || !(bt.bpm > 30)) return null;
    var per = 60 / bt.bpm, ph = bt.src === "file" ? bt.phase - (reel.audio && reel.audio.start || 0) : bt.phase;
    return [per, ((ph % per) + per) % per];
  }
  function build() {
    var x = 0, n = 0, items = [];
    function wide(st) { return st && ((st.kind === "text" && st.size === "M") || st.kind === "video"); }
    reel.stops.forEach(function (s, i) {
      if (i) x += 1500 + (wide(s) || wide(reel.stops[i - 1]) ? 250 : 0);
      var it = { stop: s, x: x, index: i };
      if (s.kind === "photo") {
        it.no = noLine() + " — " + (++n);
        it.im = loaded[s.src] || null;
        if (!it.im) loadImg(s.src).then(function (im) { it.im = im; layoutPhoto(it); paint(); });
        layoutPhoto(it);
      } else if (s.kind === "video") {
        layoutVideo(it); loadVideo(s);
      } else {
        var T = TEXT[s.size] || TEXT.L, hang = /^[“"‘']/.test(s.text);
        it.lines = wrap(s.text, T.size, T.track, T.w); it.T = T; it.hang = hang;
        setFont(mctx, T.size, T.track); it.hangW = hang ? mctx.measureText(s.text.charAt(0)).width : 0;
        it.h = it.lines.length * T.size * T.lh + (s.small ? 40 + 30 : 0);
      }
      items.push(it);
    });
    var V = PACE[reel.pace] || PACE.normal, eff = reel.stops.map(function (s) { return s.hold; });
    if (+reel.fit) { var f = fitTo(items.slice(1).map(function (it, i) { return it.x - items[i].x; }), eff, V, +reel.fit); V = f.V; eff = f.holds; }
    var grid = beatGrid();
    // the walk: hold, ease up to pace, walk, ease to a halt, hold …
    var X = [], Z = [], ZD = [], YC = [], R = 240, holds = [];
    // standing in front of a stop; leaning in steps toward the photo itself (not the label) and back
    // a zoom: the camera glides in until the area you framed fills the screen, settles there with a
    // slow push, and glides back out
    function smoother(p) { p = Math.max(0, Math.min(1, p)); return p * p * p * (p * (p * 6 - 15) + 10); }
    function hold(it, secs) {
      holds.push(X.length / R);
      var st = it.stop, lean = st.kind === "photo" && st.lean && !st.zoomOn, det = st.kind === "photo" && st.zoomOn;
      var shift = lean ? (it.fw - it.total) / 2 : 0, rr = Math.min(1.1, secs * 0.38);
      var zr = det ? zoomRect(it) : null, tx = it.x, ty = 0, dep = D;
      if (zr) {
        var pl = it.x - it.total / 2 + 66, pt = Y - it.fh / 2 + 66;           // the photo's corner on the wall
        tx = pl + (zr.x + zr.w / 2) * it.pw; ty = pt + (zr.y + zr.h / 2) * it.ph; dep = Math.max(120, F * zr.w * it.pw / W);
      }
      var ri = Math.min(1.3, secs * 0.34), ro = Math.min(1.1, secs * 0.3);
      for (var k = 0; k < secs * R; k++) {
        var tt = k / R, p = lean ? Math.max(0, Math.min(1, tt / rr, (secs - tt) / rr)) : 0, e = (1 - Math.cos(Math.PI * p)) / 2;
        var ed = det ? smoother(Math.min(tt / ri, (secs - tt) / ro, 1)) : 0, push = 1 - 0.035 * tt / secs;
        X.push(it.x + shift * e + (tx - it.x) * ed); Z.push(LEAN * e); ZD.push((D - dep * push) * ed); YC.push(ty * ed);
      }
    }
    hold(items[0], eff[0]);
    for (var i = 0; i + 1 < items.length; i++) {
      var D0 = items[i + 1].x - items[i].x, tc = Math.max(0, (D0 - V * RAMP) / V), T2 = 2 * RAMP + tc;
      if (grid) {                         // on the beat: linger a moment longer so the next arrival lands on one
        var arrive = X.length / R + T2, on = grid[1] + Math.ceil((arrive - grid[1] - 0.02) / grid[0]) * grid[0];
        for (var w = 0; w < (on - arrive) * R; w++) { X.push(X[X.length - 1]); Z.push(Z[Z.length - 1]); ZD.push(0); YC.push(0); }
      }
      for (var k = 1; k <= T2 * R; k++) {
        var t = k / R, d;
        if (t < RAMP) d = V * (t / 2 - RAMP / (2 * Math.PI) * Math.sin(Math.PI * t / RAMP));
        else if (t < RAMP + tc) d = V * RAMP / 2 + V * (t - RAMP);
        else { var u = T2 - t; d = D0 - V * (u / 2 - RAMP / (2 * Math.PI) * Math.sin(Math.PI * u / RAMP)); }
        X.push(items[i].x + Math.min(D0, d)); Z.push(0); ZD.push(0); YC.push(0);
      }
      hold(items[i + 1], eff[i + 1]);
    }
    // pillars stand in the gap after every third stop; daylight falls every few stops
    var pillars = [], suns = [];
    if (reel.pillars) for (var p = 2; p + 1 < items.length; p += 3) pillars.push((items[p].x + items[p + 1].x) / 2);
    if (reel.sun && (MOODS[reel.mood] || MOODS.day).sun) for (var sx = 750; sx < x + 800; sx += 4100) suns.push(sx);
    scene = { ver: ++builds, fit: +reel.fit || 0, items: items, X: X, Z: Z, ZD: ZD, YC: YC, R: R, V: V, eff: eff, holds: holds, dur: (X.length - 1) / R, pillars: pillars, suns: suns, end: x };
  }
  /* ---------- a video stop: projected onto the wall ---------- */
  var VIDEO = { S: 640, M: 820, L: 980 };
  var vids = {};                            // stop.vid → { el, url, missing }
  function layoutVideo(it) {
    var v = vids[it.stop.vid], el = v && v.el, ar = el && el.videoWidth ? el.videoHeight / el.videoWidth : 9 / 16;
    it.vw = VIDEO[it.stop.size] || VIDEO.M; it.vh = Math.round(it.vw * ar);
  }
  function loadVideo(st) {
    if (vids[st.vid]) return;
    var v = vids[st.vid] = { el: null, url: "", missing: false };
    idbDo("readonly", function (os) { return os.get(topic.slug + ":video:" + st.vid); }).then(function (blob) {
      if (!blob) { v.missing = true; list(); return; }
      setVideo(st, blob);
    }).catch(function () { v.missing = true; });
  }
  function setVideo(st, blob) {
    var v = vids[st.vid] || (vids[st.vid] = {});
    if (v.url) URL.revokeObjectURL(v.url);
    var el = document.createElement("video"); el.muted = true; el.playsInline = true; el.preload = "auto"; el.loop = false;
    v.el = el; v.blob = blob; v.sink = null; v.url = URL.createObjectURL(blob); v.missing = false; el.src = v.url;
    el.addEventListener("loadeddata", function () { if (scene) { build(); paint(); list(); } });
    el.addEventListener("seeked", function () { if (!playing) paint(); });
  }
  // the clip starts as the visitor sets off toward it, and loops while it's in view
  function vidTime(it, t, dur) { var t0 = scene.holds[it.index] - 2.2; return Math.max(0, t - t0) % Math.max(0.1, dur - 0.05); }
  function vidNear(it, t) { return Math.abs(camAt(t).x - it.x) < 1900; }
  function syncVideos(t) {
    scene.items.forEach(function (it) {
      var v = it.stop.kind === "video" && vids[it.stop.vid], el = v && v.el; if (!el || !el.duration) return;
      var tv = vidTime(it, t, el.duration);
      if (playing && vidNear(it, t)) { if (el.paused) el.play().catch(function () {}); if (Math.abs(el.currentTime - tv) > 0.3) el.currentTime = tv; }
      else { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - tv) > 0.04) el.currentTime = tv; }
    });
  }
  // for the export: each clip decoded frame by frame (exact, and nothing to wait on from a <video>)
  var exporting = false;
  function openSinks(mb) {
    return Promise.all(scene.items.map(function (it) {
      var v = it.stop.kind === "video" && vids[it.stop.vid]; if (!v || !v.blob || v.sink) return null;
      var input = new mb.Input({ source: new mb.BlobSource(v.blob), formats: mb.ALL_FORMATS });
      return input.getPrimaryVideoTrack().then(function (track) {
        if (!track) return;
        return track.computeDuration().then(function (d) { v.sink = new mb.CanvasSink(track, { width: 1280 }); v.sinkDur = d; });
      }).catch(function () {});
    }));
  }
  function frameVideos(t) {
    return Promise.all(scene.items.map(function (it) {
      var v = it.stop.kind === "video" && vids[it.stop.vid];
      if (!v || !v.sink || !vidNear(it, t)) return null;
      return v.sink.getCanvas(vidTime(it, t, v.sinkDur)).then(function (w) { v.frame = w ? w.canvas : v.frame; }).catch(function () {});
    }));
  }

  // the area a photo zooms to: x, y, w, h as fractions of the photo, always the screen's 9:16
  function photoAspect(it) { var b = it.im ? bare(it.im) : { w: 3, h: 2 }; return b.w / b.h; }
  function zoomFit(z, ar, minW) {           // ar = photo width / height; minW: no closer than the photo's pixels allow
    var w = Math.max(minW || 0.1, Math.min(z.w, 1, (9 / 16) / ar)), h = w * ar * 16 / 9;
    return { x: Math.max(0, Math.min(1 - w, z.x)), y: Math.max(0, Math.min(1 - h, z.y)), w: w, h: h };
  }
  function zoomRect(it) {
    var ar = photoAspect(it), z = it.stop.zoom;
    if (!z) { var w = Math.min(1, (9 / 16) / ar) * 0.8; z = { x: (1 - w) / 2, y: 0, w: w }; z.y = (1 - w * ar * 16 / 9) / 2; }
    return zoomFit(z, ar, zoomMin(it));
  }
  function zoomMin(it) { return it.im ? Math.min(0.6, Math.max(0.1, 300 / bare(it.im).w)) : 0.1; }   // at least ~300 px of the photo across the screen
  function layoutPhoto(it) {
    var im = it.im, b = im ? bare(im) : { w: 3, h: 2 }, portrait = b.h > b.w;
    var pw = PHOTO[it.stop.size] || PHOTO.M; if (portrait) pw = Math.round(pw * 0.88);
    it.pw = pw; it.ph = Math.round(pw * b.h / b.w);
    it.fw = pw + 2 * 50 + 32; it.fh = it.ph + 2 * 50 + 32;
    it.total = it.fw + 36 + LABEL.w;
    it.lab = wrap(it.stop.label, LABEL.size, LABEL.track, LABEL.w - 2 * LABEL.pad);
  }
  function camAt(t) {
    var X = scene.X, f = Math.max(0, Math.min(X.length - 1, t * scene.R)), i = Math.min(X.length - 2, Math.floor(f));
    if (i < 0) return { x: X[0] || 0, yaw: 0, d: D, y: 0 };
    var fr = f - i, x = X[i] + (X[i + 1] - X[i]) * fr, v = (X[i + 1] - X[i]) * scene.R, Z = scene.Z, ZD = scene.ZD, YC = scene.YC;
    function at(A) { return A[i] + (A[i + 1] - A[i]) * fr; }
    return { x: x, yaw: YAW * Math.max(-1, Math.min(1, v / scene.V)), d: D - at(Z) - at(ZD), y: at(YC) };
  }

  /* ---------- drawing ----------
     The visitor stands D in front of the wall, looking `yaw` degrees toward where they're going;
     the point they look at is the wall at x. Planes parallel to the wall are drawn with the affine
     map of three projected corners (at a few degrees of yaw the difference from true perspective is
     invisible); the floor and the daylight are projected point by point. */
  var layers = {};
  function layer(name, w, h) {
    var c = layers[name]; if (!c) c = layers[name] = document.createElement("canvas");
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    var g = c.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); return g;
  }
  function renderScene(ctx, t, s) {
    var c = camAt(t), a = c.yaw * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cd = c.d, cx = c.x - cd * Math.tan(a), m = MOODS[reel.mood] || MOODS.day;
    function P(x, y, z) {
      var dx = x - cx, dz = z - cd, dep = dx * sa - dz * ca, xs = dx * ca + dz * sa;
      return { x: W / 2 + F * xs / dep, y: H / 2 + F * (y - c.y) / dep, k: F / dep };
    }
    function plane(x, y, z, w, h, fn) {
      var p0 = P(x, y, z), p1 = P(x + w, y, z), p2 = P(x, y + h, z);
      if (Math.max(p0.x, p1.x) < -80 || Math.min(p0.x, p1.x) > W + 80) return;
      ctx.save(); ctx.setTransform(s * (p1.x - p0.x) / w, s * (p1.y - p0.y) / w, s * (p2.x - p0.x) / h, s * (p2.y - p0.y) / h, s * p0.x, s * p0.y);
      fn(p0.k * s); ctx.restore();
    }
    function poly(g, pts, k) { g.beginPath(); pts.forEach(function (p, i) { g[i ? "lineTo" : "moveTo"](p.x * k, p.y * k); }); g.closePath(); g.fill(); }

    // the wall, then the floor running toward the visitor
    ctx.setTransform(s, 0, 0, s, 0, 0);
    var base = P(c.x, 714, 0).y, gw = ctx.createLinearGradient(0, base - 2420, 0, base);
    gw.addColorStop(0, m.wall[0]); gw.addColorStop(0.6, m.wall[1]); gw.addColorStop(1, m.wall[2]);
    ctx.fillStyle = gw; ctx.fillRect(0, 0, W, H);
    var gf = ctx.createLinearGradient(0, base, 0, H); gf.addColorStop(0, m.floor[0]); gf.addColorStop(0.3, m.floor[1]); gf.addColorStop(1, m.floor[2]);
    ctx.fillStyle = gf; poly(ctx, [P(cx - 3000, 714, 0), P(cx + 3000, 714, 0), P(cx + 300, 714, cd - 220), P(cx - 300, 714, cd - 220)], 1);
    plane(cx - 3000, 700, 1, 6000, 14, function () { ctx.fillStyle = m.base; ctx.fillRect(0, 0, 6000, 14); });

    // a soft pool of light behind each piece
    if (m.pool) scene.items.forEach(function (it) {
      plane(it.x - 650, Y - 850, 0.4, 1300, 1700, function () {
        ctx.translate(650, 0.42 * 1700); ctx.scale(1, 1.18);
        var r = ctx.createRadialGradient(0, 0, 0, 0, 0, 650); r.addColorStop(0, "rgba(255,255,255," + m.pool + ")"); r.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = r; ctx.fillRect(-650, -650, 1300, 1300);
      });
    });

    // daylight: a window behind the visitor throws its panes across the wall and the floor —
    // drawn small and scaled up, which is what softens it
    if (scene.suns.length) {
      var L = 8, lw = Math.ceil(W * s / L), lh = Math.ceil(H * s / L), g = layer("sun", lw, lh), k = s / L, any = false;
      g.fillStyle = m.sun[0];
      var t1 = Math.tan(m.sunSkew * Math.PI / 180), t2 = Math.tan(6 * Math.PI / 180);
      scene.suns.forEach(function (sx) {
        if (Math.abs(sx + 400 - c.x) > 2600) return; any = true;
        function wp(u, v) { var y1 = v + u * t2; return P(sx + u + y1 * t1, m.sunTop + y1, 0.6); }
        for (var r = 0; r < 2; r++) for (var q2 = 0; q2 < 3; q2++) {
          var u0 = q2 * 278, v0 = r * 358;
          poly(g, [wp(u0, v0), wp(u0 + 250, v0), wp(u0 + 250, v0 + 330), wp(u0, v0 + 330)], k);
        }
        g.save(); g.fillStyle = m.sun[1];
        for (var f = 0; f < 3; f++) {
          var fx = sx - 520 + f * 278 * 1.1, sk = Math.tan(32 * Math.PI / 180) * 450;
          poly(g, [P(fx - sk, 714, 420), P(fx + 275 - sk, 714, 420), P(fx + 275 + sk, 714, 1320), P(fx + sk, 714, 1320)], k);
        }
        g.restore();
      });
      if (any) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = "high"; ctx.drawImage(g.canvas, 0, 0, lw * L, lh * L); ctx.restore(); }
    }

    // the pieces
    scene.items.forEach(function (it) {
      var st = it.stop;
      if (st.kind === "video") return;                                       // projected later, over the shade
      if (st.kind === "text") {
        var T = it.T, left = it.x - T.w / 2, top = Y - it.h / 2;
        plane(left, top, 1, T.w, it.h, function () {
          setFont(ctx, T.size, T.track); ctx.fillStyle = m.ink; ctx.textBaseline = "alphabetic";
          it.lines.forEach(function (ln, i) { ctx.fillText(ln, i === 0 ? -it.hangW : 0, T.size * 0.9 + i * T.size * T.lh); });
          if (st.small) { setFont(ctx, 26, 0.01); ctx.fillStyle = m.small; ctx.fillText(st.small, 0, it.lines.length * T.size * T.lh + 40 + 22); }
        });
        return;
      }
      var left2 = it.x - it.total / 2, top2 = Y - it.fh / 2, lh2 = Math.min(it.fh, 560);
      plane(left2 + it.fw + 36, top2, 3, LABEL.w, lh2, function (k2) {     // the label
        ctx.save(); ctx.shadowColor = "rgba(40,30,40,0.12)"; ctx.shadowBlur = 30 * k2; ctx.shadowOffsetY = 12 * k2;
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(0, 0, LABEL.w, lh2, 2); ctx.fill(); ctx.restore();
        setFont(ctx, LABEL.size, LABEL.track); ctx.fillStyle = "#111";
        it.lab.forEach(function (ln, i) { ctx.fillText(ln, LABEL.pad, 26 + LABEL.size * 0.9 + i * LABEL.size * LABEL.lh); });
        setFont(ctx, 15, 0.02); ctx.fillStyle = "#9a989b"; ctx.textAlign = "right"; ctx.fillText(it.no, LABEL.w - LABEL.pad, lh2 - 26); ctx.textAlign = "left";
        if (reel.lit) lightFromAbove(ctx, LABEL.w, lh2);
      });
      plane(left2, top2, 8, it.fw, it.fh, function (k2) {                 // the frame, the mat, the photo
        ctx.save();
        if (reel.lit) { ctx.shadowColor = "rgba(20,15,20,0.4)"; ctx.shadowBlur = 80 * k2; ctx.shadowOffsetY = 56 * k2; }   // light from above: the shadow falls lower
        else { ctx.shadowColor = "rgba(20,15,20,0.3)"; ctx.shadowBlur = 64 * k2; ctx.shadowOffsetY = 30 * k2; }
        ctx.fillStyle = "#141414"; ctx.fillRect(0, 0, it.fw, it.fh);
        ctx.shadowColor = "rgba(20,15,20,0.2)"; ctx.shadowBlur = 3 * k2; ctx.shadowOffsetY = 2 * k2; ctx.fillRect(0, 0, it.fw, it.fh);
        ctx.restore();
        ctx.fillStyle = "#f7f5f0"; ctx.fillRect(16, 16, it.fw - 32, it.fh - 32);
        if (it.im) { var b = bare(it.im); ctx.drawImage(it.im, b.x, b.y, b.w, b.h, 66, 66, it.pw, it.ph); }
        ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 1; ctx.strokeRect(66.5, 66.5, it.pw - 1, it.ph - 1);
        if (reel.lit) lightFromAbove(ctx, it.fw, it.fh);
      });
    });

    // at night only the pieces are lit: a pool of light from above on each, the rest of the room in shade
    var dark = m.dark || (reel.lit ? 0.17 : 0);                           // lit: each piece in its own pool of light
    if (dark) {
      var SL = 8, sw = Math.ceil(W * s / SL), sh = Math.ceil(H * s / SL), sg = layer("shade", sw, sh), kk = s / SL;
      sg.fillStyle = "rgba(8,6,10," + dark + ")"; sg.fillRect(0, 0, sw, sh);
      sg.globalCompositeOperation = "destination-out";
      scene.items.forEach(function (it) {
        if (it.stop.kind === "video") return;                                // the projection is its own light
        var p = P(it.x, Y - 70, 0); if (p.x < -W || p.x > 2 * W) return;
        var rx = 660 * p.k * kk;
        sg.save(); sg.translate(p.x * kk, p.y * kk); sg.scale(1, 1.3);
        var r = sg.createRadialGradient(0, -rx * 0.15, 0, 0, 0, rx);
        r.addColorStop(0, "rgba(0,0,0,0.97)"); r.addColorStop(0.6, "rgba(0,0,0,0.8)"); r.addColorStop(1, "rgba(0,0,0,0)");
        sg.fillStyle = r; sg.fillRect(-rx, -rx, 2 * rx, 2 * rx); sg.restore();
      });
      sg.globalCompositeOperation = "source-over";
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = "high"; ctx.drawImage(sg.canvas, 0, 0, sw * SL, sh * SL); ctx.restore();
    }
    // projections: light thrown on the wall — the wall shows through the darks, a hotspot in the middle,
    // a little spill around the edges, and in a dim room the beam itself
    scene.items.forEach(function (it) {
      if (it.stop.kind !== "video") return;
      var v = vids[it.stop.vid], el = v && v.el, vw = it.vw, vh = it.vh, l = it.x - vw / 2, tp = Y - vh / 2, dim = m.dark ? 1 : m.grade ? 0.5 : 0.2;
      var c0 = P(l, tp, 0.8), c1 = P(l + vw, tp, 0.8), c2 = P(l + vw, tp + vh, 0.8), c3 = P(l, tp + vh, 0.8);
      if (c1.x < -200 || c0.x > W + 200) return;
      ctx.save(); ctx.setTransform(s, 0, 0, s, 0, 0); ctx.globalCompositeOperation = "screen";
      var src = { x: W / 2, y: -520 }, gb = ctx.createLinearGradient(src.x, src.y, (c0.x + c2.x) / 2, (c0.y + c2.y) / 2);
      gb.addColorStop(0, "rgba(255,250,240,0)"); gb.addColorStop(1, "rgba(255,250,240," + (0.07 * dim) + ")");
      ctx.fillStyle = gb; ctx.beginPath(); ctx.moveTo(src.x - 30, src.y); ctx.lineTo(c0.x, c0.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(src.x + 30, src.y); ctx.closePath(); ctx.fill();
      ctx.restore();
      plane(l - 220, tp - 220, 0.7, vw + 440, vh + 440, function () {         // spill
        var rx = (vw + 440) / 2; ctx.translate(rx, (vh + 440) / 2); ctx.scale(1, (vh + 440) / (vw + 440));
        var g = ctx.createRadialGradient(0, 0, rx * 0.35, 0, 0, rx);
        g.addColorStop(0, "rgba(255,252,246," + (0.16 + 0.12 * dim) + ")"); g.addColorStop(1, "rgba(255,252,246,0)");
        ctx.fillStyle = g; ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
      });
      plane(l, tp, 0.8, vw, vh, function () {
        ctx.fillStyle = "rgba(255,253,248,0.22)"; ctx.fillRect(0, 0, vw, vh);
        var img = exporting ? v && v.frame : el && el.readyState >= 2 && el;
        if (img) { ctx.globalAlpha = 0.74 + 0.24 * dim; ctx.drawImage(img, 0, 0, vw, vh); ctx.globalAlpha = 1; }
        else { setFont(ctx, 28, 0); ctx.fillStyle = m.small; ctx.textAlign = "center"; ctx.fillText(v && v.missing ? "Video missing — choose it again" : "Loading the video…", vw / 2, vh / 2); ctx.textAlign = "left"; }
        var hs = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, vw * 0.62);
        hs.addColorStop(0, "rgba(255,255,255,0.1)"); hs.addColorStop(1, "rgba(0,0,0,0.22)");
        ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = hs; ctx.fillRect(0, 0, vw, vh); ctx.globalCompositeOperation = "source-over";
        if (it.stop.label) { setFont(ctx, 26, 0.01); ctx.fillStyle = m.small; ctx.fillText(it.stop.label, 0, vh + 52); }
      });
    });

    if (m.grade) { ctx.save(); ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = m.grade; ctx.fillRect(0, 0, W, H); ctx.restore(); }

    // pillars between the visitor and the wall, out of focus (drawn small and scaled up)
    if (scene.pillars.length) {
      var PL = 14, pw2 = Math.ceil(W * s / PL), ph2 = Math.ceil(H * s / PL), pg = null;
      scene.pillars.forEach(function (px) {
        var a0 = P(px, -1986, 1020), a1 = P(px + 210, 714, 1020);
        if (a0.k <= 0 || a0.k > 12 || a1.x < -60 || a0.x > W + 60) return;          // not behind the visitor, nor in their face
        pg = pg || layer("pillar", pw2, ph2);
        var gr = pg.createLinearGradient(a0.x * s / PL, 0, a1.x * s / PL, 0);
        gr.addColorStop(0, m.pillar[0]); gr.addColorStop(0.18, m.pillar[1]); gr.addColorStop(0.6, m.pillar[2]); gr.addColorStop(1, m.pillar[3]);
        pg.fillStyle = gr; pg.fillRect(a0.x * s / PL, a0.y * s / PL, (a1.x - a0.x) * s / PL, (a1.y - a0.y) * s / PL);
      });
      if (pg) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = "high"; ctx.drawImage(pg.canvas, 0, 0, pw2 * PL, ph2 * PL); ctx.restore(); }
    }
  }
  // the frame as it goes out: the scene, then what the camera does to it, then what goes over it
  function render(ctx, t, s) {
    renderScene(ctx, t, s);
    if (reel.mblur !== false) smear(ctx, t, s);
    if (reel.film) film(ctx, t, s);
  }
  function lightFromAbove(ctx, w, h) {                  // brighter at the top, falling off below
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,248,236,0.16)"); g.addColorStop(0.45, "rgba(255,248,236,0)"); g.addColorStop(1, "rgba(10,8,12,0.14)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  // motion blur: the picture smeared along the way the camera moves, over a 1/60 s shutter
  function smear(ctx, t, s) {
    var c1 = camAt(t), c0 = camAt(t - 1 / 60), L = (c1.x - c0.x) * F / c1.d * s;
    if (Math.abs(L) < 1.2 || c1.d < D - 1 || c0.d < D - 1) return;      // only the walk, not stepping closer or zooming
    var cv = ctx.canvas, g = layer("smear", cv.width, cv.height); g.drawImage(cv, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    [-0.5, 0.5, -0.3, 0.3, -0.1, 0.1].forEach(function (o, i) { ctx.globalAlpha = 1 / (i + 2); ctx.drawImage(g.canvas, o * L, 0); });
    ctx.restore();
  }

  // film: blacks lifted a touch, a warm cast in the lights and cool in the shade, a soft vignette, and
  // grain that changes every frame (seeded by the frame, so the preview and the export match)
  var grainTiles = null;
  function film(ctx, t, s) {
    if (!grainTiles) {
      grainTiles = [];
      for (var g = 0; g < 8; g++) {
        var c = document.createElement("canvas"); c.width = c.height = 256;
        var x = c.getContext("2d"), d = x.createImageData(256, 256), r = 99991 * (g + 1);
        for (var i = 0; i < d.data.length; i += 4) { r = (r * 16807) % 2147483647; var v = 128 + ((r / 2147483647) - 0.5) * 120; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
        x.putImageData(d, 0, 0); grainTiles.push(c);
      }
    }
    var w = W * s, h = H * s, f = Math.floor(t * 24);                         // grain at film's 24 frames a second
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "screen"; ctx.fillStyle = "rgb(26,23,22)"; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = "rgba(255,196,140,0.16)"; ctx.fillRect(0, 0, w, h);
    var vg = ctx.createRadialGradient(w / 2, h * 0.46, h * 0.28, w / 2, h * 0.46, h * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(20,24,34,0.42)");
    ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    var tile = grainTiles[f % 8], ox = (f * 97) % 256, oy = (f * 61) % 256, sc = Math.max(1, s * 1.4);
    ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.22;
    ctx.translate(-ox * sc, -oy * sc); ctx.scale(sc, sc); ctx.fillStyle = ctx.createPattern(tile, "repeat"); ctx.fillRect(0, 0, w / sc + 512, h / sc + 512);
    ctx.restore();
  }

  /* ---------- the sound: footsteps every stride while walking, a gallery's echo, low room air ---------- */
  var soundCache = { key: "", buf: null };
  function noise(ac, secs, seed) {
    var b = ac.createBuffer(1, Math.ceil(secs * ac.sampleRate), ac.sampleRate), d = b.getChannelData(0), x = seed || 1;
    for (var i = 0; i < d.length; i++) { x = (x * 16807) % 2147483647; d[i] = x / 1073741823.5 - 1; }
    return b;
  }
  // the walk's sound, then your file or voice laid over it
  var mixCache = { key: "", buf: null };
  function soundtrack() {
    var a = reel.audio, sv = stepsVol(), key = JSON.stringify([reel.stops.map(function (s) { return [s.hold, !!s.lean]; }), scene.end, reel.pace, reel.steps, sv, a, user.id]);
    if (mixCache.key === key) return Promise.resolve(mixCache.buf);
    return walkSound().then(function (base) {
      var u = a && user.buf;
      if (!u && sv === 1) { mixCache = { key: key, buf: base }; return base; }
      var SR = base.sampleRate, out = new AudioBuffer({ numberOfChannels: 2, length: base.length, sampleRate: SR });
      var off = Math.round((u && a.start || 0) * SR), fadeIn = Math.round(0.05 * SR), fadeOut = Math.round(1.5 * SR), peak = 0;
      var walkGain = (u ? 0.6 : 1) * sv;                                      // under music the footsteps sit a little lower
      for (var ch = 0; ch < 2; ch++) {
        var o = out.getChannelData(ch), b = base.getChannelData(ch), uc = u && u.getChannelData(Math.min(ch, u.numberOfChannels - 1));
        for (var i = 0; i < o.length; i++) {
          var j = i + off, v = uc && j < uc.length ? uc[j] * a.vol * Math.min(1, i / fadeIn, (o.length - 1 - i) / fadeOut) : 0;
          o[i] = b[i] * walkGain + v; if (Math.abs(o[i]) > peak) peak = Math.abs(o[i]);
        }
      }
      // a soft ceiling: anything over 0.8 is rounded off toward 1 (turned-up footsteps stay clean)
      if (peak > 0.8) for (var c3 = 0; c3 < 2; c3++) {
        var oc = out.getChannelData(c3);
        for (var k = 0; k < oc.length; k++) { var x = oc[k], ax = Math.abs(x); if (ax > 0.8) oc[k] = (x < 0 ? -1 : 1) * (0.8 + 0.2 * Math.tanh((ax - 0.8) / 0.2)); }
      }
      mixCache = { key: key, buf: out }; return out;
    });
  }
  function stepsVol() { return reel.stepsVol == null ? 1 : +reel.stepsVol; }
  function walkSound() {
    var key = JSON.stringify([reel.stops.map(function (s) { return [s.hold, !!s.lean]; }), scene.end, reel.pace, reel.steps]);
    if (soundCache.key === key) return Promise.resolve(soundCache.buf);
    var SR = 48000, len = Math.ceil((scene.dur + 0.3) * SR), ac = new OfflineAudioContext(2, len, SR);
    var dry = ac.createGain(), wet = ac.createGain(), verb = ac.createConvolver();
    dry.connect(ac.destination); verb.connect(wet); wet.connect(ac.destination); dry.connect(verb); wet.gain.value = 0.32;
    var ir = ac.createBuffer(2, Math.ceil(1.7 * SR), SR);           // a dense tail, darkening as it decays
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch), lp = 0, x = 7 + ch;
      for (var i = 0; i < d.length; i++) { x = (x * 16807) % 2147483647; lp += 0.35 * ((x / 1073741823.5 - 1) - lp); d[i] = i < 0.012 * SR ? 0 : lp * Math.exp(-i / SR / 0.38); }
    }
    verb.buffer = ir;
    var air = ac.createBufferSource(), airF = ac.createBiquadFilter(), airG = ac.createGain();   // the room
    air.buffer = noise(ac, scene.dur + 0.3, 3); airF.type = "lowpass"; airF.frequency.value = 180; airG.gain.value = 0.05;
    air.connect(airF); airF.connect(airG); airG.connect(ac.destination); air.start(0);
    if (reel.steps) {
      var nb = noise(ac, 0.2, 11), stride = STRIDE * scene.V / PACE.normal, next = stride / 2, X = scene.X, Z = scene.Z, n = 0, rnd = 5, walked = 0;
      for (var j = 1; j < X.length; j++) {
        if (scene.ZD[j] > 0.5 || scene.ZD[j - 1] > 0.5) continue;              // a detail is the camera, not the feet
        walked += Math.hypot(X[j] - X[j - 1], Z[j] - Z[j - 1]);              // stepping in to a photo and back counts too
        if (walked < next) continue;
        next += stride; n++;
        var t = j / scene.R; rnd = (rnd * 16807) % 2147483647; var amp = 0.5 * (0.85 + 0.3 * rnd / 2147483647);
        var pan = ac.createStereoPanner(); pan.pan.value = n % 2 ? 0.12 : -0.12; pan.connect(dry);
        [[700, 0.016, 1, 0], [2200, 0.009, 0.5, 0.075 + 0.02 * (rnd % 100) / 100]].forEach(function (p) {   // heel, then toe
          var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), at = t + p[3];
          src.buffer = nb; f.type = "lowpass"; f.frequency.value = p[0];
          g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp * p[2], at + 0.002); g.gain.setTargetAtTime(0, at + 0.002, p[1]);
          src.connect(f); f.connect(g); g.connect(pan); src.start(at, (n * 0.013) % 0.1); src.stop(at + 0.15);
        });
        var o = ac.createOscillator(), og = ac.createGain();            // the weight of the heel
        o.frequency.value = 62; og.gain.setValueAtTime(amp * 0.5, t); og.gain.setTargetAtTime(0, t, 0.025);
        o.connect(og); og.connect(pan); o.start(t); o.stop(t + 0.2);
      }
    }
    return ac.startRendering().then(function (buf) {
      var peak = 0, fade = Math.floor(0.4 * SR);
      for (var c = 0; c < 2; c++) { var d2 = buf.getChannelData(c); for (var i2 = 0; i2 < d2.length; i2++) peak = Math.max(peak, Math.abs(d2[i2])); }
      var gain = peak ? 0.8 / peak : 1;                                     // loud enough to be heard under a song
      for (var c2 = 0; c2 < 2; c2++) {
        var e = buf.getChannelData(c2);
        for (var i3 = 0; i3 < e.length; i3++) e[i3] *= gain * Math.min(1, i3 / fade, (e.length - 1 - i3) / fade);
      }
      soundCache = { key: key, buf: buf }; return buf;
    });
  }

  /* ---------- the preview ---------- */
  var view = $("view"), vctx = view.getContext("2d"), now = 0, playing = false, ac = null, node = null, t0 = 0, raf = 0, run = 0;
  function sizeView() {
    var r = view.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    view.width = Math.round(r.width * dpr); view.height = Math.round(r.width * dpr * H / W);
  }
  function paint() { if (scene) { syncVideos(now); render(vctx, now, view.width / W); transport(); } }
  function fmt(t) { t = Math.max(0, t); return Math.floor(t / 60) + ":" + ("0" + Math.floor(t % 60)).slice(-2); }
  function transport() {
    var p = scene.dur ? now / scene.dur : 0;
    $("fill").style.width = p * 100 + "%"; $("knob").style.left = p * 100 + "%";
    $("time").textContent = fmt(now) + " / " + fmt(scene.dur);
  }
  function ticks() {
    var sc = $("scrub"); sc.querySelectorAll(".tick").forEach(function (e) { e.remove(); });
    scene.holds.forEach(function (h) { var i = document.createElement("span"); i.className = "tick"; i.style.left = (h / scene.dur * 100) + "%"; sc.appendChild(i); });
  }
  function seek(t) { now = Math.max(0, Math.min(scene.dur, t)); if (playing) { stop(); play(); } else paint(); }
  function play(o) {
    if (now >= scene.dur - 0.05) now = 0;
    playing = true; $("phone").classList.add("is-playing"); $("play").setAttribute("aria-label", "Pause");
    var startAt = now, begin = performance.now(), my = ++run;
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    var silent = o && o.silent, withYt = !silent && ytOn(), waiting = withYt, frames = 0;
    function sound() {
      if (silent) return;
      soundtrack().then(function (buf) {
        if (!playing || my !== run) return;
        node = ac.createBufferSource(); node.buffer = buf; node.connect(ac.destination);
        t0 = ac.currentTime - now; node.start(0, now);
      });
    }
    if (withYt) ytPlay(now); else sound();
    (function loop() {
      // with a YouTube song, the walk waits for it to start, then sets off with it
      if (waiting) {
        if (my !== run) return;
        if (ytPlaying() || performance.now() - begin > 4000) { waiting = false; begin = performance.now(); sound(); }
        else { raf = requestAnimationFrame(loop); return; }
      }
      // the picture follows the sound once it's playing, the wall clock until then
      now = node && ac ? ac.currentTime - t0 : startAt + (performance.now() - begin) / 1000;
      if (withYt && ++frames % 30 === 0) ytSync(now);
      if (now >= scene.dur) { now = scene.dur; paint(); stop(); if (rec) rec.stop(); return; }
      paint(); raf = requestAnimationFrame(loop);
    })();
  }
  function stop() {
    playing = false; cancelAnimationFrame(raf); $("phone").classList.remove("is-playing"); $("play").setAttribute("aria-label", "Play");
    if (node) { try { node.stop(); } catch (e) {} node.disconnect(); node = null; }
    ytPause();
  }
  function wireTransport() {
    $("play").addEventListener("click", function () { if (rec) { rec.stop(); return; } playing ? stop() : play(); });
    var sc = $("scrub");
    function at(e) { var r = sc.getBoundingClientRect(); return (e.clientX - r.left) / r.width * scene.dur; }
    sc.addEventListener("pointerdown", function (e) {
      sc.setPointerCapture(e.pointerId); var was = playing; stop(); now = Math.max(0, Math.min(scene.dur, at(e))); paint();
      function mv(ev) { now = Math.max(0, Math.min(scene.dur, at(ev))); paint(); }
      function up() { sc.removeEventListener("pointermove", mv); sc.removeEventListener("pointerup", up); if (was) play(); }
      sc.addEventListener("pointermove", mv); sc.addEventListener("pointerup", up);
    });
    sc.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { seek(now + 1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { seek(now - 1); e.preventDefault(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === " " && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) { playing ? stop() : play(); e.preventDefault(); }
    });
    addEventListener("resize", function () { sizeView(); paint(); });
  }

  /* ---------- the editor ---------- */
  function changed(keepTime) {
    persist(); build(); ticks();
    if (!keepTime) now = scene.holds[sel] + Math.min(0.5, reel.stops[sel].hold / 2);
    if (playing) { stop(); play(); } else paint();
    list(); $("count").textContent = fmt(scene.dur) + " · " + reel.stops.length + " stops";
    $("fitNote").hidden = !(scene.fit && scene.dur > scene.fit + 0.5);
    $("fitNote").textContent = "Too many stops for " + scene.fit + " s at a walk — it comes to " + Math.round(scene.dur) + " s. Remove a stop or two.";
  }
  function firstLine(s) { return s.kind === "photo" ? s.label.split("\n").join(" ") : s.kind === "video" ? (s.label || s.name || "Video") : s.text.split("\n").join(" "); }
  var KIND = { photo: "Photo", text: "Wall text", video: "Projection" };
  function list() {
    var ol = $("stops"); ol.innerHTML = "";
    $("stopCount").textContent = reel.stops.length;
    reel.stops.forEach(function (s, i) {
      var li = document.createElement("li"); li.className = "stop"; li.draggable = true; li.setAttribute("aria-selected", i === sel);
      var th = s.kind === "photo" ? document.createElement("img") : document.createElement("span");
      th.className = "th"; if (s.kind === "photo") { th.src = s.src; th.alt = ""; } else th.textContent = s.kind === "video" ? "▶" : "Aa";
      var tx = document.createElement("span"); tx.className = "tx";
      var b = document.createElement("b"); b.textContent = firstLine(s);
      var e = scene && scene.eff ? scene.eff[i] : s.hold, miss = s.kind === "video" && vids[s.vid] && vids[s.vid].missing;
      var sm = document.createElement("small"); sm.textContent = miss ? "Video missing" : KIND[s.kind] + " · " + e.toFixed(1) + " s";
      tx.appendChild(b); tx.appendChild(sm);
      var grip = document.createElement("span"); grip.className = "grip"; grip.setAttribute("aria-hidden", "true");
      li.appendChild(th); li.appendChild(tx); li.appendChild(grip);
      li.addEventListener("click", function () { select(i); });
      li.addEventListener("dragstart", function (e) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); li.classList.add("drag"); });
      li.addEventListener("dragend", function () { li.classList.remove("drag"); });
      li.addEventListener("dragover", function (e) {
        e.preventDefault(); var r = li.getBoundingClientRect(), top = e.clientY < r.top + r.height / 2;
        li.classList.toggle("over-top", top); li.classList.toggle("over-bottom", !top);
      });
      li.addEventListener("dragleave", function () { li.classList.remove("over-top", "over-bottom"); });
      li.addEventListener("drop", function (e) {
        e.preventDefault(); var from = +e.dataTransfer.getData("text/plain"), r = li.getBoundingClientRect();
        var to = i + (e.clientY < r.top + r.height / 2 ? 0 : 1); if (to > from) to--;
        move(from, to);
      });
      ol.appendChild(li);
    });
  }
  function move(from, to) {
    if (to < 0 || to >= reel.stops.length || from === to) { list(); return; }
    var s = reel.stops.splice(from, 1)[0]; reel.stops.splice(to, 0, s); sel = to; inspector(); changed();
  }
  function select(i) { sel = Math.max(0, Math.min(reel.stops.length - 1, i)); stop(); now = scene.holds[sel] + Math.min(0.5, reel.stops[sel].hold / 2); paint(); list(); inspector(); }
  function seg(el, value, onPick) {
    el.querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.v === value);
      b.onclick = function () { el.querySelectorAll("button").forEach(function (o) { o.setAttribute("aria-pressed", o === b); }); onPick(b.dataset.v); };
    });
  }
  function inspector() {
    var s = reel.stops[sel], box = $("inspector"); box.innerHTML = "";
    var h = document.createElement("h3"); h.innerHTML = "Stop " + (sel + 1) + ' <span class="val"></span>'; h.querySelector(".val").textContent = KIND[s.kind];
    box.appendChild(h);
    function field(label, value, multi, onInput) {
      var l = document.createElement("label"); l.className = "field"; var sp = document.createElement("span"); sp.textContent = label;
      var inp = document.createElement(multi ? "textarea" : "input"); if (!multi) inp.type = "text"; inp.value = value; inp.spellcheck = true;
      var tm; inp.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(function () { onInput(inp.value); changed(true); }, 160); });
      l.appendChild(sp); l.appendChild(inp); box.appendChild(l); return inp;
    }
    function segRow(label, opts, value, onPick) {
      var r = document.createElement("div"); r.className = "row"; r.innerHTML = "<span></span>"; r.firstChild.textContent = label;
      var sg = document.createElement("div"); sg.className = "seg";
      opts.forEach(function (o) { var b = document.createElement("button"); b.type = "button"; b.dataset.v = o[0]; b.textContent = o[1]; sg.appendChild(b); });
      r.appendChild(sg); box.appendChild(r); seg(sg, value, function (v) { onPick(v); changed(); });
    }
    if (s.kind === "photo") {
      var pb = document.createElement("button"); pb.type = "button"; pb.className = "pickbtn";
      pb.innerHTML = '<img alt="" /><span><b>Photo</b><small>Change the picture</small></span>'; pb.querySelector("img").src = s.src;
      pb.addEventListener("click", function () { photoPicker(function (p) { s.src = p.src; s.label = labelOf(p.note); inspector(); changed(); }, s.src); });
      box.appendChild(pb);
      field("Label", s.label, true, function (v) { s.label = v; });
      segRow("Size", [["S", "Small"], ["M", "Medium"], ["L", "Large"]], s.size, function (v) { s.size = v; });
      var lr = document.createElement("div"); lr.className = "row"; lr.innerHTML = '<span>Step closer</span><input class="switch" type="checkbox" role="switch" aria-label="Step closer to this photo" />';
      var ls = lr.querySelector("input"); ls.checked = !!s.lean;
      ls.addEventListener("change", function () { s.lean = ls.checked; if (s.lean) s.zoomOn = false; if (s.lean && s.hold < 2.8) s.hold = 2.8; inspector(); changed(); });
      box.appendChild(lr);
      var zr = document.createElement("div"); zr.className = "row"; zr.innerHTML = '<span>Zoom in</span><input class="switch" type="checkbox" role="switch" aria-label="Zoom in to this photo" />';
      var zs = zr.querySelector("input"); zs.checked = !!s.zoomOn;
      zs.addEventListener("change", function () { s.zoomOn = zs.checked; if (s.zoomOn) s.lean = false; if (s.zoomOn && s.hold < 3.6) s.hold = 3.6; inspector(); changed(); });
      box.appendChild(zr);
      if (s.zoomOn) box.appendChild(zoomFramer(s));
    } else if (s.kind === "video") {
      var vb = document.createElement("button"); vb.type = "button"; vb.className = "pickbtn";
      vb.innerHTML = '<span class="th" style="width:48px;height:48px">▶</span><span><b></b><small>Choose another video</small></span>';
      vb.querySelector("b").textContent = s.name || "Video"; vb.addEventListener("click", function () { pickVideo(s); });
      box.appendChild(vb);
      field("Caption", s.label || "", false, function (v) { s.label = v; });
      segRow("Size", [["S", "Small"], ["M", "Medium"], ["L", "Large"]], s.size, function (v) { s.size = v; });
    } else {
      field("Text", s.text, true, function (v) { s.text = v; });
      var ch = document.createElement("button"); ch.type = "button"; ch.className = "link"; ch.style.alignSelf = "flex-start"; ch.textContent = "Choose from the text";
      ch.addEventListener("click", function () {
        articlePicker(function (t) { s.text = t; if (t.split(/\s+/).length > 12) s.size = "M"; inspector(); changed(); });
      });
      box.appendChild(ch);
      field("Small line", s.small || "", false, function (v) { s.small = v; });
      segRow("Size", [["L", "Large"], ["M", "Medium"]], s.size, function (v) { s.size = v; });
    }
    var hr = document.createElement("div"); hr.className = "row"; hr.innerHTML = '<span>Stop for</span><div class="hold"><input type="range" min="0.4" max="' + (s.kind === "video" ? 10 : 4) + '" step="0.1" aria-label="Seconds stopped here" /><output></output></div>';
    var rg = hr.querySelector("input"), out = hr.querySelector("output"); rg.value = s.hold; out.textContent = s.hold.toFixed(1) + " s";
    rg.addEventListener("input", function () { s.hold = +rg.value; out.textContent = s.hold.toFixed(1) + " s"; });
    rg.addEventListener("change", function () { changed(); });
    box.appendChild(hr);
    if (+reel.fit && scene.eff) { var fn = document.createElement("p"); fn.className = "note"; fn.textContent = "Fitted to " + reel.fit + " s: stops here " + scene.eff[sel].toFixed(1) + " s."; box.appendChild(fn); }
    var mv = document.createElement("div"); mv.className = "moves";
    [["Earlier", function () { move(sel, sel - 1); }], ["Later", function () { move(sel, sel + 1); }], ["Remove", function () {
      if (reel.stops.length < 2) return;
      var gone = reel.stops[sel]; if (gone.vid) idbDo("readwrite", function (os) { return os.delete(topic.slug + ":video:" + gone.vid); }).catch(function () {});
      reel.stops.splice(sel, 1); sel = Math.min(sel, reel.stops.length - 1); inspector(); changed();
    }]].forEach(function (m, i) { var b = document.createElement("button"); b.type = "button"; b.className = "link" + (i === 2 ? " danger" : ""); b.textContent = m[0]; b.addEventListener("click", m[1]); mv.appendChild(b); });
    box.appendChild(mv);
  }
  // framing the zoom: the photo, and on it the 9:16 window the screen will fill — drag it, or its corner to size it
  function zoomFramer(st) {
    var it = scene.items[sel], wrap = document.createElement("div"); wrap.className = "framer";
    if (!it || !it.im) { wrap.textContent = "Loading the photo…"; return wrap; }
    var b = bare(it.im), ar = b.w / b.h, cv = document.createElement("canvas"), win = document.createElement("div"), knob = document.createElement("i");
    cv.width = 600; cv.height = Math.round(600 / ar); cv.getContext("2d").drawImage(it.im, b.x, b.y, b.w, b.h, 0, 0, cv.width, cv.height);
    win.className = "framer-win"; knob.className = "framer-knob"; win.appendChild(knob); wrap.appendChild(cv); wrap.appendChild(win);
    var z = zoomRect(it);
    function show() { win.style.left = z.x * 100 + "%"; win.style.top = z.y * 100 + "%"; win.style.width = z.w * 100 + "%"; win.style.height = z.h * 100 + "%"; }
    show();
    win.addEventListener("pointerdown", function (e) {
      e.preventDefault(); win.setPointerCapture(e.pointerId);
      var r = wrap.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, z0 = { x: z.x, y: z.y, w: z.w }, resize = e.target === knob;
      function mv(ev) {
        var dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
        z = zoomFit(resize ? { x: z0.x, y: z0.y, w: z0.w + dx } : { x: z0.x + dx, y: z0.y + dy, w: z0.w }, ar, zoomMin(it)); show();
      }
      function up() {
        win.removeEventListener("pointermove", mv); win.removeEventListener("pointerup", up);
        st.zoom = { x: +z.x.toFixed(4), y: +z.y.toFixed(4), w: +z.w.toFixed(4) }; changed();
      }
      win.addEventListener("pointermove", mv); win.addEventListener("pointerup", up);
    });
    var note = document.createElement("p"); note.className = "note"; note.textContent = "Drag the frame to choose what fills the screen; drag its corner to zoom closer (as close as the photo stays sharp).";
    var out = document.createElement("div"); out.appendChild(wrap); out.appendChild(note); return out;
  }
  // the article, to take words from: click a sentence, or select any passage and use it
  function articlePicker(onPick) {
    openPicker("Choose from the text", function (body) {
      var bar = document.createElement("div"); bar.className = "usebar";
      bar.innerHTML = '<span>Click a sentence, or select any passage.</span><button class="btn-use" type="button" disabled>Use selection</button>';
      var use = bar.querySelector("button"), art = document.createElement("div"); art.className = "article";
      function pick(t) { t = t.replace(/\s+/g, " ").trim(); if (t) { closePicker(); onPick(t); } }
      function para(text, cls) {
        var p = document.createElement("p"); if (cls) p.className = cls;
        (text.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [text]).forEach(function (sn) {
          var sp = document.createElement("span"); sp.className = "sent"; sp.textContent = sn;
          sp.addEventListener("click", function () { var sel = getSelection(); if (sel && String(sel).trim()) return; pick(sn); });
          p.appendChild(sp);
        });
        art.appendChild(p);
      }
      (topic.blocks || []).forEach(function (b) {
        if (b.type === "text") String(b.html || "").split(/<\/p>|<br\s*\/?>/i).forEach(function (h) { var t = plain(h); if (t) para(t, b.head ? "head" : ""); });
        if (b.type === "quote" && b.text) para("“" + plain(b.text) + "”", "quote");
        if (b.type === "hand" && b.text) para(b.text.replace(/\n/g, " "), "hand");
      });
      function selected() { var sel = getSelection(); return sel && art.contains(sel.anchorNode) ? String(sel) : ""; }
      document.addEventListener("selectionchange", function on() {
        if ($("picker").hidden) { document.removeEventListener("selectionchange", on); return; }
        use.disabled = !selected().trim();
      });
      use.addEventListener("click", function () { pick(selected()); });
      body.appendChild(bar); body.appendChild(art);
    });
  }
  function openPicker(title, fill) {
    $("pickerTitle").textContent = title; var body = $("pickerBody"); body.innerHTML = ""; fill(body);
    $("picker").hidden = false; $("scrim").hidden = false;
  }
  function closePicker() { $("picker").hidden = true; $("scrim").hidden = true; }
  function photoPicker(onPick, current) {
    openPicker("Choose a photo", function (body) {
      var grid = document.createElement("div"); grid.className = "photos";
      photos().forEach(function (p) {
        var b = document.createElement("button"); b.type = "button"; b.className = "ph"; b.setAttribute("aria-pressed", p.src === current);
        var im = document.createElement("img"); im.src = p.src; im.alt = p.note || ""; im.loading = "lazy"; b.appendChild(im);
        b.addEventListener("click", function () { closePicker(); onPick(p); });
        grid.appendChild(b);
      });
      body.appendChild(grid);
    });
  }
  var videoFor = null;
  function pickVideo(st) { videoFor = st || null; $("videoFile").click(); }
  function gotVideo(f) {
    var st = videoFor, isNew = !st;
    if (isNew) st = { kind: "video", vid: "v" + Date.now().toString(36), size: "M", hold: 4, label: "" };
    st.name = f.name.replace(/\.[^.]+$/, "");
    idbDo("readwrite", function (os) { return os.put(f, topic.slug + ":video:" + st.vid); }).catch(function () {});
    setVideo(st, f);
    if (isNew) insert(st); else { inspector(); changed(true); }
  }
  function insert(stop) { sel = sel + 1; reel.stops.splice(sel, 0, stop); inspector(); changed(); }   // right after the stop you're on
  function wireEditor() {
    $("addPhoto").addEventListener("click", function () { photoPicker(function (p) { insert({ kind: "photo", src: p.src, label: labelOf(p.note), size: "M", hold: 1.3 }); }); });
    $("addVideo").addEventListener("click", function () { pickVideo(null); });
    $("videoFile").addEventListener("change", function () { var f = $("videoFile").files[0]; $("videoFile").value = ""; if (f) gotVideo(f); });
    $("addText").addEventListener("click", function () { insert({ kind: "text", size: "L", hold: 1.6, text: "Your words here.", small: "" }); });
    $("addLine").addEventListener("click", function () {
      articlePicker(function (t) { var long = t.split(/\s+/).length > 12; insert({ kind: "text", size: long ? "M" : "L", hold: long ? 2.4 : 1.6, text: t, small: "" }); });
    });
    $("pickerDone").addEventListener("click", closePicker); $("scrim").addEventListener("click", closePicker);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("picker").hidden) closePicker(); });
    $("reset").addEventListener("click", function () { if (confirm("Start over from the topic? Your changes to this reel will be lost.")) { reel = defaults(); sel = 0; settings(); inspector(); changed(); } });
    $("topic").addEventListener("change", function () { location.search = "?t=" + encodeURIComponent($("topic").value); });
  }
  function settings() {
    seg($("pace"), reel.pace, function (v) { reel.pace = v; changed(true); });
    seg($("fit"), String(reel.fit || 0), function (v) { reel.fit = +v; inspector(); changed(true); });
    reel.beat = reel.beat || { on: false, bpm: 0, phase: 0, src: "" };
    $("beatOn").checked = !!reel.beat.on;
    $("beatOn").onchange = function () { reel.beat.on = $("beatOn").checked; beatUI(); changed(true); };
    beatUI();
    function sunRow() { $("sunRow").hidden = !(MOODS[reel.mood] || MOODS.day).sun; }
    seg($("mood"), reel.mood || "day", function (v) { reel.mood = v; sunRow(); changed(true); }); sunRow();
    audioUI();
    $("mblur").checked = reel.mblur !== false; $("mblur").onchange = function () { reel.mblur = $("mblur").checked; changed(true); };
    ["steps", "sun", "pillars", "film", "lit"].forEach(function (k) { $(k).checked = !!reel[k]; $(k).onchange = function () { reel[k] = $(k).checked; stepsUI(); changed(true); }; });
    function stepsUI() { $("stepsVolRow").hidden = !reel.steps; $("stepsVol").value = stepsVol(); $("stepsVolOut").textContent = Math.round(stepsVol() * 100) + "%"; }
    $("stepsVol").oninput = function () { reel.stepsVol = +$("stepsVol").value; stepsUI(); };
    $("stepsVol").onchange = function () { changed(true); };
    stepsUI();
  }

  /* ---------- on the beat: tap along, or read the tempo from your file ---------- */
  function beatUI() {
    var bt = reel.beat; $("beatBox").hidden = !bt.on;
    if (document.activeElement !== $("bpm")) $("bpm").value = bt.bpm ? Math.round(bt.bpm * 10) / 10 : "";
    $("beatNote").textContent = !bt.bpm ? "Play the reel and tap along a few times, or add a music file."
      : bt.src === "file" ? "Read from your file. Each stop now arrives on a beat." : bt.src === "tap" ? "From your taps. Each stop now arrives on a beat." : "Each stop now arrives on a beat.";
  }
  var taps = [], tapTimer = 0;
  function tap() {
    if (!playing) { taps = []; play(); return; }                        // the first tap starts the music
    if (taps.length && now - taps[taps.length - 1] > 2) taps = [];
    taps.push(now); $("tap").textContent = "Tap (" + taps.length + ")";
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function () {                                // a pause in the tapping applies it
      $("tap").textContent = "Tap";
      if (taps.length < 4) { $("beatNote").textContent = "Tap at least 4 times."; return; }
      var iv = taps.slice(1).map(function (t, i) { return t - taps[i]; }).sort(function (a, b) { return a - b; }), per = iv[iv.length >> 1];
      var sx = 0, sy = 0; taps.forEach(function (t) { var a = 2 * Math.PI * t / per; sx += Math.cos(a); sy += Math.sin(a); });
      var ph = (Math.atan2(sy, sx) / (2 * Math.PI) * per + per) % per;
      reel.beat.bpm = 60 / per; reel.beat.phase = ph; reel.beat.src = "tap"; beatUI(); changed(true);
    }, 1800);
  }
  // tempo from a file: onsets (rises in loudness), the lag they repeat at best, then where the beats fall
  function detectBeat(buf) {
    var sr = buf.sampleRate, hop = 512, a = buf.getChannelData(0), b = buf.getChannelData(Math.min(1, buf.numberOfChannels - 1));
    var n = Math.min(Math.floor(a.length / hop), Math.floor(90 * sr / hop)), env = new Float32Array(n), prev = 0;
    for (var i = 0; i < n; i++) {
      var e = 0; for (var j = i * hop; j < (i + 1) * hop; j++) { var x = (a[j] + b[j]) / 2; e += x * x; }
      e = Math.log(1e-6 + e); env[i] = Math.max(0, e - prev); prev = e;
    }
    var fps = sr / hop, best = -1, bestBpm = 0;
    function at(f) { var k = Math.floor(f), r = f - k; return k + 1 < n ? env[k] * (1 - r) + env[k + 1] * r : 0; }
    for (var bpm = 70; bpm <= 180; bpm += 0.25) {
      var lag = fps * 60 / bpm, sc = 0;
      for (var q = 0; q + 2 * lag < n; q++) sc += env[q] * (at(q + lag) + 0.5 * at(q + 2 * lag));
      sc /= (n - 2 * lag); if (bpm >= 85 && bpm <= 160) sc *= 1.08;    // prefer a walkable tempo
      if (sc > best) { best = sc; bestBpm = bpm; }
    }
    var bo = -1, bestOff = 0, fine = bestBpm;                              // then the exact tempo and where its beats fall
    for (var b2 = bestBpm - 0.4; b2 <= bestBpm + 0.4; b2 += 0.02) {
      var L = fps * 60 / b2;
      for (var off = 0; off < L; off += 0.25) { var t2 = 0; for (var f = off; f < n; f += L) t2 += at(f); if (t2 > bo) { bo = t2; bestOff = off; fine = b2; } }
    }
    return { bpm: fine, phase: bestOff / fps };
  }

  /* ---------- your audio: a file, or your voice recorded over the walk; kept in this browser ---------- */
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("btbr-reel", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("audio"); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("audio", mode), req = fn(tx.objectStore("audio"));
        tx.oncomplete = function () { res(req && req.result); }; tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function decode(blob) {
    return blob.arrayBuffer().then(function (ab) { return new OfflineAudioContext(2, 1, 48000).decodeAudioData(ab); });
  }
  function useAudio(blob, meta) {
    $("audioNote").textContent = "Reading the audio…";
    return decode(blob).then(function (buf) {
      user = { id: user.id + 1, buf: buf };
      reel.audio = Object.assign({ vol: 0.8, start: 0 }, meta); reel.yt = null; ytPause(); ytUI();
      if (!meta.voice) { var bt = detectBeat(buf); reel.beat = Object.assign(reel.beat || {}, { bpm: bt.bpm, phase: bt.phase, src: "file" }); beatUI(); }
      return idbDo("readwrite", function (st) { return st.put(blob, topic.slug); }).catch(function () {});
    }).then(function () { audioUI(); changed(true); })
      .catch(function () { $("audioNote").textContent = "Couldn’t read that file. Try an MP3, M4A or WAV."; });
  }
  function audioUI() {
    var a = reel.audio, has = !!(a && user.buf);
    $("audioBox").hidden = !has;
    if (!rec && !reel.yt) $("audioNote").textContent = has ? (a.voice ? "Your voice plays from the start of the walk." : "The music fades out at the end of the walk.")
      : "Add your song here to have it in the file, or add it later in Instagram.";
    if (!has) return;
    $("audioName").textContent = a.name;
    $("audioVol").value = a.vol; $("audioVolOut").textContent = Math.round(a.vol * 100) + "%";
    $("audioStartRow").hidden = !!a.voice;
    $("audioStart").max = Math.max(0, Math.floor(user.buf.duration - 5)); $("audioStart").value = a.start || 0; $("audioStartOut").textContent = fmt(a.start || 0);
  }
  var rec = null;
  function record() {
    if (rec) { rec.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { $("audioNote").textContent = "This browser can’t record."; return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
      var chunks = [], mr = new MediaRecorder(stream);
      rec = mr; $("recAudio").textContent = "Stop"; $("recAudio").classList.add("is-on");
      $("audioNote").textContent = "Recording — talk over the walk. It stops at the end, or press Stop.";
      mr.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); }); rec = null; stop();
        $("recAudio").textContent = "Record"; $("recAudio").classList.remove("is-on");
        var blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        if (blob.size) useAudio(blob, { name: "Your voice", voice: true, vol: 1, start: 0 }); else audioUI();
      };
      mr.start(); seek(0); play({ silent: true });                  // the walk plays silently, so the mic hears only you
    }).catch(function () { $("audioNote").textContent = "Microphone not allowed."; });
  }
  function wireAudio() {
    $("addAudio").addEventListener("click", function () { $("audioFile").click(); });
    $("audioFile").addEventListener("change", function () {
      var f = $("audioFile").files[0]; $("audioFile").value = "";
      if (f) useAudio(f, { name: f.name.replace(/\.[^.]+$/, ""), voice: false });
    });
    $("recAudio").addEventListener("click", record);
    $("rmAudio").addEventListener("click", function () {
      reel.audio = null; user = { id: user.id + 1, buf: null };
      idbDo("readwrite", function (st) { return st.delete(topic.slug); }).catch(function () {});
      audioUI(); changed(true);
    });
    $("audioVol").addEventListener("input", function () { reel.audio.vol = +$("audioVol").value; $("audioVolOut").textContent = Math.round(reel.audio.vol * 100) + "%"; });
    $("audioVol").addEventListener("change", function () { changed(true); });
    $("audioStart").addEventListener("input", function () { reel.audio.start = +$("audioStart").value; $("audioStartOut").textContent = fmt(reel.audio.start); });
    $("audioStart").addEventListener("change", function () { changed(true); });
    $("tap").addEventListener("click", tap);
    $("bpm").addEventListener("change", function () {
      var v = parseFloat($("bpm").value); if (v >= 40 && v <= 240) { reel.beat.bpm = v; if (!reel.beat.src) reel.beat.src = "typed"; } beatUI(); changed(true);
    });
  }
  /* ---------- a YouTube song: heard in the preview, in time with the walk — never in the file
     (the browser can't read YouTube's audio, and the song belongs to its owner: in Instagram,
     add it from the music library, from the same second) ---------- */
  var yt = { player: null, ready: false, id: "", title: "", dur: 0, api: null };
  function ytId(u) { var m = String(u || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/); return m ? m[1] : ""; }
  function ytT(u) { var m = String(u || "").match(/[?&#]t=(?:(\d+)h)?(?:(\d+)m)?(\d+)s?/); return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+m[3]) : 0; }
  function parseTime(v) { var p = String(v).trim().split(":").map(Number); if (p.some(isNaN)) return null; return p.reduce(function (a, b) { return a * 60 + b; }, 0); }
  function ytOn() { return !!(reel.yt && yt.ready && yt.id && yt.id === ytId(reel.yt.url)); }
  function ytPlaying() { try { return yt.player.getPlayerState() === 1; } catch (e) { return false; } }
  function ytPlay(t) { if (!ytOn()) return; yt.player.setVolume(reel.yt.vol); yt.player.seekTo(reel.yt.start + t, true); yt.player.playVideo(); }
  function ytPause() { if (yt.player && yt.ready) try { yt.player.pauseVideo(); } catch (e) {} }
  function ytSync(t) {                                                      // keep it with the picture
    if (!ytPlaying()) return; var want = reel.yt.start + t;
    if (Math.abs(yt.player.getCurrentTime() - want) > 0.3) yt.player.seekTo(want, true);
  }
  function ytApi() {
    if (!yt.api) yt.api = new Promise(function (res) {
      if (window.YT && YT.Player) return res();
      var prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = function () { if (prev) prev(); res(); };
      var sc = document.createElement("script"); sc.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(sc);
    });
    return yt.api;
  }
  function ytLoad() {
    var id = reel.yt && ytId(reel.yt.url);
    if (!id || id === yt.id) return;
    yt.id = id; yt.title = ""; yt.dur = 0; ytUI();
    fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id))
      .then(function (r) { return r.ok ? r.json() : {}; }).then(function (j) { if (yt.id === id) { yt.title = j.title || ""; ytUI(); } }).catch(function () {});
    ytApi().then(function () {
      function dur() { var d = yt.player.getDuration(); if (d) { yt.dur = d; ytUI(); } }
      if (yt.player) { yt.player.cueVideoById({ videoId: id, startSeconds: reel.yt.start }); setTimeout(dur, 1500); return; }
      yt.player = new YT.Player("ytPlayer", { width: 240, height: 135, videoId: id,
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0 },
        events: { onReady: function () { yt.ready = true; dur(); ytUI(); }, onStateChange: dur } });
    });
  }
  function ytName() { var song = topic.song || {}; return yt.title || (ytId(song.src) === yt.id && song.title) || "YouTube"; }
  function ytUI() {
    var y = reel.yt; $("ytBox").hidden = !y;
    if (!y) { if (!reel.audio && !rec) audioUI(); return; }
    if (document.activeElement !== $("ytUrl")) $("ytUrl").value = y.url;
    $("ytName").textContent = ytName();
    $("ytStart").max = Math.max(60, Math.floor(yt.dur || 600)); $("ytStart").value = y.start;
    if (document.activeElement !== $("ytStartTxt")) $("ytStartTxt").value = fmt(y.start);
    $("ytVol").value = y.vol; $("ytVolOut").textContent = y.vol + "%";
    $("audioNote").textContent = !ytId(y.url) ? "Paste a YouTube link." : "Plays in the preview only. In Instagram, add “" + ytName() + "” from " + fmt(y.start) + ".";
  }
  function wireYt() {
    $("addYt").addEventListener("click", function () {
      if (reel.yt) { $("ytUrl").focus(); return; }
      var song = topic.song && topic.song.src || "";
      if (reel.audio) { reel.audio = null; user = { id: user.id + 1, buf: null }; idbDo("readwrite", function (st) { return st.delete(topic.slug); }).catch(function () {}); audioUI(); }
      reel.yt = { url: song, start: ytT(song), vol: 60 }; ytUI(); ytLoad(); changed(true);
      if (!song) $("ytUrl").focus();
    });
    $("rmYt").addEventListener("click", function () { ytPause(); reel.yt = null; ytUI(); audioUI(); changed(true); });
    $("ytUrl").addEventListener("change", function () {
      var u = $("ytUrl").value.trim(); reel.yt.url = u; reel.yt.start = ytT(u); ytLoad(); ytUI(); changed(true);
    });
    $("ytStart").addEventListener("input", function () { reel.yt.start = +$("ytStart").value; ytUI(); });
    $("ytStart").addEventListener("change", function () { persist(); if (playing) { stop(); play(); } });
    $("ytStartTxt").addEventListener("change", function () {
      var v = parseTime($("ytStartTxt").value); if (v != null) reel.yt.start = Math.max(0, v); $("ytStartTxt").value = fmt(reel.yt.start); ytUI(); persist();
      if (playing) { stop(); play(); }
    });
    $("ytVol").addEventListener("input", function () { reel.yt.vol = +$("ytVol").value; ytUI(); if (yt.player && yt.ready) yt.player.setVolume(reel.yt.vol); });
    $("ytVol").addEventListener("change", persist);
  }

  function restoreAudio() {
    if (!reel.audio) return Promise.resolve();
    return idbDo("readonly", function (st) { return st.get(topic.slug); }).then(function (blob) {
      if (!blob) { reel.audio = null; return; }
      return decode(blob).then(function (buf) { user = { id: user.id + 1, buf: buf }; });
    }).catch(function () { reel.audio = null; });
  }

  /* ---------- export: every frame drawn at full size, encoded with the sound into an MP4 ---------- */
  var MB = "https://cdn.jsdelivr.net/npm/mediabunny@1.65.2/+esm";
  function save(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function exportVideo() {
    var btn = $("export"), note = $("exportNote"), bar = $("bar");
    if (!window.VideoEncoder) { note.textContent = "This browser can’t make video files. Try Chrome or Safari on a Mac."; return; }
    stop(); scene.items.forEach(function (it) { var v = vids[it.stop.vid]; if (v && v.el) v.el.pause(); });
    btn.disabled = true; $("progress").hidden = false; bar.style.width = "0"; note.textContent = "Getting ready…";
    var canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d"), N = Math.floor(scene.dur * FPS) + 1;
    Promise.all([import(MB), soundtrack(), Promise.all(scene.items.map(function (it) { return it.stop.src ? loadImg(it.stop.src) : null; }))]).then(function (r) {
      var mb = r[0], buf = r[1];
      return Promise.all([mb.canEncodeVideo("avc", { width: W, height: H }), mb.canEncodeAudio("aac")]).then(function (ok) {
        if (!ok[0]) throw new Error("This browser can’t encode H.264 video.");
        var output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
        var video = new mb.CanvasSource(canvas, { codec: "avc", bitrate: 12e6, keyFrameInterval: 2 });
        output.addVideoTrack(video, { frameRate: FPS });
        var audio = ok[1] ? new mb.AudioBufferSource({ codec: "aac", bitrate: 192e3 }) : null;
        if (audio) output.addAudioTrack(audio);
        exporting = true;
        return openSinks(mb).then(function () { return output.start(); }).then(function () {
          var k = 0;
          function next() {
            if (k >= N) return Promise.resolve();
            return frameVideos(k / FPS).then(function () { render(ctx, k / FPS, 1); return video.add(k / FPS, 1 / FPS); }).then(function () {
              k++; if (k % 10 === 0) { bar.style.width = (k / N * 92) + "%"; note.textContent = "Drawing frame " + k + " of " + N + "…"; }
              return next();
            });
          }
          return next();
        }).then(function () {
          note.textContent = "Adding the sound…"; video.close();
          return audio ? audio.add(buf).then(function () { audio.close(); }) : null;
        }).then(function () { note.textContent = "Finishing…"; return output.finalize(); }).then(function () {
          bar.style.width = "100%";
          var file = new File([output.target.buffer], topic.slug + "-reel.mp4", { type: "video/mp4" });
          window.__reelFile = file;                                 // dev: lets a headless browser read the result
          if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
            note.textContent = "Done."; return navigator.share({ files: [file] }).catch(function () { save(file, file.name); });
          }
          save(file, file.name);
          note.textContent = "Saved " + file.name + " (" + (file.size / 1048576).toFixed(1) + " MB)" + (ok[1] ? "" : " — without sound, this browser can’t encode AAC") + "."
            + (reel.yt && ytId(reel.yt.url) ? " The YouTube song isn’t in the file: in Instagram, add “" + ytName() + "” from " + fmt(reel.yt.start) + "." : "");
        });
      });
    }).catch(function (e) { note.textContent = "Couldn’t export: " + (e && e.message || e); })
      .then(function () { exporting = false; btn.disabled = false; setTimeout(function () { $("progress").hidden = true; }, 1200); });
  }

  /* ---------- start ---------- */
  function start() {
    Promise.all([
      fetch("/curation/topics/index.json", { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return []; }),
      document.fonts.load("400 40px \"Helvetica Neue\"").catch(function () {})
    ]).then(function (r) {
      var list0 = Array.isArray(r[0]) ? r[0] : (r[0].topics || []);
      if (!slug && list0[0]) slug = list0[0].slug;
      return fetch("/curation/topics/" + encodeURIComponent(slug) + ".json", { cache: "no-store" }).then(function (x) { return x.json(); }).then(function (t) {
        topic = t;
        var selEl = $("topic");
        (list0.length ? list0 : [{ slug: t.slug, title: t.title }]).forEach(function (it) {
          var o = document.createElement("option"); o.value = it.slug; o.textContent = it.title || it.slug; o.selected = it.slug === t.slug; selEl.appendChild(o);
        });
        $("topicName").textContent = t.title; document.title = "Reel — " + t.title;
        reel = restore() || defaults();
        if (!reel.mood) reel.mood = "day";
        reel.stops.forEach(function (st) { if (st.kind === "video") loadVideo(st); });
        return restoreAudio().then(function () { return Promise.all(reel.stops.filter(function (s) { return s.src; }).map(function (s) { return loadImg(s.src); })); });
      });
    }).then(function () {
      sizeView(); settings(); wireTransport(); wireEditor(); wireAudio(); wireYt(); ytUI(); ytLoad();
      build(); ticks(); list(); inspector(); now = 0; paint();
      $("count").textContent = fmt(scene.dur) + " · " + reel.stops.length + " stops";
      $("export").addEventListener("click", exportVideo);
      window.__reel = { render: render, scene: function () { return scene; }, reel: function () { return reel; }, exportVideo: exportVideo, seek: seek,   // dev hooks
        select: select, changed: changed, useAudio: useAudio, soundtrack: soundtrack };
    }).catch(function (e) { $("count").textContent = "Couldn’t load “" + slug + "”: " + e.message; });
  }
  start();
})();
