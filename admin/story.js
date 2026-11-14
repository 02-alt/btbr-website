/* Story export — one link, set as a 1080 × 1920 Instagram story.

   Paste any link (or open it from a topic, which offers the topic's own links): a YouTube video comes
   in a dark Preview window with its title under it, an App Store app as its store card (icon, name,
   rating, screenshots), and a website in a Safari window around a screenshot you paste or drop. The
   space below is left for Instagram's Link sticker, which can't be baked into a picture: saving
   copies the link so it's ready to paste into the sticker. */
(function () {
  "use strict";

  var W = 1080, H = 1920;
  var SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  var SYS = 'system-ui, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
  var SITE = "buildtoberemembered.com";
  var TOP = 400, BOTTOM = 1340;            // the object fits between these; Instagram's bar is above, the sticker below
  var STICKER_Y = 1470, SIGN_Y = 1640;
  var TONES = [["#e6e4e6", "Grey"], ["#e9e4dc", "Sand"], ["#dcd8d2", "Stone"], ["#dfe2e5", "Mist"], ["#ffffff", "White"],
    ["#2c2b2d", "Graphite"], ["#26292c", "Slate"], ["#332c27", "Umber"], ["#221d1a", "Espresso"]];
  // the btbr mark: the hand-drawn + (the curation cards' mark), tinted to the story's quiet ink
  var MARK_SRC = "/assets/mark-plus.png?v=1", markImg = null, markTint = {};
  function markIn(color, size) {
    var key = color + "|" + size; if (markTint[key]) return markTint[key];
    var c = document.createElement("canvas"); c.width = c.height = size;
    var k = c.getContext("2d"); k.drawImage(markImg, 0, 0, size, size);
    k.globalCompositeOperation = "source-in"; k.fillStyle = color; k.fillRect(0, 0, size, size);
    return (markTint[key] = c);
  }

  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search);
  var topic = null, links = [];
  var S = { item: null, pic: null, picSrc: "", still: 0, own: null, bg: "#e6e4e6", kicker: "", kickerSet: false,
    title: "", sub: "", chrome: "light", shots: true, sign: true };
  var token = 0;                           // the link being loaded; older answers are dropped

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
  function ytId(u) { var m = String(u || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/); return m ? m[1] : ""; }
  var oe = {};
  function ytInfo(id) {
    if (!oe[id]) oe[id] = fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id))
      .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    return oe[id];
  }
  function ytStill(id, n) {               // n: 0 the cover, 1–3 YouTube's frames at ¼ ½ ¾ — HD when there is one
    var hd = "https://i.ytimg.com/vi/" + id + "/" + (n ? "maxres" + n : "maxresdefault") + ".jpg";
    return loadImg(hd).then(function (im) {
      return im && im.naturalWidth > 200 ? im : loadImg(hd.replace("maxresdefault", "hqdefault").replace(/maxres(\d)\.jpg/, "hq$1.jpg"));
    });
  }
  function appLookup(id, country) {
    function ask(c) {
      return fetch("https://itunes.apple.com/lookup?id=" + id + "&country=" + c + "")
        .then(function (r) { return r.json(); }).then(function (d) { return (d.results || []).filter(function (x) { return /software/.test(x.kind || x.wrapperType || ""); })[0] || (d.results || [])[0] || null; });
    }
    return ask(country).then(function (r) { return r || (country !== "us" ? ask("us") : null); }).catch(function () { return null; });
  }
  function bigArt(u, box) { return String(u || "").replace(/\/[^\/]+bb\.(jpg|png|webp)$/, "/" + box + "bb.$1"); }
  // a page of this site: read its title and share picture (following a redirect stub once)
  function ownPage(path, hop) {
    return fetch(path, { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (html) {
      var d = new DOMParser().parseFromString(html, "text/html");
      function meta(p) { var m = d.querySelector('meta[property="' + p + '"], meta[name="' + p + '"]'); return m ? m.getAttribute("content") || "" : ""; }
      var re = d.querySelector('meta[http-equiv="refresh" i]'), to = re && /url=([^;]+)/i.exec(re.getAttribute("content") || "");
      if (to && !hop) { try { var nu = new URL(to[1].trim(), location.origin + path); if (nu.origin === location.origin) return ownPage(nu.pathname + nu.search, true); } catch (e) {} }
      var img = meta("og:image");
      try { var u = new URL(img, location.href); if (u.hostname.replace(/^www\./, "") === SITE || u.origin === location.origin) img = u.pathname + u.search; } catch (e) {}
      return { title: meta("og:title") || (d.title || "").trim(), image: img, path: path };
    }).catch(function () { return { title: "", image: "", path: path }; });
  }

  /* ---------- what a link is ---------- */
  function clean(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) { if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) u = "https://" + u; else return ""; }
    try { return new URL(u).href; } catch (e) { return ""; }
  }
  function classify(href) {
    var u = new URL(href), host = u.hostname.replace(/^www\.|^m\./, ""), m;
    if (/(^|\.)youtube(-nocookie)?\.com$|^youtu\.be$/.test(host) && ytId(href)) return { kind: "youtube", id: ytId(href), url: href, host: "youtube.com" };
    if (/^(apps|itunes)\.apple\.com$/.test(u.hostname) && (m = /\/id(\d+)/.exec(u.pathname))) {
      var c = /^\/([a-z]{2})\//.exec(u.pathname);
      return { kind: "app", id: m[1], country: c ? c[1] : "us", url: href, host: "apps.apple.com" };
    }
    var own = host === SITE || u.origin === location.origin;
    return { kind: "web", url: own ? "https://" + SITE + u.pathname + u.search + u.hash : href, host: own ? SITE : host, own: own, path: own ? u.pathname + u.search : "" };
  }
  function kindName(it) { return it.kind === "youtube" ? "YouTube" : it.kind === "app" ? "App Store" : it.own ? "This site" : "Website"; }
  function defaultKicker(it) {
    if (it.own && /^\/curation\/[^\/]+/.test(it.path)) return "New in the curation";
    if (topic) return "From \u201C" + topic.title + "\u201D";
    return it.kind === "youtube" ? "Now watching" : it.kind === "app" ? "Worth downloading" : "Worth a look";
  }

  /* ---------- choosing a link ---------- */
  function choose(href, fromList) {
    href = clean(href);
    if (!href) { note("That doesn’t look like a link.", true); return; }
    var it = classify(href), my = ++token;
    S.item = it; S.pic = null; S.picSrc = ""; S.still = 0; S.own = null; S.app = null;
    S.title = ""; S.sub = it.kind === "youtube" ? "YouTube" : it.host;
    if (!S.kickerSet) S.kicker = defaultKicker(it);
    if (!fromList) $("url").value = href;
    note(kindName(it) + " · " + it.host, false);
    markList(); panels(); draw();
    var p;
    if (it.kind === "youtube") {
      p = Promise.all([ytInfo(it.id), ytStill(it.id, 0)]).then(function (a) {
        if (my !== token) return;
        S.title = a[0].title || ""; S.sub = "YouTube" + (a[0].author_name ? " \u00B7 " + a[0].author_name : "");
        S.pic = a[1]; stills(it.id);
      });
    } else if (it.kind === "app") {
      note("Looking it up on the App Store…", false);
      p = appLookup(it.id, it.country).then(function (r) {
        if (my !== token) return;
        if (!r) { note("The App Store doesn’t know that app.", true); return; }
        var mac = r.kind === "mac-software";
        var shots = (r.screenshotUrls && r.screenshotUrls.length ? r.screenshotUrls : r.ipadScreenshotUrls || []).slice(0, 3).map(function (s) { return bigArt(s, "1000x1000"); });
        S.app = { mac: mac, ipad: (r.supportedDevices || []).some(function (d) { return /^iPad/i.test(d); }), rating: +r.averageUserRating || 0, count: +r.userRatingCount || 0, genre: r.primaryGenreName || "", price: r.formattedPrice || (r.price ? "$" + r.price : "Free"), icon: null, shots: [] };
        S.title = r.trackName || ""; S.sub = r.artistName || r.sellerName || "";
        note((mac ? "Mac App Store" : "App Store") + " · " + (r.primaryGenreName || ""), false);
        return Promise.all([loadImg(bigArt(r.artworkUrl512 || r.artworkUrl100, mac ? "512x512" : "512x512").replace(/\.jpg$/, mac ? ".png" : ".jpg"))]
          .concat(shots.map(loadImg))).then(function (a) {
          if (my !== token) return;
          S.app.icon = a[0]; S.app.shots = a.slice(1).filter(Boolean); S.pic = a[0];
        });
      });
    } else if (it.own) {
      p = ownPage(it.path).then(function (o) {
        if (my !== token) return;
        S.title = String(o.title || "").replace(/\s+[—–|-]\s+builtoberemembered.*$/i, "");
        if (o.path !== it.path) { it.path = o.path; it.url = "https://" + SITE + o.path; if (!fromList) $("url").value = it.url; }
        return loadImg(o.image).then(function (im) { if (my === token && im && !S.pic) { S.pic = im; S.picSrc = o.image; } });
      });
    } else p = Promise.resolve();
    p.then(function () { if (my === token) { fields(); panels(); draw(); } });
    fields(); ready();
  }
  function note(t, warn) { var n = $("urlNote"); n.textContent = t; n.classList.toggle("warn", !!warn); }

  /* ---------- the topic's links ---------- */
  function topicLinks(t) {
    var out = [], seen = {};
    function add(href, label) {
      href = clean(href); if (!href) return;
      var it = classify(href), key = it.kind === "youtube" ? "yt:" + it.id : it.url.replace(/\/$/, "");
      if (seen[key]) return; seen[key] = 1;
      out.push({ href: href, label: label || "", it: it });
    }
    add("https://" + SITE + "/curation/" + t.slug + "/", "This topic, on the site");
    if (t.song && t.song.src) add(t.song.src, t.song.title ? "Song \u2014 " + t.song.title + (t.song.artist ? ", " + t.song.artist : "") : "The song");
    (t.blocks || []).forEach(function (b) {
      if (b.type === "song" && b.src) add(b.src, b.title ? "Song \u2014 " + b.title : "The song");
      if (b.type === "video" && b.src && ytId(b.src)) add(b.src, "");
    });
    String(t.inspiration || "").split(/\n+/).forEach(function (line) {
      var m = /(https?:\/\/[^\s<>"]+|(?:www\.)[^\s<>"]+)/.exec(line); if (!m) return;
      var label = line.slice(0, m.index).replace(/[\s:\u2014\u2013-]+$/, "").trim();
      add(m[1].replace(/[).,;]+$/, ""), label);
    });
    return out;
  }
  var ICONS = {
    yt: '<svg viewBox="0 0 16 16"><path d="M5.5 3.5v9l7-4.5z" fill="currentColor"/></svg>',
    app: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6.4 3.5 10.6 11M9.6 3.5 5.4 11M3.5 9.6h4M9.4 9.6h3.1"/></svg>',
    web: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>',
    home: '<i class="mk" aria-hidden="true"></i>'
  };
  function renderLinks() {
    var ol = $("links"); ol.innerHTML = "";
    links.forEach(function (l, i) {
      var li = document.createElement("li"); li.className = "lnk"; li.setAttribute("role", "option"); li.tabIndex = 0; li.dataset.i = i;
      var k = l.it.kind === "youtube" ? "yt" : l.it.kind === "app" ? "app" : l.it.own ? "home" : "web";
      var ic = document.createElement("span"); ic.className = "ic " + k; ic.innerHTML = ICONS[k];
      if (k === "yt") { var th = new Image(); th.src = "https://i.ytimg.com/vi/" + l.it.id + "/default.jpg"; th.alt = ""; th.onload = function () { ic.innerHTML = ""; ic.appendChild(th); }; }
      var tx = document.createElement("span"); tx.className = "tx";
      var b = document.createElement("b"); b.textContent = l.label || (k === "yt" ? "YouTube video" : l.it.host);
      var s = document.createElement("small"); s.textContent = kindName(l.it) + (l.label || k === "yt" ? " \u00B7 " + l.it.host : "");
      if (k === "yt" && !/^Song/.test(l.label)) ytInfo(l.it.id).then(function (o) { if (o.title) { b.textContent = o.title; s.textContent = "YouTube" + (o.author_name ? " \u00B7 " + o.author_name : ""); } });
      tx.appendChild(b); tx.appendChild(s); li.appendChild(ic); li.appendChild(tx);
      li.addEventListener("click", function () { $("url").value = ""; choose(l.href, true); });
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); li.click(); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); var n = ol.children[i + (e.key === "ArrowDown" ? 1 : -1)]; if (n) { n.focus(); n.click(); } }
      });
      ol.appendChild(li);
    });
  }
  function markList() {
    [].forEach.call($("links").children, function (li) {
      var l = links[+li.dataset.i];
      li.setAttribute("aria-selected", !!(S.item && l && classify(l.href).url === S.item.url));
    });
  }

  /* ---------- the side panels follow the link ---------- */
  function panels() {
    var it = S.item, k = it && it.kind;
    $("picSec").hidden = !it || k === "app";
    $("wordsSec").hidden = !it;
    $("chromeRow").hidden = k !== "web";
    $("shotsRow").hidden = k !== "app";
    $("stills").hidden = k !== "youtube";
    var has = !!(S.picSrc || (k === "web" && S.pic));
    $("dropImg").hidden = !(k === "web" && S.pic);
    if (k === "web" && S.pic) $("dropImg").src = S.picSrc || S.pic.src;
    $("dropTitle").textContent = k === "youtube" ? "Use your own picture" : has ? "Drop another to replace it" : "Drop a screenshot here";
    $("dropText").textContent = k === "youtube" ? "drop one here, or press ⌘V" : "or take one with ⌘⇧⌃4 and press ⌘V";
    $("rmPic").hidden = !(k === "web" && S.pic) && !(k === "youtube" && S.own);
    $("picVal").textContent = k === "youtube" ? (S.own ? "Your own" : ["Cover", "\u00BC in", "Halfway", "\u00BE in"][S.still]) : "";
    $("titleLbl").textContent = k === "app" ? "Name" : "Title";
    $("subLbl").textContent = k === "app" ? "Maker" : "Under it";
    $("tSub").placeholder = it ? it.host : "";
    $("tTitle").placeholder = k === "web" ? "Optional — the page’s name" : "";
    [].forEach.call($("chrome").children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === S.chrome); });
    swatches();
  }
  function fields() { $("tTitle").value = S.title; $("tSub").value = S.sub; $("kicker").value = S.kicker; }
  function stills(id) {
    var box = $("stills"); box.innerHTML = "";
    ["Cover", "\u00BC", "\u00BD", "\u00BE"].forEach(function (lbl, n) {
      var b = document.createElement("button"); b.type = "button"; b.className = "thumb"; b.setAttribute("aria-pressed", !S.own && S.still === n);
      b.setAttribute("aria-label", n ? "The frame " + lbl + " of the way in" : "The cover");
      var im = document.createElement("img"); im.alt = ""; im.src = "https://i.ytimg.com/vi/" + id + "/" + (n ? "mq" + n : "mqdefault") + ".jpg";
      var s = document.createElement("small"); s.textContent = lbl;
      b.appendChild(im); b.appendChild(s);
      b.addEventListener("click", function () {
        var my = token; S.still = n; S.own = null;
        ytStill(id, n).then(function (p) { if (my === token && p) { S.pic = p; panels(); draw(); } });
        [].forEach.call(box.children, function (x, j) { x.setAttribute("aria-pressed", j === n); });
      });
      box.appendChild(b);
    });
  }
  function swatches() {
    var box = $("swatches"); box.innerHTML = "";
    TONES.forEach(function (t) {
      var b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.style.background = t[0];
      b.title = t[1]; b.setAttribute("aria-label", t[1]); b.setAttribute("aria-pressed", S.bg === t[0]);
      b.addEventListener("click", function () { S.bg = t[0]; swatches(); draw(); });
      box.appendChild(b);
    });
    var bp = bgPic();
    var bl = document.createElement("button"); bl.type = "button"; bl.className = "sw blur"; bl.title = "The picture, blurred"; bl.setAttribute("aria-label", "The picture, blurred");
    bl.setAttribute("aria-pressed", S.bg === "blur"); bl.disabled = !bp;
    if (bp) bl.style.backgroundImage = "url(" + JSON.stringify(bp.src) + ")"; else { bl.style.background = "linear-gradient(135deg,#ddd,#bbb)"; bl.style.opacity = "0.4"; }
    bl.addEventListener("click", function () { S.bg = "blur"; swatches(); draw(); });
    box.appendChild(bl);
  }
  function ready() {
    var on = !!S.item;
    $("save").disabled = !on; $("copyLink").disabled = !on; $("copyTop").disabled = !on;
  }

  /* ---------- drawing ---------- */
  function toneDark(hex) {
    var n = parseInt(String(hex).slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
  }
  function bgPic() { return S.item && S.item.kind === "app" ? S.app && S.app.icon : S.pic; }
  function rr(x, px, py, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(px, py, w, h, r); else x.rect(px, py, w, h); }
  function cover(x, im, px, py, w, h, alignTop) {
    var nw = im.naturalWidth, nh = im.naturalHeight, s = Math.max(w / nw, h / nh), dw = nw * s, dh = nh * s;
    x.drawImage(im, px + (w - dw) / 2, alignTop ? py : py + (h - dh) / 2, dw, dh);
  }
  // text in at most `max` lines of `maxW`, an ellipsis where it's cut
  function lines(x, text, maxW, max) {
    var out = [], cur = "";
    String(text || "").split(/\s+/).filter(Boolean).forEach(function (w) {
      var t = cur ? cur + " " + w : w;
      if (!cur || x.measureText(t).width <= maxW) cur = t; else { out.push(cur); cur = w; }
    });
    if (cur) out.push(cur);
    var cut = out.length > max; out = out.slice(0, max);
    function fit(l, more) {
      if (!more && x.measureText(l).width <= maxW) return l;
      while (l.length > 1 && x.measureText(l + "\u2026").width > maxW) l = l.slice(0, -1);
      return l.replace(/[\s,;:.\u2014\u2013-]+$/, "") + "\u2026";
    }
    return out.map(function (l, i) { return fit(l, cut && i === out.length - 1); });
  }
  function shadowed(x, fn, k) {
    x.save(); x.shadowColor = "rgba(0,0,0," + (0.22 * (k || 1)) + ")"; x.shadowBlur = 70; x.shadowOffsetY = 28; fn(); x.restore();
    x.save(); x.shadowColor = "rgba(0,0,0,0.12)"; x.shadowBlur = 6; x.shadowOffsetY = 2; fn(); x.restore();
  }
  // the words under a window: title (two lines at most), then the source
  function caption(x, w, ink, soft) {
    var t = S.title.trim(), s = S.sub.trim(), h = 0, tl = [];
    x.font = "700 46px " + SANS; if (t) tl = lines(x, t, w - 40, 2);
    h = (tl.length ? 44 + tl.length * 56 : 0) + (s ? (tl.length ? 14 : 44) + 36 : 0);
    return { h: h, paint: function (y) {
      x.textAlign = "center"; x.textBaseline = "alphabetic";
      var yy = y + 44;
      if (tl.length) { x.fillStyle = ink; x.font = "700 46px " + SANS; tl.forEach(function (l) { yy += 46; x.fillText(l, w / 2, yy); yy += 10; }); yy += 4; }
      if (s) { x.fillStyle = soft; x.font = "400 32px " + SANS; x.fillText(s, w / 2, yy + 32); }
    } };
  }
  var chromeCache = {};
  function ytBlock(x, ink, soft) {
    var w = 920, p = MacWin.preview({ cw: 720, ch: 405, title: "youtube.com" }), k = w / p.w, wh = p.h * k;
    var cap = caption(x, w, ink, soft);
    return { w: w, h: wh + cap.h, paint: function () {
      var key = p.svg; var ch = chromeCache[key];
      if (!ch) { chromeCache[key] = "loading"; MacWin.svgImage(p.svg).then(function (im) { chromeCache[key] = im; draw(); }); }
      shadowed(x, function () { rr(x, 0, 0, w, wh, 16 * k); x.fillStyle = "#1c1c1e"; x.fill(); });
      var hx = p.hole.x * k, hy = p.hole.y * k, hw = p.hole.w * k, hh = p.hole.h * k;
      x.save(); rr(x, hx, hy, hw, hh, p.hole.r * k); x.clip(); x.fillStyle = "#000"; x.fillRect(hx, hy, hw, hh);
      if (S.pic) cover(x, S.pic, hx, hy, hw, hh);
      x.restore();
      if (ch && ch !== "loading") x.drawImage(ch, 0, 0, w, wh);
      // a play button, frosted
      var cx = hx + hw / 2, cy = hy + hh / 2;
      x.save(); x.beginPath(); x.arc(cx, cy, 64, 0, Math.PI * 2); x.fillStyle = "rgba(255,255,255,0.86)";
      x.shadowColor = "rgba(0,0,0,0.25)"; x.shadowBlur = 24; x.fill(); x.restore();
      x.beginPath(); x.moveTo(cx - 18, cy - 28); x.lineTo(cx + 30, cy); x.lineTo(cx - 18, cy + 28); x.closePath(); x.fillStyle = "#1d1d1f"; x.fill();
      cap.paint(wh);
    } };
  }
  function webBlock(x, ink, soft) {
    var w = 920, bar = 92, r = 26, dark = S.chrome === "dark";
    var ch = S.pic ? Math.max(0.56 * w, Math.min(1.25 * w, w * S.pic.naturalHeight / S.pic.naturalWidth)) : 0.62 * w;
    var wh = bar + ch, cap = caption(x, w, ink, soft);
    return { w: w, h: wh + cap.h, paint: function () {
      shadowed(x, function () { rr(x, 0, 0, w, wh, r); x.fillStyle = dark ? "#1e1e1e" : "#fff"; x.fill(); });
      x.save(); rr(x, 0, 0, w, wh, r); x.clip();
      x.fillStyle = dark ? "#2c2c2e" : "#f6f6f6"; x.fillRect(0, 0, w, bar);
      x.fillStyle = dark ? "#000" : "#d9d9d9"; x.fillRect(0, bar - 1.5, w, 1.5);
      if (S.pic) cover(x, S.pic, 0, bar, w, ch, true);
      else {
        x.fillStyle = dark ? "#1e1e1e" : "#fbfbfd"; x.fillRect(0, bar, w, ch);
        x.fillStyle = dark ? "#f5f5f7" : "#1d1d1f"; x.font = "700 64px " + SYS; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(lines(x, S.item.host, w - 120, 1)[0], w / 2, bar + ch / 2);
      }
      x.restore();
      x.save(); rr(x, 0.75, 0.75, w - 1.5, wh - 1.5, r); x.strokeStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"; x.lineWidth = 1.5; x.stroke(); x.restore();
      [["#ff5f57", 40], ["#febc2e", 76], ["#28c840", 112]].forEach(function (d) { x.beginPath(); x.arc(d[1], bar / 2, 13, 0, Math.PI * 2); x.fillStyle = d[0]; x.fill(); });
      // the address field, with a lock and the site
      var fw = Math.min(560, w - 340), fx = (w - fw) / 2, fy = bar / 2 - 27;
      rr(x, fx, fy, fw, 54, 14); x.fillStyle = dark ? "#3a3a3c" : "#e8e8ea"; x.fill();
      x.font = "500 28px " + SYS; x.textBaseline = "middle"; x.textAlign = "left";
      var host = lines(x, S.item.host, fw - 100, 1)[0], tw = x.measureText(host).width, lx = w / 2 - (tw + 30) / 2, cy = bar / 2 + 1;
      x.fillStyle = dark ? "#aeaeb2" : "#6e6e73";
      rr(x, lx, cy - 4, 18, 14, 3); x.fill();
      x.beginPath(); x.lineWidth = 3; x.strokeStyle = x.fillStyle; x.arc(lx + 9, cy - 5, 6, Math.PI, 0); x.stroke();
      x.fillStyle = dark ? "#e5e5ea" : "#1d1d1f"; x.fillText(host, lx + 30, cy);
      cap.paint(wh);
    } };
  }
  function appBlock() {
    var a = S.app, w = 920, pad = 56, icon = 196, gap = 40;
    var shots = S.shots && a && a.shots.length ? a.shots : [];
    var land = shots.length && shots[0].naturalWidth > shots[0].naturalHeight;
    if (land) shots = shots.slice(0, 1);
    var sw = land ? w - 2 * pad : (w - 2 * pad - 2 * 20) / 3;
    var sh = shots.length ? Math.min(sw * shots[0].naturalHeight / shots[0].naturalWidth, land ? 560 : 620) : 0;
    var info = 120;
    // name (two lines at most) and maker beside the icon, the Get button under them — never over them
    var tx = pad + icon + 36, tw = w - tx - pad;
    x0.font = "700 46px " + SYS; var nl = lines(x0, S.title || "\u2026", tw, 2);
    var makerY = pad + 46 + (nl.length - 1) * 54 + 44;
    var gy = Math.max(pad + icon - 58, makerY + 26), head = Math.max(icon, gy + 58 - pad);
    var h = pad + head + gap + info + (shots.length ? gap + sh : 0) + pad;
    return { w: w, h: h, paint: function () {
      shadowed(x0, function () { rr(x0, 0, 0, w, h, 56); x0.fillStyle = "#fff"; x0.fill(); });
      var x = x0;
      // icon
      if (a && a.icon) {
        x.save();
        if (!a.mac) { rr(x, pad, pad, icon, icon, icon * 0.2237); x.clip(); }
        x.drawImage(a.icon, pad, pad, icon, icon); x.restore();
        if (!a.mac) { rr(x, pad + 0.75, pad + 0.75, icon - 1.5, icon - 1.5, icon * 0.2237); x.strokeStyle = "rgba(0,0,0,0.1)"; x.lineWidth = 1.5; x.stroke(); }
      } else { rr(x, pad, pad, icon, icon, icon * 0.2237); x.fillStyle = "#f2f2f7"; x.fill(); }
      x.textAlign = "left"; x.textBaseline = "alphabetic";
      x.font = "700 46px " + SYS; x.fillStyle = "#1d1d1f";
      nl.forEach(function (l, i) { x.fillText(l, tx, pad + 46 + i * 54); });
      x.font = "400 30px " + SYS; x.fillStyle = "#6e6e73";
      x.fillText(lines(x, S.sub, tw, 1)[0] || "", tx, makerY);
      rr(x, tx, gy, 146, 58, 29); x.fillStyle = "#0071e3"; x.fill();
      x.fillStyle = "#fff"; x.font = "700 30px " + SYS; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(a && a.price && !/^free$|^gratuit$|^0/i.test(a.price) ? a.price : "Get", tx + 73, gy + 30);
      if (a && a.mac) { x.fillStyle = "#86868b"; x.font = "500 24px " + SYS; x.textAlign = "left"; x.fillText("Mac App Store", tx + 166, gy + 30); }
      // the info strip
      var iy = pad + head + gap;
      x.fillStyle = "rgba(0,0,0,0.1)"; x.fillRect(pad, iy, w - 2 * pad, 1.5);
      var cols = [];
      if (a && a.rating && a.count >= 5) cols.push([a.rating.toFixed(1) + " \u2605", "", short(a.count) + " ratings"]);
      if (a && a.genre) cols.push([a.genre, "", "Category"]);
      cols.push([a && a.mac ? "Mac" : "iPhone", "", a && a.mac ? "Platform" : a && a.ipad ? "Also on iPad" : "Platform"]);
      var cw = (w - 2 * pad) / cols.length;
      cols.forEach(function (c, i) {
        var cx = pad + cw * i + cw / 2;
        if (i) { x.fillStyle = "rgba(0,0,0,0.1)"; x.fillRect(pad + cw * i, iy + 30, 1.5, info - 40); }
        x.textAlign = "center"; x.textBaseline = "alphabetic";
        x.fillStyle = "#6e6e73"; x.font = "700 36px " + SYS; x.fillText(lines(x, c[0], cw - 20, 1)[0], cx, iy + 62);
        x.font = "400 25px " + SYS; x.fillStyle = "#86868b"; x.fillText(lines(x, c[1] ? c[1] + "  " + c[2] : c[2], cw - 16, 1)[0], cx, iy + 102);
      });
      // screenshots
      if (shots.length) {
        var sy = iy + info + gap;
        shots.forEach(function (im, i) {
          var sx = pad + i * (sw + 20);
          x.save(); rr(x, sx, sy, sw, sh, land ? 18 : 26); x.clip(); cover(x, im, sx, sy, sw, sh, true); x.restore();
          rr(x, sx + 0.75, sy + 0.75, sw - 1.5, sh - 1.5, land ? 18 : 26); x.strokeStyle = "rgba(0,0,0,0.08)"; x.lineWidth = 1.5; x.stroke();
        });
      }
    } };
  }
  var x0 = null;
  function short(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K" : String(n); }

  function paint(c) {
    var x = c.getContext("2d"); x0 = x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
    var dark, bp = bgPic();
    if (S.bg === "blur" && bp) {
      x.fillStyle = "#222"; x.fillRect(0, 0, W, H);
      x.save(); x.filter = "blur(70px) saturate(1.25)"; cover(x, bp, -160, -160, W + 320, H + 320); x.restore();
      x.fillStyle = "rgba(0,0,0,0.3)"; x.fillRect(0, 0, W, H);
      dark = true;
    } else { x.fillStyle = S.bg === "blur" ? "#e6e4e6" : S.bg; x.fillRect(0, 0, W, H); dark = toneDark(S.bg === "blur" ? "#e6e4e6" : S.bg); }
    var ink = dark ? "#f5f5f7" : "#1d1d1f", soft = dark ? "rgba(245,245,247,0.64)" : "#6e6e73";
    if (!S.item) return;

    if (S.kicker.trim()) {
      x.fillStyle = soft; x.font = "500 40px " + SANS; x.textAlign = "center"; x.textBaseline = "alphabetic";
      if ("letterSpacing" in x) x.letterSpacing = "0.5px";
      x.fillText(lines(x, S.kicker.trim(), W - 200, 1)[0], W / 2, 326);
      if ("letterSpacing" in x) x.letterSpacing = "0px";
    }
    var b = S.item.kind === "youtube" ? ytBlock(x, ink, soft) : S.item.kind === "app" ? appBlock() : webBlock(x, ink, soft);
    var s = Math.min(1, (BOTTOM - TOP) / b.h);
    x.save(); x.translate(W / 2, (TOP + BOTTOM) / 2); x.scale(s, s); x.translate(-b.w / 2, -b.h / 2); b.paint(); x.restore();

    if (S.sign) {
      var mh = 48, label = "builtoberemembered";
      x.font = "500 27px " + SANS; if ("letterSpacing" in x) x.letterSpacing = "0.3px";
      var tw = x.measureText(label).width, gap = 12, sx = (W - ((markImg ? mh + gap : 0) + tw)) / 2;
      if (markImg) { x.drawImage(markIn(soft, 96), sx, SIGN_Y - mh / 2, mh, mh); sx += mh + gap; }
      x.fillStyle = soft; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText(label, sx, SIGN_Y + 1);
      if ("letterSpacing" in x) x.letterSpacing = "0px";
    }
  }
  var raf = 0;
  function draw() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      paint($("view"));
      var it = S.item;
      $("sticker").hidden = !it; $("sticker").style.top = (STICKER_Y / H * 100) + "%";
      if (it) $("stickerHost").textContent = it.host.replace(/^www\./, "");
      $("hint").hidden = !!(it && (it.kind !== "web" || S.pic));
      $("hintText").textContent = it ? "Drop a screenshot of the page here, or press ⌘V" : "Paste a link to begin";
    });
  }

  /* ---------- your own picture ---------- */
  function setPicFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    if (!S.item) { toast("Paste a link first, then its picture."); return; }
    if (S.item.kind === "app") { toast("App Store stories use the app’s own icon and screenshots."); return; }
    var url = URL.createObjectURL(file), my = token;
    loadImg(url).then(function (im) {
      if (!im || my !== token) return;
      S.pic = im; S.picSrc = url; if (S.item.kind === "youtube") S.own = url;
      if (S.item.kind === "youtube") [].forEach.call($("stills").children, function (x) { x.setAttribute("aria-pressed", false); });
      panels(); draw();
    });
  }
  $("choose").addEventListener("click", function () { $("file").click(); });
  $("file").addEventListener("change", function () { setPicFile(this.files[0]); this.value = ""; });
  $("rmPic").addEventListener("click", function () {
    if (S.item.kind === "youtube") { S.own = null; var n = S.still; S.still = -1; $("stills").children[n] && $("stills").children[n].click(); return; }
    S.pic = null; S.picSrc = ""; panels(); draw();
  });
  [$("drop"), $("screen")].forEach(function (z) {
    z.addEventListener("dragover", function (e) { if ([].indexOf.call(e.dataTransfer.types, "Files") < 0) return; e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", function () { z.classList.remove("over"); });
    z.addEventListener("drop", function (e) { e.preventDefault(); z.classList.remove("over"); setPicFile(e.dataTransfer.files[0]); });
  });
  document.addEventListener("paste", function (e) {
    var cd = e.clipboardData; if (!cd) return;
    var file = [].filter.call(cd.files || [], function (f) { return /^image\//.test(f.type); })[0];
    if (file) { e.preventDefault(); setPicFile(file); return; }
    var inField = e.target.closest && e.target.closest("input, textarea");
    if (inField && inField.id !== "url") return;
    var text = (cd.getData("text/plain") || "").trim();
    if (!clean(text)) return;
    e.preventDefault(); $("url").value = text; choose(text);
  });

  /* ---------- the rest of the controls ---------- */
  $("urlForm").addEventListener("submit", function (e) { e.preventDefault(); if ($("url").value.trim()) choose($("url").value); });
  $("url").addEventListener("blur", function () { var v = clean(this.value); if (v && (!S.item || v !== S.item.url)) choose(v); });
  $("tTitle").addEventListener("input", function () { S.title = this.value; draw(); });
  $("tSub").addEventListener("input", function () { S.sub = this.value; draw(); });
  $("kicker").addEventListener("input", function () { S.kicker = this.value; S.kickerSet = true; draw(); });
  $("chrome").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { S.chrome = b.dataset.v; panels(); draw(); } });
  $("shots").addEventListener("change", function () { S.shots = this.checked; draw(); });
  $("sign").addEventListener("change", function () { S.sign = this.checked; draw(); });

  var tt = 0;
  function toast(t) { var n = $("toast"); n.textContent = t; n.hidden = false; clearTimeout(tt); tt = setTimeout(function () { n.hidden = true; }, 5200); }
  function copyLink() {
    if (!S.item) return Promise.resolve(false);
    return navigator.clipboard.writeText(S.item.url).then(function () { return true; }, function () { return false; });
  }
  function onCopy() { copyLink().then(function (ok) { toast(ok ? "Link copied — paste it into the Link sticker." : "Couldn’t copy. The link is " + S.item.url); }); }
  $("copyLink").addEventListener("click", onCopy);
  $("copyTop").addEventListener("click", onCopy);
  function fileName() {
    var it = S.item, base = it.kind === "youtube" ? "youtube-" + it.id : it.kind === "app" ? "app-" + (S.title || it.id) : it.host + (it.own ? it.path : "");
    return "story-" + String(base).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) + ".png";
  }
  $("save").addEventListener("click", function () {
    if (!S.item) return;
    var btn = this; btn.disabled = true;
    var copied = copyLink();               // while the click still counts as yours
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    paint(c);
    c.toBlob(function (blob) {
      btn.disabled = false;
      if (!blob) { toast("Couldn’t make the picture — a picture from another site may be blocking it."); return; }
      var a = document.createElement("a"), name = fileName();
      a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      copied.then(function (ok) { toast("Saved " + name + " (1080 × 1920)." + (ok ? " The link is copied — paste it into a Link sticker." : "")); });
    }, "image/png");
  });

  /* ---------- start ---------- */
  loadImg(MARK_SRC).then(function (im) { markImg = im; draw(); });
  swatches(); draw();
  var slug = q.get("t"), first = q.get("u");
  if (slug) {
    fetch("/curation/topics/" + encodeURIComponent(slug) + ".json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (t) {
      topic = t; document.title = "Story · " + t.title + " — Curation Studio";
      $("ofTopic").textContent = " \u00B7 " + t.title; $("topicTitle").textContent = "\u201C" + t.title + "\u201D";
      if (t.tone) S.bg = t.tone;
      links = topicLinks(t); $("fromTopic").hidden = !links.length; $("urlHead").textContent = "Another link";
      renderLinks();
      if (first) choose(first); else if (links.length) choose(links[0].href, true);
    }).catch(function () { toast("Couldn’t load that topic."); if (first) choose(first); });
  } else if (first) choose(first);
  else setTimeout(function () { $("url").focus(); }, 50);
})();
