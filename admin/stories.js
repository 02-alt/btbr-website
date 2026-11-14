/* Curation Studio — Stories: a Backloggd game link → five Instagram stories (1080×1920), drawn on canvas
   in the curation's language (white museum label, taped prints in Isaac's hand, the + mark) or the game's
   own art. Three present the game, two carry a review. Everything is editable; pictures can be swapped. */
(function () {
  "use strict";
  var W = 1080, H = 1920;
  var view = null, built = false, renderT = 0;
  var S = {
    url: "", steam: "", loading: false, error: "",
    game: { title: "", dev: "", year: "", date: "", desc: "", genres: [], platforms: [], avg: "", plays: "", avgH: "", finishH: "" },
    line: "",                         // one line about the game (labels, poster)
    note1: "the start", note2: "the best part",
    review: { text: "", best: "", rating: 4.5, name: "Isaaaaaaaac", platform: "", hours: "" },
    pics: { cover: "", hero: "", p1: "", p2: "", p3: "" }
  };
  var imgs = {};                      // url → HTMLImageElement (loaded, CORS-clean)
  var markWhite = null;

  /* ---------- small helpers ---------- */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (imgs[src]) return imgs[src];
    imgs[src] = new Promise(function (res) {
      var im = new Image();
      if (!/^(blob:|data:)/.test(src)) im.crossOrigin = "anonymous";
      im.onload = function () { res(im); }; im.onerror = function () { res(null); };
      im.src = src;
    });
    return imgs[src];
  }
  var fontsReady = null;
  function fonts() {
    if (!fontsReady) fontsReady = (function () {
      try { var f = new FontFace("My Hand", "url(/assets/fonts/MyHand.ttf)"); document.fonts.add(f); return f.load().catch(function () {}); }
      catch (e) { return Promise.resolve(); }
    })();
    return fontsReady;
  }
  function handText(s) { return String(s || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-"); }

  /* ---------- reading a Backloggd game page (it answers cross-origin requests) ---------- */
  function abs(u) { return !u ? "" : u.indexOf("//") === 0 ? "https:" + u : u; }
  function parseGame(html, url) {
    var d = new DOMParser().parseFromString(html, "text/html");
    var q = function (s) { return d.querySelector(s); }, all = function (s) { return [].slice.call(d.querySelectorAll(s)); };
    var txt = function (e) { return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; };
    var g = {};
    g.title = (q("#game-page-meta") && q("#game-page-meta").getAttribute("data-name")) || txt(q("h1"));
    if (!g.title) throw new Error("That page doesn’t look like a Backloggd game page.");
    var dev = q('a[href^="/company/"]'); g.dev = txt(dev);
    g.year = txt(q("a.game-year")) || ((q('meta[property="og:title"]') || {}).content || "").replace(/^.*\((\d{4})\).*$/, "$1");
    var rd = q('a.game-details-value[href*="release_year"]'); g.date = txt(rd);
    g.desc = ((q('meta[name="description"]') || {}).content || "").trim();
    var uniq = function (a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); };
    g.genres = uniq(all('a.game-details-value[href*="genre:"]').map(txt));
    g.platforms = uniq(all("a.game-page-platform").map(txt));
    var r = q("#game-rating h1") || q(".game-rating h1"); g.avg = txt(r);
    all("a.d-flex").forEach(function (a) { var l = txt(a.querySelector(".log-counter-label")); if (/^plays$/i.test(l)) g.plays = txt(a.querySelector(".log-counter-stat")); });
    all("p.label").forEach(function (p) {
      var v = p.parentNode && p.parentNode.querySelector(".stat-value.element-revealed"), lab = txt(p).toLowerCase();
      if (!v) { var row = p.closest(".row"); v = row && row.querySelector(".stat-value.element-revealed"); }
      var h = txt(v).replace(/h$/, "").trim();
      if (lab === "average" && !g.avgH) g.avgH = h;
      if (lab === "to finish" && !g.finishH) g.finishH = h;
    });
    var cover = all("img").map(function (i) { return i.getAttribute("src") || i.getAttribute("data-src") || ""; }).filter(function (s) { return /t_cover_big/.test(s); })[0] || "";
    g.cover = abs(cover.replace(/t_cover_big(_2x)?/, "t_cover_big_2x"));
    var bg = q("#game-cover-art img"); g.bg = abs(bg && (bg.getAttribute("data-src") || bg.getAttribute("src")) || "");
    return g;
  }
  function firstLine(desc) {
    var s = String(desc || "").replace(/\s+/g, " ").trim(); if (!s) return "";
    var cut = s.split(/(?<=[.!?])\s/)[0];
    var m = /^(.{25,90}?)(,| in which | where | that | with an? )/i.exec(cut); if (m) cut = m[1];
    if (cut.length > 100) cut = cut.slice(0, 97).replace(/\s+\S*$/, "") + "…";
    return cut.replace(/[.]$/, "").replace(/^(A|An|The) /, function (w) { return w.toLowerCase(); });
  }
  function steamId(u) { var m = /store\.steampowered\.com\/app\/(\d+)/.exec(u || "") || /^(\d{3,8})$/.exec(String(u || "").trim()); return m ? m[1] : ""; }
  function fetchGame() {
    var url = S.url.trim();
    if (!/backloggd\.com\/games\/[^/]+/.test(url)) { S.error = "Paste a Backloggd game link — backloggd.com/games/…"; paintForm(); return; }
    url = url.replace(/^http:/, "https:").replace(/^(https:\/\/)?(www\.)?backloggd/, "https://backloggd").replace(/(\/games\/[^/?#]+).*$/, "$1/");
    S.loading = true; S.error = ""; paintForm();
    fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("Backloggd answered " + r.status + "."); return r.text(); })
      .then(function (html) {
        if (/not a bot|Anubis/i.test(html)) throw new Error("Backloggd asked for a bot check. Open the game page in this browser once, then try again.");
        var g = parseGame(html, url);
        S.game = g; S.line = firstLine(g.desc);
        // Backloggd gives the cover and one picture: the cover carries the big art until a Steam link
        // or a dropped picture brings better; the picture goes on the prints
        S.pics.cover = g.cover;
        if (!steamId(S.steam)) S.pics.hero = g.cover;
        S.pics.p1 = g.bg || g.cover; S.pics.p2 = steamId(S.steam) ? S.pics.hero : (g.bg || g.cover); S.pics.p3 = g.cover;
        S.review.platform = S.review.platform || shortPlatforms(g.platforms)[0] || "";
      })
      .catch(function (e) { S.error = (e && e.message) || "Couldn’t read that page."; })
      .then(function () { S.loading = false; paintForm(); render(); });
  }
  function useSteam() {
    var id = steamId(S.steam); if (!id) return;
    var base = "https://cdn.cloudflare.steamstatic.com/steam/apps/" + id + "/";
    S.pics.hero = base + "library_hero.jpg";
    if (!S.pics.p2 || /igdb|steamstatic/.test(S.pics.p2)) S.pics.p2 = base + "library_hero.jpg";
    paintForm(); render();
  }
  function shortPlatforms(list) {
    var map = [[/windows|pc/i, "PC"], [/mac/i, "Mac"], [/linux/i, "Linux"], [/switch/i, "Switch"], [/playstation|ps\d/i, "PlayStation"], [/xbox/i, "Xbox"], [/ios|iphone|ipad/i, "iPhone"], [/android/i, "Android"], [/wii u/i, "Wii U"]];
    var out = [];
    (list || []).forEach(function (p) { for (var i = 0; i < map.length; i++) if (map[i][0].test(p)) { if (out.indexOf(map[i][1]) < 0) out.push(map[i][1]); return; } if (out.indexOf(p) < 0) out.push(p); });
    return out;
  }

  /* ---------- drawing ---------- */
  var HELV = '"Helvetica Neue", Helvetica, Arial, sans-serif', HAND = '"My Hand", "Bradley Hand", cursive';
  function font(ctx, size, weight, fam) { ctx.font = (weight || 400) + " " + size + "px " + (fam || HELV); }
  function spacing(ctx, px) { try { ctx.letterSpacing = px + "px"; } catch (e) {} }
  function wrap(ctx, text, maxW) {
    var out = [];
    String(text || "").split("\n").forEach(function (para) {
      var line = "";
      para.split(/\s+/).forEach(function (w) {
        if (!w) return;
        var t = line ? line + " " + w : w;
        if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
      });
      out.push(line);
    });
    return out;
  }
  function lines(ctx, text, x, y, maxW, lh, maxLines) {
    var ls = wrap(ctx, text, maxW);
    if (maxLines && ls.length > maxLines) { ls = ls.slice(0, maxLines); ls[maxLines - 1] = ls[maxLines - 1].replace(/\s*\S*$/, "") + "…"; }
    ls.forEach(function (l, i) { ctx.fillText(l, x, y + i * lh); });
    return ls.length * lh;
  }
  function cover(ctx, im, x, y, w, h, px, py) {
    if (!im) { ctx.fillStyle = "#cfcdd0"; ctx.fillRect(x, y, w, h); return; }
    var s = Math.max(w / im.naturalWidth, h / im.naturalHeight), sw = w / s, sh = h / s;
    var sx = (im.naturalWidth - sw) * (px == null ? 0.5 : px), sy = (im.naturalHeight - sh) * (py == null ? 0.5 : py);
    ctx.drawImage(im, sx, sy, sw, sh, x, y, w, h);
  }
  function shadowed(ctx, blur, dy, alpha, fn) {
    ctx.save(); ctx.shadowColor = "rgba(40,30,40," + alpha + ")"; ctx.shadowBlur = blur; ctx.shadowOffsetY = dy; fn(); ctx.restore();
  }
  function rounded(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function paper(ctx, x, y, w, h) {
    shadowed(ctx, 70, 34, 0.18, function () { ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h); });
    shadowed(ctx, 6, 2, 0.06, function () { ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h); });
  }
  function star(ctx, cx, cy, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    ctx.closePath();
  }
  function stars(ctx, rating, x, y, size, on, off) {
    var r = size / 2, gap = size * 0.16;
    for (var i = 0; i < 5; i++) {
      var cx = x + r + i * (size + gap), cy = y + r, fill = Math.max(0, Math.min(1, rating - i));
      ctx.fillStyle = off; star(ctx, cx, cy, r); ctx.fill();
      if (fill > 0) { ctx.save(); ctx.beginPath(); ctx.rect(cx - r, cy - r, size * fill, size); ctx.clip(); ctx.fillStyle = on; star(ctx, cx, cy, r); ctx.fill(); ctx.restore(); }
    }
    return 5 * size + 4 * gap;
  }
  function tape(ctx, x, y, w, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = "rgba(235,228,205,0.86)"; ctx.fillRect(-w / 2, -24, w, 48); ctx.restore();
  }
  // a polaroid: white card, the picture, a note in Isaac's hand, a strip of tape
  function print(ctx, im, x, y, w, ar, rot, note, noteSize, px, py) {
    var pad = Math.round(w * 0.048), iw = w - 2 * pad, ih = Math.round(iw / ar), nh = Math.round((noteSize || 52) * 1.9), h = pad + ih + nh;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot * Math.PI / 180); ctx.translate(-w / 2, -h / 2);
    shadowed(ctx, 60, 30, 0.3, function () { ctx.fillStyle = "#fdfcf9"; ctx.fillRect(0, 0, w, h); });
    cover(ctx, im, pad, pad, iw, ih, px, py);
    if (note) { font(ctx, noteSize || 52, 400, HAND); ctx.fillStyle = "#1f1d20"; ctx.textBaseline = "alphabetic"; var t = handText(note); while (ctx.measureText(t).width > iw && t.length > 3) t = t.slice(0, -2); ctx.fillText(t, pad + 6, pad + ih + nh * 0.62); }
    tape(ctx, w / 2, 0, Math.min(180, w * 0.4), -0.035);
    ctx.restore();
    return h;
  }
  function mark(ctx, x, y, size) {
    if (!markWhite) return;
    var draw = function () { ctx.drawImage(markWhite, x, y, size, size); };
    ctx.save(); ctx.shadowColor = "rgba(40,30,40,0.12)"; ctx.shadowBlur = 7; ctx.shadowOffsetY = 5; draw(); ctx.restore();
    ctx.save(); ctx.shadowColor = "rgba(40,30,40,0.26)"; ctx.shadowBlur = 1; ctx.shadowOffsetY = 2; draw(); ctx.restore();
    ctx.save(); ctx.shadowColor = "rgba(40,30,40,0.1)"; ctx.shadowBlur = 0; ctx.shadowOffsetY = -1; draw(); ctx.restore();
  }
  function sig(ctx, text, y, color) {
    font(ctx, 24, 400); spacing(ctx, 3.6); ctx.fillStyle = color || "#9a989b"; ctx.textAlign = "center";
    ctx.fillText(String(text).toUpperCase(), W / 2, y); ctx.textAlign = "left"; spacing(ctx, 0);
  }
  function metaLine() {
    var g = S.game, bits = [];
    if (g.avg) bits.push(g.avg + " ★ on Backloggd");
    if (g.plays) bits.push(g.plays + " played");
    if (g.finishH) bits.push("~" + g.finishH + " h to finish");
    return bits;
  }

  // 1 · GAME — the museum label
  function s1(ctx, P) {
    var g = S.game;
    ctx.fillStyle = "#e6e4e6"; ctx.fillRect(0, 0, W, H);
    // the cover in a museum frame: black moulding, a wide white mat
    var fw = 660, fx = (W - fw) / 2, fy = 240, inner = fw - 2 * 26 - 2 * 64, ih = Math.round(inner * 4 / 3), fh = 26 * 2 + 70 * 2 + ih;
    ctx.save(); ctx.translate(fx + fw / 2, fy + fh / 2); ctx.rotate(-0.6 * Math.PI / 180); ctx.translate(-fw / 2, -fh / 2);
    shadowed(ctx, 90, 50, 0.45, function () { ctx.fillStyle = "#141414"; ctx.fillRect(0, 0, fw, fh); });
    ctx.fillStyle = "#faf9f6"; ctx.fillRect(26, 26, fw - 52, fh - 52);
    shadowed(ctx, 4, 1, 0.25, function () { cover(ctx, P.cover, 26 + 64, 26 + 70, inner, ih); });
    ctx.restore();
    // the label
    var lx = 70, lw = W - 140, ly = Math.max(fy + fh + 70, 1150);
    font(ctx, 62, 400); spacing(ctx, -1.5);
    var text = [g.dev && g.dev + ",", g.title + ",", [S.line, g.year].filter(Boolean).join(", ")].filter(Boolean).join("\n");
    var tl = wrap(ctx, text, lw - 100), lh = 68, meta = metaLine();
    var lhgt = 44 + tl.length * lh + (meta.length ? 70 : 0) + 140;
    paper(ctx, lx, ly, lw, lhgt);
    ctx.fillStyle = "#111"; ctx.textBaseline = "top";
    tl.forEach(function (l, i) { ctx.fillText(l, lx + 50, ly + 44 + i * lh); });
    spacing(ctx, 0);
    if (meta.length) { font(ctx, 28, 400); ctx.fillStyle = "#8a888b"; ctx.fillText(meta.join("   ·   "), lx + 50, ly + 44 + tl.length * lh + 26); }
    ctx.textBaseline = "alphabetic";
    mark(ctx, lx + 44, ly + lhgt - 112, 84);
    sig(ctx, "builtoberemembered", H - 110);
  }
  // 2 · GAME — the poster
  function s2(ctx, P) {
    var g = S.game;
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, W, H);
    cover(ctx, P.hero, 0, 0, W, 1180, 0.6, 0.08);
    var gr = ctx.createLinearGradient(0, 0, 0, 1200);
    gr.addColorStop(0, "rgba(11,11,13,0)"); gr.addColorStop(0.5, "rgba(11,11,13,0.1)"); gr.addColorStop(0.82, "rgba(11,11,13,0.85)"); gr.addColorStop(1, "#0b0b0d");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 1200);
    ctx.textBaseline = "alphabetic";
    font(ctx, 30, 400); spacing(ctx, 4); ctx.fillStyle = "#9a9aa0";
    ctx.fillText([g.dev, g.year].filter(Boolean).join(" · ").toUpperCase(), 80, 1090); spacing(ctx, -4);
    var size = 128; font(ctx, size, 700); while (ctx.measureText(g.title).width > W - 160 && size > 70) { size -= 4; font(ctx, size, 700); }
    ctx.fillStyle = "#fff"; var th = lines(ctx, g.title, 80, 1090 + size * 1.02, W - 160, size * 0.98, 2);
    spacing(ctx, 0); font(ctx, 38, 400); ctx.fillStyle = "#c9c9cf";
    lines(ctx, S.line ? S.line.charAt(0).toUpperCase() + S.line.slice(1) + "." : "", 80, 1090 + size * 0.98 + th + 40, W - 160, 50, 3);
    var tw = (W - 160 - 40) / 3;
    [P.p1, P.p2, P.p3].forEach(function (im, i) { ctx.save(); rounded(ctx, 80 + i * (tw + 20), 1530, tw, tw * 9 / 16, 12); ctx.clip(); cover(ctx, im, 80 + i * (tw + 20), 1530, tw, tw * 9 / 16); ctx.restore(); });
    font(ctx, 26, 400); ctx.fillStyle = "#7d7d84";
    if (g.avg) ctx.fillText("★ " + g.avg + " on Backloggd", 80, H - 110);
    spacing(ctx, 3.6); ctx.textAlign = "right"; ctx.fillText("BUILTOBEREMEMBERED", W - 80, H - 110); ctx.textAlign = "left"; spacing(ctx, 0);
  }
  // 3 · GAME — the prints
  function s3(ctx, P) {
    var g = S.game;
    ctx.fillStyle = "#e6e4e6"; ctx.fillRect(0, 0, W, H);
    print(ctx, P.p1, 60, 220, 520, 4 / 3, -3, S.note1, 52);
    print(ctx, P.p2, 500, 560, 520, 4 / 3, 2.6, S.note2, 52);
    print(ctx, P.p3 || P.cover, 100, 990, 380, 3 / 4, -1.4, g.title, 46);
    ctx.textBaseline = "top"; font(ctx, 50, 400); spacing(ctx, -1); ctx.fillStyle = "#111";
    var y = 1290 + lines(ctx, [g.dev && g.dev + ",", g.year && g.year + "."].filter(Boolean).join("\n"), 560, 1290, W - 630, 56);
    spacing(ctx, 0); font(ctx, 28, 400); ctx.fillStyle = "#8a888b";
    var y2 = y + 22 + lines(ctx, g.genres.slice(0, 3).join(" · "), 560, y + 22, W - 630, 36);
    lines(ctx, shortPlatforms(g.platforms).join(", "), 560, y2, W - 630, 36, 3);
    ctx.textBaseline = "alphabetic";
    sig(ctx, "builtoberemembered · on Backloggd", H - 110);
  }
  // 4 · REVIEW — in my hand
  function s4(ctx, P) {
    var g = S.game, rv = S.review;
    ctx.fillStyle = "#e6e4e6"; ctx.fillRect(0, 0, W, H);
    print(ctx, P.cover, 330, 220, 420, 3 / 4, -2.5, [g.title, g.year].filter(Boolean).join(", "), 44);
    var quote = handText(rv.text || "Your review, in your hand, goes here."), size = 84;
    font(ctx, size, 400, HAND);
    while (wrap(ctx, '"' + quote + '"', W - 180).length * size * 1.08 > 470 && size > 48) { size -= 4; font(ctx, size, 400, HAND); }
    ctx.fillStyle = "#1f1d20"; ctx.textBaseline = "top";
    var h = lines(ctx, '"' + quote + '"', 90, 960, W - 180, size * 1.08);
    var sy = Math.max(1440, 960 + h + 40);
    stars(ctx, rv.rating, 90, sy, 84, "#111", "rgba(0,0,0,0.16)");
    font(ctx, 30, 400); ctx.fillStyle = "#8a888b";
    ctx.fillText("— " + [rv.name, "on Backloggd"].filter(Boolean).join(", "), 90, sy + 130);
    ctx.textBaseline = "alphabetic";
    sig(ctx, "builtoberemembered", H - 110);
  }
  // 5 · REVIEW — the pull quote
  function s5(ctx, P) {
    var g = S.game, rv = S.review;
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.4; cover(ctx, P.hero || P.cover, 0, 0, W, H, 0.6, 0.35); ctx.restore();
    var gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "rgba(11,11,13,0.2)"); gr.addColorStop(0.45, "rgba(11,11,13,0.55)"); gr.addColorStop(0.8, "#0b0b0d"); gr.addColorStop(1, "#0b0b0d");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "top";
    font(ctx, 30, 400); spacing(ctx, 4); ctx.fillStyle = "#b9b9c0"; ctx.fillText("MY REVIEW", 80, 250);
    var q = "“" + String(rv.best || rv.text || "Your best line goes here.").replace(/^["“]|["”]$/g, "") + "”", size = 98;
    spacing(ctx, -3); font(ctx, size, 700);
    while (wrap(ctx, q, W - 160).length * size * 1.04 > 640 && size > 56) { size -= 4; font(ctx, size, 700); }
    ctx.fillStyle = "#fff"; var h = lines(ctx, q, 80, 330, W - 160, size * 1.04);
    spacing(ctx, 0);
    var sy = Math.max(1010, 330 + h + 60);
    stars(ctx, rv.rating, 80, sy, 80, "#fff", "rgba(255,255,255,0.22)");
    var by = sy + 200;
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(80, by - 44, W - 160, 1);
    shadowed(ctx, 40, 20, 0.5, function () { ctx.save(); rounded(ctx, 80, by, 190, 253, 12); ctx.clip(); cover(ctx, P.cover, 80, by, 190, 253); ctx.restore(); });
    font(ctx, 44, 400); ctx.fillStyle = "#fff"; lines(ctx, g.title, 304, by + 40, W - 384, 50, 2);
    font(ctx, 30, 400); ctx.fillStyle = "#9a9aa0";
    var played = [rv.platform && "played on " + rv.platform, rv.hours && rv.hours + " h"].filter(Boolean).join(" · ");
    lines(ctx, [[g.dev, g.year].filter(Boolean).join(" · "), played].filter(Boolean).join("\n"), 304, by + 108, W - 384, 40);
    ctx.textBaseline = "alphabetic";
    font(ctx, 26, 400); ctx.fillStyle = "#7d7d84"; ctx.fillText("full review on Backloggd", 80, H - 110);
    spacing(ctx, 3.6); ctx.textAlign = "right"; ctx.fillText("BUILTOBEREMEMBERED", W - 80, H - 110); ctx.textAlign = "left"; spacing(ctx, 0);
  }
  var STORIES = [
    { key: "label", name: "The museum label", kind: "Game", draw: s1 },
    { key: "poster", name: "The poster", kind: "Game", draw: s2 },
    { key: "prints", name: "The prints", kind: "Game", draw: s3 },
    { key: "hand", name: "In my hand", kind: "Review", draw: s4 },
    { key: "quote", name: "The pull quote", kind: "Review", draw: s5 }
  ];

  function render() {
    clearTimeout(renderT);
    renderT = setTimeout(function () {
      if (!view || !S.game.title) return;
      var keys = ["cover", "hero", "p1", "p2", "p3"];
      Promise.all([fonts(), prepMark()].concat(keys.map(function (k) { return loadImg(S.pics[k]); }))).then(function (res) {
        var P = {}; keys.forEach(function (k, i) { P[k] = res[i + 2]; });
        STORIES.forEach(function (st) {
          var c = view.querySelector('canvas[data-key="' + st.key + '"]'); if (!c) return;
          var ctx = c.getContext("2d"); ctx.clearRect(0, 0, W, H);
          try { st.draw(ctx, P); } catch (e) { console.error(e); }
        });
      });
    }, 120);
  }
  function prepMark() {
    if (markWhite) return Promise.resolve();
    return loadImg("/assets/mark-plus.png?v=1").then(function (im) {
      if (!im) return;
      var c = document.createElement("canvas"); c.width = c.height = 240; var x = c.getContext("2d");
      x.drawImage(im, 0, 0, 240, 240); x.globalCompositeOperation = "source-in"; x.fillStyle = "#fff"; x.fillRect(0, 0, 240, 240);
      markWhite = c;
    });
  }
  function slug() { return (S.game.title || "story").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function download(key) {
    var c = view.querySelector('canvas[data-key="' + key + '"]'); if (!c) return;
    c.toBlob(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = slug() + "-" + key + ".png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }, "image/png");
  }
  function downloadAll(btn) {
    if (!window.JSZip) { STORIES.forEach(function (st, i) { setTimeout(function () { download(st.key); }, i * 400); }); return; }
    var zip = new JSZip(), label = btn.textContent; btn.disabled = true; btn.textContent = "Packing…";
    Promise.all(STORIES.map(function (st, i) {
      return new Promise(function (res) { view.querySelector('canvas[data-key="' + st.key + '"]').toBlob(function (b) { zip.file((i + 1) + "-" + st.key + ".png", b); res(); }, "image/png"); });
    })).then(function () { return zip.generateAsync({ type: "blob" }); }).then(function (b) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = slug() + "-stories.zip"; a.click();
      btn.disabled = false; btn.textContent = label;
    });
  }

  /* ---------- the form ---------- */
  function field(label, input, hint) {
    var f = el("div", "insp-field"); f.appendChild(el("label", "insp-label", esc(label))); f.appendChild(input);
    if (hint) f.appendChild(el("div", "insp-empty st-hint", hint)); return f;
  }
  function input(val, ph, on, area) {
    var i = el(area ? "textarea" : "input", "insp-input" + (area ? " insp-textarea" : "")); i.value = val || ""; i.placeholder = ph || ""; if (area) i.rows = area;
    i.addEventListener("input", function () { on(i.value); render(); }); return i;
  }
  var PIC_NAMES = { cover: "Cover", hero: "Big art (poster)", p1: "Picture 1", p2: "Picture 2", p3: "Picture 3" };
  function picSlot(k) {
    var b = el("button", "st-pic"); b.type = "button"; b.title = "Click or drop a picture to replace";
    b.innerHTML = (S.pics[k] ? '<img src="' + esc(S.pics[k]) + '" alt="">' : "") + "<span>" + PIC_NAMES[k] + "</span>";
    var pick = function (file) { if (!file || !/^image\//.test(file.type)) return; S.pics[k] = URL.createObjectURL(file); paintForm(); render(); };
    b.addEventListener("click", function () { var f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.onchange = function () { pick(f.files[0]); }; f.click(); });
    b.addEventListener("dragover", function (e) { e.preventDefault(); b.classList.add("is-drop"); });
    b.addEventListener("dragleave", function () { b.classList.remove("is-drop"); });
    b.addEventListener("drop", function (e) { e.preventDefault(); e.stopPropagation(); b.classList.remove("is-drop"); pick(e.dataTransfer.files[0]); });
    return b;
  }
  function ratingField() {
    var w = el("div", "st-rating");
    for (var i = 1; i <= 10; i++) (function (v) {
      var b = el("button", "st-rate" + (v / 2 <= S.review.rating ? " is-on" : "") + (v % 2 ? " is-half" : ""), ""); b.type = "button"; b.title = (v / 2) + " ★";
      b.addEventListener("click", function () { S.review.rating = v / 2; paintForm(); render(); });
      w.appendChild(b);
    })(i);
    w.appendChild(el("span", "st-rate-n", S.review.rating.toFixed(1).replace(/\.0$/, "") + " ★"));
    return w;
  }
  function paintForm() {
    var f = view.querySelector(".st-form"); if (!f) return;
    var g = S.game, keep = document.activeElement && f.contains(document.activeElement) ? document.activeElement.getAttribute("data-k") : null;
    f.innerHTML = "";
    var urlIn = input(S.url, "https://backloggd.com/games/…", function (v) { S.url = v; }); urlIn.setAttribute("data-k", "url");
    urlIn.addEventListener("keydown", function (e) { if (e.key === "Enter") fetchGame(); });
    urlIn.addEventListener("paste", function () { setTimeout(fetchGame, 0); });
    var row = el("div", "st-row"); row.appendChild(urlIn);
    var go = el("button", "sbtn primary", S.loading ? "Reading…" : "Fill in"); go.type = "button"; go.disabled = S.loading; go.addEventListener("click", fetchGame); row.appendChild(go);
    f.appendChild(field("Backloggd game link", row, S.error ? '<span class="st-err">' + esc(S.error) + "</span>" : (g.title ? "Read " + esc(g.title) + " — everything below can be changed." : "A game page: backloggd.com/games/name-of-the-game/")));
    if (!g.title) return;
    var sec = el("div", "st-sec", "<h3>The game</h3>"); f.appendChild(sec);
    sec.appendChild(field("Title", input(g.title, "", function (v) { g.title = v; })));
    var pair = el("div", "insp-pair"); pair.appendChild(input(g.dev, "Studio", function (v) { g.dev = v; })); pair.appendChild(input(g.year, "Year", function (v) { g.year = v; }));
    sec.appendChild(field("Studio · year", pair));
    sec.appendChild(field("One line about it", input(S.line, "a fallen kingdom of bugs, and you in the dark of it", function (v) { S.line = v; }, 2), "On the label and the poster."));
    var notes = el("div", "insp-pair"); notes.appendChild(input(S.note1, "the start", function (v) { S.note1 = v; })); notes.appendChild(input(S.note2, "the best part", function (v) { S.note2 = v; }));
    sec.appendChild(field("Notes on the prints (in your hand)", notes));
    var pics = el("div", "st-pics"); ["cover", "hero", "p1", "p2", "p3"].forEach(function (k) { pics.appendChild(picSlot(k)); });
    sec.appendChild(field("Pictures", pics, "Click or drop to replace. Backloggd gives the cover and one picture; a Steam link adds the big art."));
    var st = el("div", "st-row"); var stIn = input(S.steam, "Steam link (optional) — store.steampowered.com/app/…", function (v) { S.steam = v; }); st.appendChild(stIn);
    var stB = el("button", "sbtn", "Use"); stB.type = "button"; stB.addEventListener("click", useSteam); st.appendChild(stB); sec.appendChild(st);
    var rv = el("div", "st-sec", "<h3>Your review</h3>"); f.appendChild(rv);
    rv.appendChild(field("Rating", ratingField()));
    rv.appendChild(field("Review", input(S.review.text, "What you'd say about it, in a sentence or two", function (v) { S.review.text = v; }, 3), "Story 4 writes it in your hand."));
    rv.appendChild(field("Best line (story 5)", input(S.review.best, "Leave empty to use the review", function (v) { S.review.best = v; })));
    var p2 = el("div", "insp-pair"); p2.appendChild(input(S.review.platform, "Played on", function (v) { S.review.platform = v; })); p2.appendChild(input(S.review.hours, "Hours", function (v) { S.review.hours = v; }));
    rv.appendChild(field("Played on · hours", p2));
    rv.appendChild(field("Signed", input(S.review.name, "Your name", function (v) { S.review.name = v; })));
    if (keep) { var k = f.querySelector('[data-k="' + keep + '"]'); if (k) k.focus(); }
  }
  function build() {
    view = document.getElementById("storiesView"); if (!view || built) return;
    built = true;
    view.innerHTML = '<div class="st-wrap"><div class="st-form"></div><div class="st-out"><div class="st-head"><h2>Stories</h2><button class="sbtn primary st-all" type="button">Download all</button></div>'
      + '<div class="st-grid">' + STORIES.map(function (st) {
        return '<figure class="st-card"><canvas data-key="' + st.key + '" width="' + W + '" height="' + H + '"></canvas><figcaption><span><b>' + st.name + "</b><i>" + st.kind + '</i></span><button class="sbtn st-dl" type="button" data-key="' + st.key + '">Download</button></figcaption></figure>';
      }).join("") + '</div><p class="st-empty">Paste a Backloggd game link to fill in the five stories.</p></div></div>';
    view.addEventListener("click", function (e) {
      var d = e.target.closest(".st-dl"); if (d) { download(d.getAttribute("data-key")); return; }
      var a = e.target.closest(".st-all"); if (a) downloadAll(a);
    });
    paintForm();
  }
  function show() {
    build();
    view.classList.toggle("has-game", !!S.game.title);
    render();
    var u = view.querySelector('[data-k="url"]'); if (u && !S.game.title) u.focus();
  }
  // render() and paintForm() also flip the empty state
  var _render = render; render = function () { if (view) view.classList.toggle("has-game", !!S.game.title); _render(); };
  window.BtbrStories = { show: show };
})();
