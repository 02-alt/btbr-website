/* MacWin — dark macOS window chrome, drawn as SVG so Studio (baking boards and
   images) and the site (framing videos) render the exact same window.

   Two windows:
   - preview: the Quick Look / Preview window (⊗ ⤢ · filename · markup,
     rotate, share, "Open with Preview") with a hole the content shows through
   - textedit: a TextEdit window (traffic lights, "Untitled — Edited", the
     format toolbar, the ruler) holding the text itself

   Everything is laid out in points; callers scale the SVG/bitmap as they like. */
(function () {
  "use strict";
  if (window.MacWin) return;

  var FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";
  var RATIOS = [
    { id: "orig", label: "Original" }, { id: "16:9", label: "16:9" }, { id: "3:2", label: "3:2" },
    { id: "4:3", label: "4:3" }, { id: "1:1", label: "1:1" }, { id: "4:5", label: "4:5" }, { id: "9:16", label: "9:16" }
  ];

  var mctx = null;
  function measure(text, size, weight) {
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    mctx.font = (weight || 400) + " " + size + "px " + FONT;
    return mctx.measureText(text).width;
  }
  function x(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function n(v) { return Math.round(v * 100) / 100; }
  function rr(px, py, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    return "M" + n(px + r) + " " + n(py) + "H" + n(px + w - r) + "A" + n(r) + " " + n(r) + " 0 0 1 " + n(px + w) + " " + n(py + r)
      + "V" + n(py + h - r) + "A" + n(r) + " " + n(r) + " 0 0 1 " + n(px + w - r) + " " + n(py + h)
      + "H" + n(px + r) + "A" + n(r) + " " + n(r) + " 0 0 1 " + n(px) + " " + n(py + h - r)
      + "V" + n(py + r) + "A" + n(r) + " " + n(r) + " 0 0 1 " + n(px + r) + " " + n(py) + "Z";
  }
  function txt(s, px, py, size, weight, fill, anchor) {
    return '<text x="' + n(px) + '" y="' + n(py) + '" font-family="' + FONT + '" font-size="' + size + '" font-weight="' + (weight || 400)
      + '" fill="' + fill + '"' + (anchor ? ' text-anchor="' + anchor + '"' : "") + ">" + x(s) + "</text>";
  }
  function g(px, py, inner, stroke, sw, k) {
    return '<g transform="translate(' + n(px) + " " + n(py) + ')' + (k ? " scale(" + k + ")" : "") + '" fill="none" stroke="' + (stroke || "#98989d") + '" stroke-width="' + (sw || 1.25)
      + '" stroke-linecap="round" stroke-linejoin="round">' + inner + "</g>";
  }
  function ellipsize(s, max, size, weight) {
    if (measure(s, size, weight) <= max) return s;
    while (s.length > 1 && measure(s + "\u2026", size, weight) > max) s = s.slice(0, -1);
    return s + "\u2026";
  }
  function svgDoc(w, h, body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(w) + '" height="' + n(h) + '" viewBox="0 0 ' + n(w) + " " + n(h) + '">' + body + "</svg>";
  }

  // content size (pt) for a ratio: the long side is 720pt
  function contentSize(ratio, natW, natH) {
    var r = ratio && ratio !== "orig" ? (function (p) { return +p[0] / +p[1]; })(ratio.split(":")) : (natW && natH ? natW / natH : 16 / 9);
    return r >= 1 ? { w: 720, h: 720 / r } : { w: 720 * r, h: 720 };
  }

  /* ---------- Preview / Quick Look window ----------
     Metrics measured off a real dark Quick Look window, scaled so its title
     is the system's 13pt bold window title: a 37pt title bar, filled 12pt
     close / full-screen discs, 13.5pt outline toolbar glyphs ~40pt apart,
     and a 23pt "Open with Preview" capsule set in 13pt. */
  var P = { R: 16, TB: 37, I: 3, HR: 13 };
  function preview(o) {
    var cw = o.cw, ch = o.ch, I = P.I, TB = P.TB;
    var W = cw + 2 * I, H = TB + ch + I;
    var hole = { x: I, y: TB, w: cw, h: ch, r: P.HR };
    var cy = TB / 2 + 0.5;
    var s = "";
    s += '<path fill-rule="evenodd" fill="#1c1c1e" d="' + rr(0, 0, W, H, P.R) + " " + rr(hole.x, hole.y, hole.w, hole.h, hole.r) + '"/>';
    s += '<path fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1" d="' + rr(0.5, 0.5, W - 1, H - 1, P.R - 0.5) + '"/>';
    s += '<path fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1" d="' + rr(hole.x - 0.5, hole.y - 0.5, hole.w + 1, hole.h + 1, hole.r + 0.5) + '"/>';
    // left: close and full-screen — filled grey discs with the glyph knocked out dark
    s += '<circle cx="19" cy="' + n(cy) + '" r="6.2" fill="#86868b"/>' + g(19, cy, '<path d="M-2.3 -2.3L2.3 2.3M2.3 -2.3L-2.3 2.3"/>', "#1c1c1e", 1.5);
    s += '<circle cx="38.5" cy="' + n(cy) + '" r="6.2" fill="#86868b"/>' + g(38.5, cy, '<path d="M-2.4 2.4L2.4 -2.4M0.3 -2.6H2.6V-0.3M-0.3 2.6H-2.6V0.3"/>', "#1c1c1e", 1.4);
    var left = 53;
    // right: markup · rotate · share · Open with Preview (dropped as the window narrows)
    var pillT = "Open with Preview", pillW = measure(pillT, 13, 500) + 24, iconsW = 25 + 37 + 42 + 10;
    var titleMin = Math.min(measure(o.title || "", 13, 700), 90);
    var room = W - left - titleMin - 16;
    var showPill = room >= pillW + iconsW + 8, showIcons = room >= iconsW + 4;
    var rx = W - 8.5;
    if (showPill) {
      rx -= pillW;
      s += '<rect x="' + n(rx) + '" y="' + n(cy - 11.5) + '" width="' + n(pillW) + '" height="23" rx="7.5" fill="rgba(255,255,255,0.12)"/>';
      s += txt(pillT, rx + pillW / 2, cy + 4.6, 13, 500, "#ececf0", "middle");
    } else rx -= 4;
    if (showIcons) {
      var k = 1.3, ic = "#8e8e93";
      rx -= showPill ? 25 : 12; s += g(rx, cy, '<path d="M-3.6 -0.6H-5.2V5.6H5.2V-0.6H3.6M0 2.4V-6M-2.4 -3.6L0 -6L2.4 -3.6"/>', ic, 1.05, k); // share
      rx -= 37; s += g(rx, cy, '<rect x="-2.6" y="-1.8" width="8" height="7.4" rx="1.6"/><path d="M-5.4 2.2V-0.6A3.4 3.4 0 0 1 -2 -4H1.6M-0.2 -5.8L1.6 -4L-0.2 -2.2"/>', ic, 1.05, k); // rotate
      rx -= 42; s += g(rx, cy, '<circle r="6.4"/><path d="M-2.6 3.2L-1.9 0.6L1.4 -2.7L3 -1.1L-0.3 2.2Z"/>', ic, 1.05, k); // markup
      rx -= 12;
    }
    var maxTitle = rx - left - 8;
    s += txt(ellipsize(o.title || "", Math.max(maxTitle, 20), 13, 700), left, cy + 4.6, 13, 700, "#f2f2f7");
    return { w: W, h: H, hole: hole, svg: svgDoc(W, H, s) };
  }

  /* ---------- TextEdit window ----------
     Just the title bar (12pt traffic lights every 20pt, 13pt bold title) over
     the page — no format bar or ruler. Five looks for readability:
       note   dark page, 17pt, airy 1.55 leading
       large  a short statement: 23pt semibold, tight
       paper  a light page (black on white) — pops between dark windows
       lead   first paragraph as a 21pt lead-in, the rest quieter at 15pt
       serif  New York at 19pt, editorial
     In any look, **words** are set bold and ==words== get a highlighter. */
  var SERIF = "'New York', ui-serif, Charter, 'Iowan Old Style', Georgia, serif";
  var LOOKS = {
    note:  { fs: 17, lh: 1.55, w: 400, pad: 24, ink: "#e5e5ea", strong: "#ffffff", bg: "#1e1e1e", bar: "#262628", mark: "rgba(255,214,10,0.38)" },
    large: { fs: 23, lh: 1.32, w: 600, pad: 26, ink: "#f2f2f7", strong: "#ffffff", bg: "#1e1e1e", bar: "#262628", mark: "rgba(255,214,10,0.42)", track: -0.3 },
    paper: { fs: 17, lh: 1.55, w: 400, pad: 24, ink: "#1d1d1f", strong: "#000000", bg: "#ffffff", bar: "#ececee", mark: "rgba(255,214,10,0.55)", light: true },
    lead:  { fs: 15, lh: 1.6, w: 400, pad: 24, ink: "#a1a1a6", strong: "#ffffff", bg: "#1e1e1e", bar: "#262628", mark: "rgba(255,214,10,0.38)", leadFs: 21, leadW: 600, leadInk: "#f5f5f7" },
    serif: { fs: 19, lh: 1.6, w: 400, pad: 26, ink: "#ececf0", strong: "#ffffff", bg: "#1e1e1e", bar: "#262628", mark: "rgba(255,214,10,0.38)", font: SERIF }
  };
  var TE = { R: 14, TB: 30 };
  // **bold** / ==highlight== → words carrying their style
  function tokens(para) {
    var out = [], re = /(\*\*([^*]+)\*\*|==([^=]+)==)/g, last = 0, m, prevSpace = false;
    // `pre`: whitespace before the word, so "texture==." keeps its full stop attached
    function push(str, b, h) {
      var wr = /\S+/g, k;
      while ((k = wr.exec(str))) out.push({ t: k[0], b: b, h: h, pre: k.index > 0 || prevSpace });
      prevSpace = /\s$/.test(str);
    }
    while ((m = re.exec(para))) {
      if (m.index > last) push(para.slice(last, m.index), false, false);
      push(m[2] || m[3], !!m[2], !!m[3]);
      last = re.lastIndex;
    }
    if (last < para.length) push(para.slice(last), false, false);
    return out;
  }
  function fontOf(L) { return L.font || FONT; }
  function measureF(t, size, weight, font) {
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    mctx.font = (weight || 400) + " " + size + "px " + font;
    return mctx.measureText(t).width;
  }
  function textedit(o) {
    var L = LOOKS[o.look] || LOOKS.note, W = o.width || 680, TB = TE.TB, pad = L.pad, font = fontOf(L);
    var maxW = W - 2 * pad, y = TB + pad - 4, body = "", marks = "", first = true;
    String(o.text || "").replace(/\r/g, "").split(/\n\s*\n/).forEach(function (para) {
      para = para.replace(/\n/g, " ").trim(); if (!para) return;
      var isLead = L.leadFs && first, fs = isLead ? L.leadFs : L.fs, wt = isLead ? L.leadW : L.w, ink = isLead ? L.leadInk : L.ink;
      var lh = fs * L.lh, space = measureF(" ", fs, wt, font);
      if (!first) y += fs * 0.75; // paragraph gap
      first = false;
      var line = [], lw = 0, lines = [];
      tokens(para).forEach(function (tk) {
        var w = measureF(tk.t, fs, tk.b ? Math.max(wt, 650) : wt, font);
        if (line.length && tk.pre && lw + space + w > maxW) { lines.push(line); line = []; lw = 0; }
        tk.w = w; tk.x = line.length ? lw + (tk.pre ? space : 0) : 0; lw = tk.x + w; line.push(tk);
      });
      if (line.length) lines.push(line);
      lines.forEach(function (ln) {
        y += lh;
        var base = y - (lh - fs) / 2 - fs * 0.22, run = "";
        ln.forEach(function (tk, i) {
          // highlighter: one rounded swipe per marked run
          if (tk.h && !(i && ln[i - 1].h)) {
            var j = i; while (j + 1 < ln.length && ln[j + 1].h) j++;
            var x0 = pad + tk.x - 2.5, x1 = pad + ln[j].x + ln[j].w + 2.5;
            marks += '<rect x="' + n(x0) + '" y="' + n(base - fs * 0.86) + '" width="' + n(x1 - x0) + '" height="' + n(fs * 1.16) + '" rx="' + n(fs * 0.22) + '" fill="' + L.mark + '"/>';
          }
          var wgt = tk.b ? Math.max(wt, 650) : wt, col = tk.b || tk.h ? L.strong : ink;
          run += '<tspan x="' + n(pad + tk.x) + '" font-weight="' + wgt + '" fill="' + col + '">' + x(tk.t) + "</tspan>";
        });
        body += '<text y="' + n(base) + '" font-family="' + x(font).replace(/&quot;/g, "'") + '" font-size="' + fs + '"' + (L.track ? ' letter-spacing="' + L.track + '"' : "") + ">" + run + "</text>";
      });
    });
    var H = Math.max(y + pad, TB + 64);
    var s = "";
    s += '<path fill="' + L.bg + '" d="' + rr(0, 0, W, H, TE.R) + '"/>';
    s += '<clipPath id="tw"><path d="' + rr(0, 0, W, H, TE.R) + '"/></clipPath>';
    s += '<rect clip-path="url(#tw)" x="0" y="0" width="' + n(W) + '" height="' + TB + '" fill="' + L.bar + '"/>';
    s += '<rect x="0" y="' + TB + '" width="' + n(W) + '" height="1" fill="' + (L.light ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.45)") + '"/>';
    [["#ff5f57", "#e0443e"], ["#febc2e", "#dea123"], ["#28c840", "#1aab29"]].forEach(function (c, i) {
      s += '<circle cx="' + (15 + i * 20) + '" cy="' + (TB / 2) + '" r="6" fill="' + c[0] + '" stroke="' + c[1] + '" stroke-width="0.6"/>';
    });
    var tx = 80, ty = TB / 2, title = o.title || "Untitled", tw = measure(title, 13, 700);
    s += '<path fill="' + (L.light ? "#8e8e93" : "#d1d1d6") + '" d="M' + tx + " " + (ty - 7) + "h6.2l3.8 3.8v10.2h-10z" + '"/><path fill="' + (L.light ? "#c7c7cc" : "#9a9aa0") + '" d="M' + (tx + 6.2) + " " + (ty - 7) + "v3.8h3.8z" + '"/>';
    s += txt(title, tx + 16, ty + 4.6, 13, 700, L.light ? "#1d1d1f" : "#e5e5ea");
    if (o.edited !== false) s += txt("\u2014 Edited", tx + 16 + tw + 6, ty + 4.6, 13, 400, L.light ? "#8e8e93" : "#7c7c82");
    s += marks + body;
    s += '<path fill="none" stroke="' + (L.light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.13)") + '" stroke-width="1" d="' + rr(0.5, 0.5, W - 1, H - 1, TE.R - 0.5) + '"/>';
    return { w: W, h: H, svg: svgDoc(W, H, s) };
  }

  /* ---------- rasterising ---------- */
  function svgImage(svg) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }
  function loadImg(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.crossOrigin = "anonymous"; im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
  }
  // draw `el` (image/video) into the rect, cropped (fill) or letterboxed (fit)
  function drawInto(ctx, el, nw, nh, rx, ry, rw, rh, fit) {
    if (!nw || !nh) return;
    var s = fit === "fit" ? Math.min(rw / nw, rh / nh) : Math.max(rw / nw, rh / nh);
    var dw = nw * s, dh = nh * s;
    ctx.drawImage(el, rx + (rw - dw) / 2, ry + (rh - dh) / 2, dw, dh);
  }
  function clipRR(ctx, rx, ry, rw, rh, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, r); else ctx.rect(rx, ry, rw, rh);
    ctx.clip();
  }
  function toBlobURL(c) { return new Promise(function (res) { c.toBlob(function (b) { res(b ? URL.createObjectURL(b) : ""); }, "image/png"); }); }

  // a Preview window around an image → PNG blob URL (2× for crispness)
  function bakePreview(src, win, scale) {
    scale = scale || 2;
    return loadImg(src).then(function (im) {
      var cs = contentSize(win.ratio, im.naturalWidth, im.naturalHeight);
      var p = preview({ cw: cs.w, ch: cs.h, title: win.title });
      return svgImage(p.svg).then(function (chrome) {
        var c = document.createElement("canvas"); c.width = Math.round(p.w * scale); c.height = Math.round(p.h * scale);
        var ctx = c.getContext("2d"); ctx.scale(scale, scale);
        ctx.save(); ctx.fillStyle = "#000"; clipRR(ctx, p.hole.x, p.hole.y, p.hole.w, p.hole.h, p.hole.r);
        ctx.fillRect(p.hole.x, p.hole.y, p.hole.w, p.hole.h);
        drawInto(ctx, im, im.naturalWidth, im.naturalHeight, p.hole.x, p.hole.y, p.hole.w, p.hole.h, win.fit);
        ctx.restore();
        ctx.drawImage(chrome, 0, 0, p.w, p.h);
        return toBlobURL(c);
      });
    });
  }
  // a TextEdit window → PNG blob URL
  function bakeText(win, scale) {
    scale = scale || 2;
    var t = textedit({ title: win.title, text: win.text, width: win.width, look: win.look, edited: win.edited });
    return svgImage(t.svg).then(function (im) {
      var c = document.createElement("canvas"); c.width = Math.round(t.w * scale); c.height = Math.round(t.h * scale);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      return toBlobURL(c);
    });
  }
  // chrome (with its hole) for a video, to draw every frame: { img, w, h, hole }
  function videoChrome(win, natW, natH) {
    var cs = contentSize(win.ratio, natW, natH);
    var p = preview({ cw: cs.w, ch: cs.h, title: win.title });
    return svgImage(p.svg).then(function (img) { return { img: img, w: p.w, h: p.h, hole: p.hole }; });
  }
  // draw a framed video at (X, Y) with width dw on a board canvas
  function drawVideoFrame(ctx, ch, video, win, X, Y, dw) {
    var k = dw / ch.w, hh = ch.hole;
    ctx.save(); ctx.fillStyle = "#000";
    clipRR(ctx, X + hh.x * k, Y + hh.y * k, hh.w * k, hh.h * k, hh.r * k);
    ctx.fillRect(X + hh.x * k, Y + hh.y * k, hh.w * k, hh.h * k);
    drawInto(ctx, video, video.videoWidth, video.videoHeight, X + hh.x * k, Y + hh.y * k, hh.w * k, hh.h * k, win.fit);
    ctx.restore();
    ctx.drawImage(ch.img, X, Y, dw, ch.h * k);
  }
  // DOM: wrap `media` (iframe / video / img) in a live Preview window.
  // Returns the frame element; the SVG scales with the frame's width.
  function frameDOM(media, win, natW, natH) {
    var cs = contentSize(win.ratio, natW, natH);
    var p = preview({ cw: cs.w, ch: cs.h, title: win.title });
    var f = document.createElement("div");
    f.className = "macwin";
    f.style.aspectRatio = p.w + " / " + p.h;
    var hole = document.createElement("div");
    hole.className = "macwin-hole";
    hole.style.cssText = "left:" + (p.hole.x / p.w * 100) + "%;top:" + (p.hole.y / p.h * 100) + "%;width:" + (p.hole.w / p.w * 100)
      + "%;height:" + (p.hole.h / p.h * 100) + "%;border-radius:" + (p.hole.r / p.w * 100) + "% / " + (p.hole.r / p.h * 100) + "%";
    hole.appendChild(media);
    var chrome = document.createElement("img");
    chrome.className = "macwin-chrome"; chrome.alt = ""; chrome.draggable = false;
    chrome.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(p.svg);
    f.appendChild(hole); f.appendChild(chrome);
    return f;
  }

  window.MacWin = {
    RATIOS: RATIOS, LOOKS: Object.keys(LOOKS), contentSize: contentSize, preview: preview, textedit: textedit,
    bakePreview: bakePreview, bakeText: bakeText, videoChrome: videoChrome, drawVideoFrame: drawVideoFrame,
    frameDOM: frameDOM, svgImage: svgImage
  };
})();
