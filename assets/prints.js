/* Prints — a picture as a polaroid: white border, the photo, a writing strip
   (its note in Isaac's hand), a strip of tape. Shared by Studio (baking covers)
   and anything else that draws prints on a canvas.

   A board window is MacWin's Preview window baked at 2× around the photo
   (37pt title bar, 3pt sides, the long side of the photo 720pt): `bare`
   finds the photo inside it. */
(function () {
  "use strict";
  if (window.Prints) return;
  function bare(im) {
    var nw = im.naturalWidth, nh = im.naturalHeight, k = Math.max(nw / 726, nh / 760), e = 5 * k;
    return { x: 3 * k + e, y: 37 * k + e, w: nw - 6 * k - 2 * e, h: nh - 40 * k - 2 * e };
  }
  // draw a print `PW` wide with its top-left at (x, y), turned `o.angle` about its centre.
  // o: { window: the picture is a baked Preview window, angle, tape: "top"|"corner"|"both", note }
  function draw(ctx, im, x, y, PW, o) {
    o = o || {};
    var s = o.window ? bare(im) : { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
    var pw = PW / 1.096, fr = pw * 0.048, ph = pw * s.h / s.w, bottom = pw * 0.21, PH = ph + fr + bottom;
    ctx.save();
    ctx.translate(x + PW / 2, y + PH / 2); ctx.rotate(o.angle || 0); ctx.translate(-PW / 2, -PH / 2);
    ctx.save(); ctx.shadowColor = "rgba(30,25,30,0.26)"; ctx.shadowBlur = PW * 0.07; ctx.shadowOffsetY = PW * 0.03;
    ctx.fillStyle = "#fdfcf9"; ctx.fillRect(0, 0, PW, PH); ctx.restore();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, s.x, s.y, s.w, s.h, fr, fr, pw, ph);
    if (o.note) {
      var size = Math.max(12, pw * 0.062); ctx.font = size + 'px "My Hand", Charter, Georgia, serif'; ctx.fillStyle = "#1f1d20";
      ctx.fillText(String(o.note).slice(0, 60), fr + 2, ph + fr + size * 1.35);
    }
    ctx.fillStyle = "rgba(235,228,205,0.82)";
    var tw = PW * 0.3, th = PW * 0.085;
    function strip(cx, cy, a) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillRect(-tw / 2, -th / 2, tw, th); ctx.restore(); }
    var t = o.tape || "top";
    if (t === "top") strip(PW / 2, -th * 0.2, -0.05);
    if (t === "corner") strip(PW * 0.04, PW * 0.04, -0.7);
    if (t === "both") { strip(PW * 0.06, PW * 0.015, -0.6); strip(PW * 0.94, PW * 0.015, 0.6); }
    ctx.restore();
    return PH;
  }
  // a published board window (board-N-M.png) or one baked in Studio (`win`) carries the Preview chrome
  function isWindow(src, it) { return !!(it && it.win) || /\/board-\d+-\d+\.png($|\?)/.test(String(src || "")); }
  var TILTS = [-2.6, 2, -1.2, 2.8, -2, 1.4], TAPES = ["top", "corner", "top", "both", "corner", "top"];
  // the same print as a DOM element (class "print", styled by the page): the photo cropped out of its
  // window once it loads; `o.onload` runs after, when the print has its real height
  function dom(src, o) {
    o = o || {};
    var i = o.index || 0, card = document.createElement("span");
    card.className = "print tape-" + (o.tape || TAPES[i % 6]);
    card.style.setProperty("--tilt", (o.tilt != null ? o.tilt : TILTS[i % 6]) + "deg");
    card.innerHTML = '<span class="print-in"><span class="print-photo"><img alt="" draggable="false"></span><span class="print-note"></span></span>';
    var im = card.querySelector("img"), box = card.querySelector(".print-photo");
    card.querySelector(".print-note").textContent = o.note || "";
    im.addEventListener("load", function () {
      var nw = im.naturalWidth, nh = im.naturalHeight, s = o.window ? bare(im) : { x: 0, y: 0, w: nw, h: nh };
      box.style.aspectRatio = (s.w / s.h).toFixed(4);
      im.style.cssText = "width:" + (nw / s.w * 100) + "%;height:" + (nh / s.h * 100) + "%;left:" + (-s.x / s.w * 100) + "%;top:" + (-s.y / s.h * 100) + "%";
      im.classList.add("is-in");
      if (o.onload) o.onload();
    });
    if (src) im.src = src;
    return card;
  }
  window.Prints = { bare: bare, draw: draw, dom: dom, isWindow: isWindow };
})();
