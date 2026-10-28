/* The link-preview picture for a curation topic (1200×630): the topic as it
   lies on the table — its white museum label on the left, the cover framed
   in its tray on the right (the feed's "frame": black moulding, wide white
   mat), on the table's grey. Shared by Studio (drawn at
   publish) and any page that needs to redraw one.
   window.BtbrShareCard.draw({ author, title, desc, date, no }, coverURL) → Promise<canvas> */
(function () {
  "use strict";
  var W = 1200, H = 630, GREY = "#e6e4e6";
  var FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) { res(null); return; }
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function () { res(im); }; im.onerror = function () { res(null); };
      im.src = src;
    });
  }
  // a board window (MacWin's Preview window baked at 2×) → the part holding
  // just its photo, as the feed shows it (same crop as app.js bareURL)
  function photoRect(im, src) {
    var nw = im.naturalWidth, nh = im.naturalHeight;
    if (!/\/board-\d+-\d+\.png($|\?)/.test(src || "")) return [0, 0, nw, nh];
    var k = Math.max(nw / 726, nh / 760), e = 5 * k, x = 3 * k + e, y = 37 * k + e;
    return [x, y, nw - 2 * x, nh - 40 * k - 2 * e];
  }
  // the white objects: matte, square-cut, lit from above (as on the site)
  function paper(ctx, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = "rgba(40, 30, 40, 0.13)"; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
    ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h);
    ctx.shadowColor = "rgba(40, 30, 40, 0.06)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function wrap(ctx, text, maxW) {
    var words = text.split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      var t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function fmtDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); if (!m) return "";
    try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; }
  }
  // the btbr mark, blind-embossed (rotated, plus in the corner)
  var MARK = [[0, 0, 126, 10], [0, 38, 10, 126], [256, 148, 10, 126], [68, 132, 10, 126], [10, 194, 122, 10], [104, 248, 126, 10]];
  function mark(ctx, x, y, size) {
    var k = size / 272;
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(40, 30, 40, 0.26)"; ctx.shadowBlur = 1.2; ctx.shadowOffsetY = 1.2;
    MARK.forEach(function (r) { ctx.fillRect(x + (r[0] - 3) * k, y + (r[1] - 3) * k, (r[2] + 6) * k, (r[3] + 6) * k); });
    ctx.restore();
  }

  function draw(t, coverURL) {
    return loadImg(coverURL).then(function (cover) {
      var c = document.createElement("canvas"); c.width = W * 2; c.height = H * 2;
      var ctx = c.getContext("2d"); ctx.scale(2, 2);
      ctx.fillStyle = GREY; ctx.fillRect(0, 0, W, H);

      // two objects, 4:4.9, centred with the table's gap
      var ch = 520, cw = Math.round(ch * 4 / 4.9), gap = 76, top = (H - ch) / 2;
      var lx = (W - (cw * 2 + gap)) / 2, tx = lx + cw + gap;

      // the label
      paper(ctx, lx, top, cw, ch);
      var pad = 0.06 * cw, fs = 0.076 * cw, lh = fs * 1.13;
      ctx.fillStyle = "#111"; ctx.textBaseline = "alphabetic";
      ctx.font = "400 " + fs + "px " + FONT;
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = (-0.022 * fs) + "px";
      var desc = String(t.desc || "").trim().replace(/[.,;:]+$/, ""), date = fmtDate(t.date);
      var run = [t.title || ""].concat(desc ? [desc] : [], date ? [date] : []).join(", ");
      var lines = [(t.author || "") + ","].concat(wrap(ctx, run, cw - pad * 2)).slice(0, 9);
      lines.forEach(function (l, i) { ctx.fillText(l, lx + pad, top + pad * 0.87 + fs + i * lh); });
      mark(ctx, lx + pad, top + ch - pad - 0.16 * cw * 1.03, 0.16 * cw);
      if (t.no) {
        ctx.font = "400 13px " + FONT; ctx.fillStyle = "#9a989b";
        if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0.3px";
        var no = "No. " + ("00" + t.no).slice(-3);
        ctx.fillText(no, lx + cw - pad - ctx.measureText(no).width, top + ch - pad);
      }

      // the tray: a recessed well with the cover resting in it
      paper(ctx, tx, top, cw, ch);
      var wi = 0.036, wx = tx + cw * wi, wy = top + ch * wi, ww = cw * (1 - 2 * wi), wh = ch * (1 - 2 * wi);
      ctx.save(); rrect(ctx, wx, wy, ww, wh, 14); ctx.fillStyle = "#fafafa"; ctx.fill();
      ctx.strokeStyle = "rgba(40, 30, 40, 0.06)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      // the frame, hung in the well as on the feed (styles.css .tray-art/.tf-*)
      var ah = wh * 0.84, aw = ah * 3 / 4.2, ax = wx + (ww - aw) / 2, ay = wy + (wh - ah) / 2, cq = aw / 100;
      var fx = ax + aw * 0.06, fy = ay + ah * 0.1, fw = aw * 0.88, fh = ah * 0.8;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 18;
      ctx.fillStyle = "#1b1a1a"; ctx.fillRect(fx + 12, fy + 12, fw - 24, fh - 24);
      ctx.shadowColor = "rgba(0, 0, 0, 0.25)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
      ctx.fillRect(fx, fy, fw, fh);
      ctx.restore();
      var bx = fx + 2.2 * cq, by = fy + 2.2 * cq, bw = fw - 4.4 * cq, bh = fh - 4.4 * cq;
      ctx.fillStyle = "#fbfaf7"; ctx.fillRect(bx, by, bw, bh);
      var g = ctx.createLinearGradient(0, by, 0, by + 8);
      g.addColorStop(0, "rgba(0, 0, 0, 0.12)"); g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g; ctx.fillRect(bx, by, bw, 8);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.06)"; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      var px = bx + 10 * cq, py = by + 12 * cq, pw = bw - 20 * cq, ph = bh - 24 * cq;
      ctx.fillStyle = "#ebebef"; ctx.fillRect(px, py, pw, ph);
      if (cover) {
        var r = photoRect(cover, coverURL), s = Math.max(pw / r[2], ph / r[3]), sw = pw / s, sh = ph / s;
        ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
        ctx.drawImage(cover, r[0] + (r[2] - sw) / 2, r[1] + (r[3] - sh) / 2, sw, sh, px, py, pw, ph);
        ctx.restore();
      }
      ctx.strokeStyle = "rgba(0, 0, 0, 0.08)"; ctx.strokeRect(px - 0.5, py - 0.5, pw + 1, ph + 1);
      return c;
    });
  }
  window.BtbrShareCard = { draw: draw, W: W, H: H };
})();
