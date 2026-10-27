(function () {
  // ---- persistent audio: created once, survives soft navigations ----
  if (!window.__btbrAudio) {
    var a = document.createElement("audio");
    a.src = "assets/alesund.mp3";
    a.preload = "none";
    document.body.appendChild(a);
    window.__btbrAudio = a;
    a.addEventListener("play", reflect);
    a.addEventListener("pause", reflect);
    a.addEventListener("ended", reflect);
  }
  var audio = window.__btbrAudio;

  // ---- shared click-to-enlarge lightbox: created once, survives soft nav ----
  if (!window.__btbrLightbox) {
    var box = document.createElement("div");
    box.className = "lightbox";
    box.id = "lightbox";
    box.appendChild(document.createElement("img"));
    var close = document.createElement("button");
    close.className = "lightbox-close";
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = "&times;";
    box.appendChild(close);
    document.body.appendChild(box);
    // tap anywhere (backdrop, image or the × button) closes
    box.addEventListener("click", function () {
      box.classList.remove("open");
    });
    window.__btbrLightbox = box;
  }
  var lightbox = window.__btbrLightbox;

  function openLightbox(src, alt) {
    var img = lightbox.querySelector("img");
    img.src = src;
    img.alt = alt || "";
    lightbox.classList.add("open");
  }

  function reflect() {
    var p = document.getElementById("play");
    if (p) p.textContent = tr(audio.paused ? "Play song" : "Pause");
  }

  // ---- smooth open/close for <details> accordions (FAQ) ----
  // Native <details> snaps open. We wrap the answer in a grid "reveal" row and
  // ease grid-template-rows 0fr -> 1fr (with a matching opacity fade), which is
  // buttery and needs no height measuring. Degrades to an instant toggle if JS
  // is off, and collapses under prefers-reduced-motion.
  function wireDetails(details) {
    if (details.__smooth) return;
    details.__smooth = true;
    var summary = details.querySelector(":scope > summary");
    var body = details.querySelector(":scope > *:not(summary)");
    if (!summary || !body) return;

    // wrap the answer so we have a grid row to animate
    var reveal = document.createElement("div");
    reveal.className = "faq-reveal";
    details.insertBefore(reveal, body);
    reveal.appendChild(body);

    // run fn once the row transition ends (with a timeout fallback so state
    // never gets stuck if transitionend doesn't fire)
    function onRowEnd(fn, ms) {
      var called = false;
      function once() {
        if (called) return;
        called = true;
        reveal.removeEventListener("transitionend", handler);
        clearTimeout(timer);
        fn();
      }
      function handler(ev) {
        if (ev.target === reveal && ev.propertyName === "grid-template-rows") once();
      }
      reveal.addEventListener("transitionend", handler);
      var timer = setTimeout(once, ms);
    }

    summary.addEventListener("click", function (e) {
      e.preventDefault();
      if (details.__busy) return;
      details.__busy = true;

      if (details.open) {
        // closing: ease the row back to 0fr, then drop the open attribute
        details.classList.remove("is-open");
        onRowEnd(function () {
          details.open = false;
          details.__busy = false;
        }, 500);
      } else {
        // opening: show the content collapsed (0fr), then flip to 1fr
        details.open = true;
        reveal.getBoundingClientRect(); // lock in the 0fr start state
        details.classList.add("is-open");
        onRowEnd(function () {
          details.__busy = false;
        }, 650);
      }
    });
  }

  function wireFaq() {
    var list = document.querySelectorAll("details.faq, details.faq-item");
    for (var i = 0; i < list.length; i++) wireDetails(list[i]);
  }

  // ---- (re)bind page-specific controls after each navigation ----
  function bindPage() {
    var play = document.getElementById("play");
    if (play) {
      reflect();
      play.onclick = function () {
        if (audio.paused) audio.play();
        else audio.pause();
      };
    }
    wireFaq();
    wireImages();
    wireReveal();
    applyLang(false);
    if (window.__btbrInitCuration) window.__btbrInitCuration();
    if (window.__btbrInitHomeSoon) window.__btbrInitHomeSoon();
    if (window.__btbrInitStudioLink) window.__btbrInitStudioLink();
  }

  // ---- subtle scroll reveal: screenshots + the FAQ block fade/rise into view.
  // Progressive enhancement — if there's no IntersectionObserver or the user
  // asked for reduced motion, we never hide anything, so content stays visible.
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function wireReveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    var targets = document.querySelectorAll(".shots .shot, .project-foot");
    if (!targets.length) return;
    if (!window.__btbrRevealObs) {
      window.__btbrRevealObs = new IntersectionObserver(function (entries, obs) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            entries[i].target.classList.add("reveal-in");
            obs.unobserve(entries[i].target);
          }
        }
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    }
    for (var j = 0; j < targets.length; j++) {
      var t = targets[j];
      if (t.__reveal) continue;
      t.__reveal = true;
      t.classList.add("reveal-init");
      window.__btbrRevealObs.observe(t);
    }
  }

  // make every screenshot (and the about photo) open in the shared lightbox
  function wireImages() {
    var imgs = document.querySelectorAll(".shot img, .about-photo");
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (im.__zoom) continue;
      im.__zoom = true;
      im.style.cursor = "zoom-in";
      im.addEventListener("click", function () {
        openLightbox(this.currentSrc || this.src, this.alt);
      });
    }
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var lb = document.getElementById("lightbox");
      if (lb) lb.classList.remove("open");
    }
  });

  // ---- soft navigation so the audio never tears down ----
  function swap(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var next = doc.querySelector(".frame");
    var cur = document.querySelector(".frame");
    if (!next || !cur) return false;
    var incoming = document.importNode(next, true);
    // the about page carries its own "develop-in" entrance, as do home, apps,
    // curation and the app pages; any other page gets the quick fade+lift.
    var themed = incoming.classList.contains("about-frame") ||
                 incoming.classList.contains("home-frame") ||
                 incoming.classList.contains("curation-frame") ||
                 incoming.classList.contains("feed-home") ||
                 incoming.classList.contains("project-frame");
    var enter = !themed;
    if (enter) incoming.classList.add("frame-enter"); // start faded/lifted
    cur.replaceWith(incoming);
    songStop();
    document.title = doc.title;
    window.scrollTo(0, 0);
    bindPage();
    if (enter) {
      // next frame: drop the class so it eases into place
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          incoming.classList.remove("frame-enter");
        });
      });
    }
    return true;
  }

  function isInternal(link) {
    if (!link) return false;
    if (link.target === "_blank" || link.hasAttribute("download")) return false;
    var href = link.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#") return false;
    if (href.indexOf("mailto:") === 0) return false;
    if (href.indexOf("http") === 0 || href.indexOf("//") === 0) return false;
    return true;
  }

  document.addEventListener("click", function (e) {
    var link = e.target.closest ? e.target.closest("a") : null;
    if (!isInternal(link)) return;
    var href = link.getAttribute("href");
    e.preventDefault();
    // no-cache: revalidate with the server so a fresh deploy is picked up
    // instead of a stale copy from the browser's 10-min HTML cache.
    var page = fetch(href, { cache: "no-cache" }).then(function (r) { return r.text(); });
    function go(html) {
      if (swap(html)) history.pushState(null, "", href);
      else window.location.href = href;
    }
    var toAbout = /(^|\/)about\/?$/.test(href.split("#")[0]);
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cur = document.querySelector(".frame");
    var fromAbout = !!cur && cur.classList.contains("about-frame");
    // apps menu <-> app pages: the current page "un-develops" (its pieces blur
    // and fade away, top to bottom) before the next one develops in
    var fromApps = !!cur && (cur.classList.contains("feed-home") ||
                             cur.classList.contains("project-frame"));
    if (fromApps && !toAbout && !reduce) {
      cur.classList.add("develop-out");
      Promise.all([page, new Promise(function (res) { setTimeout(res, 460); })])
        .then(function (arr) { go(arr[0]); })
        .catch(function () { window.location.href = href; });
    } else if (toAbout && cur && !reduce) {
      // "fade to memory": desaturate + dim the current page, then let the about
      // page develop in
      cur.classList.add("to-memory");
      Promise.all([page, new Promise(function (res) { setTimeout(res, 520); })])
        .then(function (arr) { go(arr[0]); })
        .catch(function () { window.location.href = href; });
    } else if (fromAbout && !reduce) {
      // leaving the memory: the about panel desaturates and lifts away, then the
      // page returns in colour
      cur.classList.add("leaving-memory");
      Promise.all([page, new Promise(function (res) { setTimeout(res, 440); })])
        .then(function (arr) { go(arr[0]); })
        .catch(function () { window.location.href = href; });
    } else {
      page.then(go).catch(function () { window.location.href = href; });
    }
  });

  window.addEventListener("popstate", function () {
    fetch(location.href, { cache: "no-cache" })
      .then(function (r) { return r.text(); })
      .then(function (html) { swap(html); });
  });

  // ---- curation: data-driven feed + in-tab reading pop-up ----
  function esc(s) { return String(s == null ? "" : s); }

  // reading language: English by default, French on request (site-wide — see
  // "site language" below). A topic stores its French in `.fr` on the topic /
  // index entry / each block; anything not translated falls back to English.
  var CUR_UI = {
    en: { open: "Open", loading: "Loading…", failed: "Couldn’t load this topic.",
          emptyT: "Curation is in the making.", emptyS: "New topics are on the way — come back soon.",
          end: "You’re at the bottom of the list." },
    fr: { open: "Ouvrir", loading: "Chargement…", failed: "Impossible de charger ce sujet.",
          emptyT: "La curation est en préparation.", emptyS: "De nouveaux sujets arrivent — revenez bientôt.",
          end: "Vous êtes en bas de la liste." }
  };
  function ui(k) { return CUR_UI[siteLang()][k]; }
  function loc(o, k) { return (siteLang() === "fr" && o.fr && o.fr[k]) || o[k] || ""; }
  var curList = null, curTopic = null;

  function authorPP(name) { var m = { "Isaaaaaaaac": "/assets/pp/isaaaaaaaac.jpg" }; return m[name] || ""; }
  // catalogue number: set at publish; older topics fall back to their place
  // in the list (the oldest is No. 001)
  function curNo(t) {
    var n = t && +t.no;
    if (!n && curList) { var i = curList.map(function (x) { return x.slug; }).indexOf(t.slug); if (i >= 0) n = curList.length - i; }
    return n ? (siteLang() === "fr" ? "N°\u00a0" : "No.\u00a0") + ("00" + n).slice(-3) : "";
  }
  // each topic can tint its room (a pale paper tone); default is the table's grey
  var ROOM_GREY = "#e6e4e6";
  function roomTone(slug) {
    var t = curTopic && curTopic.slug === slug ? curTopic : (curList || []).filter(function (x) { return x.slug === slug; })[0];
    return (t && /^#[0-9a-f]{6}$/i.test(t.tone || "") && t.tone) || ROOM_GREY;
  }
  // a dark tone flips the room's text to light
  function toneIsDark(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
  }
  function applyTone(modal, slug) {
    var tone = roomTone(slug);
    modal.style.setProperty("--room", tone);
    modal.classList.toggle("is-dark", toneIsDark(tone));
  }
  function youtubeId(url) { var m = String(url || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
  // ---- a topic's soundtrack: a YouTube track played by a hidden player, one at a time,
  // with a hairline progress bar fed by the player's own updates ----
  var songNow = null;
  function songBar(card) { return (card.closest(".cur-label") || card).querySelector(".cur-song-bar span"); }
  function songStop() {
    var s = songNow; if (!s) return; songNow = null;
    if (s.frame) s.frame.remove();
    s.card.classList.remove("is-playing", "is-loading");
    var bar = songBar(s.card); if (bar) bar.style.width = "0";
    var tm = s.card.querySelector(".cur-song-time"); if (tm) tm.textContent = "";
  }
  function songCmd(s, func) { try { s.frame.contentWindow.postMessage(JSON.stringify({ event: "command", func: func, args: [] }), "*"); } catch (e) {} }
  function songToggle(card) {
    if (songNow && songNow.card === card) {
      var on = !card.classList.contains("is-playing");
      songCmd(songNow, on ? "playVideo" : "pauseVideo");
      card.classList.toggle("is-playing", on);
      return;
    }
    songStop();
    if (window.__btbrAudio && !window.__btbrAudio.paused) window.__btbrAudio.pause();
    var f = document.createElement("iframe");
    f.allow = "autoplay; encrypted-media";
    f.className = "cur-song-player"; f.title = "Song player"; f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
    f.src = "https://www.youtube-nocookie.com/embed/" + card.getAttribute("data-yt") + "?enablejsapi=1&autoplay=1&playsinline=1&controls=0&start=" + (+card.getAttribute("data-start") || 0) + "&origin=" + encodeURIComponent(location.origin);
    var s = songNow = { card: card, frame: f };
    f.addEventListener("load", function () { try { f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*"); } catch (e) {} });
    document.body.appendChild(f);
    card.classList.add("is-playing", "is-loading");
  }
  window.addEventListener("message", function (e) {
    var s = songNow; if (!s || e.source !== s.frame.contentWindow) return;
    var d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (x) { return; }
    var info = d && d.info; if (!info) return;
    if (info.playerState === 1) s.card.classList.remove("is-loading");
    if (info.playerState === 0) { songStop(); return; } // ended
    if (info.duration) s.dur = info.duration;
    if (info.currentTime != null && s.dur) {
      var bar = songBar(s.card); if (bar) bar.style.width = Math.min(100, info.currentTime / s.dur * 100) + "%";
      var tm = s.card.querySelector(".cur-song-time"), sec = Math.floor(info.currentTime);
      if (tm) tm.textContent = Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2);
    }
  });
  // ---- share: each topic has a page of its own (/curation/<slug>/) whose
  // link preview is the topic's label + cover; the share sheet on phones,
  // a copied link elsewhere ----
  function shareTopic(btn) {
    var m = document.querySelector(".cur-modal"); var slug = m && m.dataset.slug; if (!slug) return;
    var url = location.origin + "/curation/" + encodeURIComponent(slug) + "/";
    var t = curTopic && curTopic.slug === slug ? curTopic : null;
    var tip = btn.querySelector(".cur-share-tip");
    function said(msg) { if (!tip) return; tip.textContent = msg; btn.classList.add("is-tip"); clearTimeout(btn.__tip); btn.__tip = setTimeout(function () { btn.classList.remove("is-tip"); }, 1600); }
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      navigator.share({ title: t ? loc(t, "title") : "builtoberemembered", url: url }).catch(function () {});
      return;
    }
    var fr = siteLang() === "fr";
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
      .then(function () { said(fr ? "Lien copié" : "Link copied"); }, function () { window.prompt(fr ? "Copier le lien" : "Copy the link", url); });
  }
  function authorAvatar(name) { var pp = authorPP(name); return pp ? '<img class="cur-avatar" src="' + pp + '" alt="" loading="lazy">' : '<span class="cur-avatar" aria-hidden="true"></span>'; }
  function curBlocksHTML(blocks) {
    var hc = 0;
    blocks = blocks || [];
    // trailing hand/sign blocks are the sign-off: centred under a hairline, the
    // note in soft ink and the name (a sign block, or else the note's last line)
    // as the signature
    var tailFrom = blocks.length;
    while (tailFrom > 0 && /^(hand|sign)$/.test(blocks[tailFrom - 1].type)) tailFrom--;
    var tailSigned = blocks.slice(tailFrom).some(function (b) { return b.type === "sign"; });
    var html = blocks.map(function (b, bi) {
      if (b.type === "text") {
        // pasted text can carry the source page's inline fonts/sizes: drop them
        var raw = String(loc(b, "html") || "").replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "").replace(/<\/?(?:font|span)\b[^>]*>/gi, "");
        // the contenteditable bakes in <div>/<br> line breaks; split into clean
        // paragraphs and drop empty lines so spacing is even
        var parts = raw.split(/<\/?div[^>]*>|<\/?p[^>]*>|<br\s*\/?>/i);
        var paras = [];
        for (var k = 0; k < parts.length; k++) { var s = parts[k].trim(); if (s && s.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, "").trim()) paras.push(s); }
        if (!paras.length) return "";
        if (b.head) { hc++; return '<h3 class="cur-h" id="sec-' + hc + '">' + paras.join(" ") + "</h3>"; }
        return paras.map(function (p) { return "<p>" + p + "</p>"; }).join("");
      }
      if (b.type === "image") {
        var capT = loc(b, "caption");
        var cap = capT ? '<figcaption class="cur-cap">' + capT + "</figcaption>" : "";
        var note = String(loc(b, "note") || "").trim(), q = function (v) { return htmlEsc(v).replace(/"/g, "&quot;"); };
        var items = b.board && b.board.items || [];
        if (items.length) {
          // a board as prints: every window on it becomes a polaroid — the photo out of its window,
          // its note written underneath in Isaac's hand, a strip of tape — hung where the window
          // hangs, in board order. A print is taller than its window (the writing strip), so the
          // board grows by as much and the prints overlap no more than the windows did.
          var spread = 1;
          items.forEach(function (it) { spread = Math.max(spread, (it.h + it.w * 0.26) / it.h); });
          var depth = 0;                                   // how far down the lowest print reaches, so the board ends there
          items.forEach(function (it) { depth = Math.max(depth, it.y * spread + it.h + it.w * 0.26 + 3); });
          var tilts = [-2.6, 2, -1.2, 2.8, -2, 1.4], tapes = ["top", "corner", "top", "both", "corner", "top"];
          var prints = items.map(function (it, i) {
            var n = String(loc(it, "note") || "").trim(), ar = it.w / Math.max(1, it.h - it.w * 0.053);
            return '<button class="cur-hot cur-print tape-' + tapes[i % 6] + '" type="button" data-src="' + q(it.src) + '"' + (n ? ' data-note="' + q(n) + '"' : "")
              + ' aria-label="' + q(n || it.name || "View picture") + '" style="left:' + it.x + "%;top:" + (it.y * spread / depth * 100).toFixed(3) + "%;width:" + it.w + "%;--tilt:" + tilts[i % 6] + 'deg">'
              + '<span class="cur-print-in"><span class="cur-print-photo" style="aspect-ratio:' + ar.toFixed(3) + '"><img src="' + esc(it.src) + '" alt="" decoding="async"></span>'
              + '<span class="cur-print-note">' + htmlEsc(n.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')) + "</span></span></button>";
          }).join("");
          return '<figure class="cur-fig2 cur-board is-prints"><div class="cur-board-art" style="aspect-ratio:100 / ' + depth.toFixed(2) + '">' + prints + "</div>" + cap + "</figure>";
        }
        return '<figure class="cur-fig2' + (b.inset ? " inset" : "") + '"><img class="cur-zoomable" src="' + esc(b.src) + '" alt="' + esc(loc(b, "alt")) + '"'
          + (note ? ' data-note="' + q(note) + '"' : "") + ' tabindex="0" loading="lazy">' + cap + "</figure>";
      }
      if (b.type === "hand" || b.type === "sign") {
        // written in Isaac's hand (the font only has plain ASCII, so curly
        // quotes go straight; anything else falls back to the serif)
        var ht = String(loc(b, "text") || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim();
        if (!ht) return "";
        var lines = htmlEsc(ht).split("\n");
        if (bi >= tailFrom && b.type === "hand" && !tailSigned && bi === blocks.length - 1 && lines.length > 1)
          return '<p class="cur-hand">' + lines.slice(0, -1).join("<br>") + '</p><p class="cur-sign">' + lines[lines.length - 1] + "</p>";
        return '<p class="cur-' + b.type + '">' + lines.join("<br>") + "</p>";
      }
      if (b.type === "quote") {
        var qt = String(loc(b, "text") || "").replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "").replace(/<\/?(?:font|span|div|p)\b[^>]*>/gi, " ").trim();
        if (!qt) return "";
        var cite = String(loc(b, "cite") || "").trim();
        return '<figure class="cur-quote"><blockquote>' + qt + "</blockquote>" + (cite ? "<figcaption>" + htmlEsc(cite) + "</figcaption>" : "") + "</figure>";
      }
      if (b.type === "video") {
        // videos sit in a dark Preview window (framed by MacWin once rendered)
        // unless the author turned it off; board videos already carry theirs
        var win = b.frame !== false && !b.board;
        var wattr = win ? ' data-win="' + htmlEsc(b.wtitle || String(loc(b, "caption") || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || "Video").replace(/"/g, "&quot;") + '"' : "";
        var capV = loc(b, "caption");
        var cap2 = capV ? '<figcaption class="cur-cap">' + capV + "</figcaption>" : "";
        if (/youtu\.?be/.test(b.src)) {
          var m = b.src.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
          return '<figure class="cur-fig2 cur-vid"' + wattr + '><iframe src="https://www.youtube.com/embed/' + (m ? m[1] : "") + '" allowfullscreen></iframe></figure>';
        }
        var at = b.loop ? "autoplay muted loop playsinline" : "controls playsinline";
        return '<figure class="cur-fig2"' + wattr + '><video src="' + esc(b.src) + '" ' + at + "></video>" + cap2 + "</figure>";
      }
      return "";
    });
    var tail = html.splice(tailFrom).join("");
    return html.join("") + (tail ? '<div class="cur-signoff">' + tail + "</div>" : "");
  }
  // ---- the room: a topic opens out of its cover tray and closes back into it
  // (clip-path from the tray's rect to the full room, white paper turning into
  // the grey room). Each step starts from the live on-screen value, so a
  // close mid-open just reverses.
  // critically damped spring (damping 1, `response` s) as a CSS linear() curve,
  // sampled over `dur` ms; browsers without linear() get a close cubic-bezier
  var canLinear = window.CSS && CSS.supports && CSS.supports("transition-timing-function", "linear(0, 1)");
  function springEase(response, dur) {
    if (!canLinear) return "cubic-bezier(0.25, 0.8, 0.25, 1)";
    var w = 2 * Math.PI / response, pts = [];
    for (var i = 0; i <= 40; i++) {
      var t = (i / 40) * dur / 1000, x = 1 - (1 + w * t) * Math.exp(-w * t);
      pts.push(i === 40 ? 1 : +x.toFixed(4));
    }
    return "linear(" + pts.join(", ") + ")";
  }
  function trayFor(slug) {
    return slug ? document.querySelector('.cur-card[data-slug="' + slug + '"] .cur-tray') : null;
  }
  function trayClip(panel, tray) {
    var p = panel.getBoundingClientRect(), r = tray.getBoundingClientRect();
    return "inset(" + (r.top - p.top) + "px " + (p.right - r.right) + "px " + (p.bottom - r.bottom) + "px " + (r.left - p.left) + "px round 2px)";
  }
  function stopRoom(modal) {
    var live = null, panel = modal.querySelector(".cur-modal-panel");
    if (modal.__anims && modal.__anims.length) {
      var cs = getComputedStyle(panel);
      live = { clipPath: cs.clipPath, backgroundColor: cs.backgroundColor };
      modal.__anims.forEach(function (an) { an.cancel(); });
    }
    modal.__anims = [];
    return live;
  }
  function roomAnimate(modal, opening, onDone) {
    var panel = modal.querySelector(".cur-modal-panel");
    var inner = [].slice.call(modal.querySelectorAll(".cur-modal-body, .cur-room-tools"));
    var back = modal.querySelector(".cur-modal-backdrop");
    var live = stopRoom(modal);
    var tray = trayFor(modal.dataset.slug);
    if (!panel.animate || reduceMotion || !tray) {
      // no tray to grow from (or less motion asked for): a plain cross-fade
      var f = panel.animate ? panel.animate([{ opacity: opening ? 0 : 1 }, { opacity: opening ? 1 : 0 }],
        { duration: reduceMotion ? 180 : 260, easing: "ease", fill: "both" }) : null;
      if (!f) { if (onDone) onDone(); return; }
      modal.__anims = [f];
      f.onfinish = function () { if (onDone) onDone(); };
      return;
    }
    var shut = { clipPath: trayClip(panel, tray), backgroundColor: "#ffffff" };
    var open = { clipPath: "inset(0px 0px 0px 0px round 26px)", backgroundColor: roomTone(modal.dataset.slug) };
    var from = live || (opening ? shut : open), to = opening ? open : shut;
    var dur = opening ? 720 : 560;
    var anims = [panel.animate([from, to], { duration: dur, easing: springEase(opening ? 0.5 : 0.4, dur), fill: "both" })];
    // closing: the paper dissolves into the tray as it lands
    if (!opening) anims.push(panel.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: dur, easing: "linear", fill: "both" }));
    inner.forEach(function (el) {
      anims.push(el.animate(opening
        ? [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }]
        : [{ opacity: 1 }, { opacity: 0 }],
        opening ? { duration: 420, delay: 220, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "both" }
                : { duration: 160, easing: "ease-out", fill: "both" }));
    });
    if (back) anims.push(back.animate([{ opacity: opening ? 0 : 1 }, { opacity: opening ? 1 : 0 }], { duration: dur, easing: "ease", fill: "both" }));
    modal.__anims = anims;
    anims[0].onfinish = function () {
      if (opening) stopRoom(modal);  // settle: drop the fills, the CSS state takes over
      if (onDone) onDone();
    };
  }
  // ---- focus mode: an image in a topic lifts off the page and grows to fill
  // the window (a shared-element zoom on a critically damped spring) over the
  // dimmed, blurred room, with its focus note underneath. Click, Esc or ✕
  // closes it back into place; drag it (1:1) and let go — a throw or a long
  // pull dismisses (momentum projected like a scroll), anything else springs
  // back. Every step starts from the image's live position.
  var focusState = null;
  // `from` set (a picture on a board): grow it to ~1.7× its size on the board (580–860px),
  // centred, rather than filling the window — enough to read the detail
  function focusTarget(img, noteEl, from) {
    var vw = window.innerWidth, vh = window.innerHeight, m = vw < 600 ? 16 : 48;
    var nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    var noteW = Math.min(560, vw - 2 * m);
    if (noteEl) noteEl.style.width = noteW + "px";
    var capH = noteEl ? noteEl.offsetHeight + 20 : 0;
    var maxW = vw - 2 * m;
    if (from) maxW = Math.min(maxW, Math.max(from.width * 1.7, Math.min(580, maxW)), 860);
    var tw = Math.min(maxW, (vh - 2 * m - capH) * nw / nh), th = tw * nh / nw;
    return { l: (vw - tw) / 2, t: (vh - capH - th) / 2, w: tw, h: th, noteW: noteW, vw: vw };
  }
  function focusRect(el) {
    var card = el.querySelector && el.querySelector(".cur-print-in");
    if (!card || !el.hasAttribute("data-on-print")) { var ph = el.querySelector && el.querySelector(".cur-print-photo"); return (ph || el).getBoundingClientRect(); }
    // a print hangs turned: its own (unturned) size, centred where it is on screen
    var b = card.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight, cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, right: cx + w / 2, bottom: cy + h / 2 };
  }
  function tiltOf(el) { return el.hasAttribute && el.hasAttribute("data-on-print") ? parseFloat(getComputedStyle(el).getPropertyValue("--tilt")) || 0 : 0; }
  function lift(f, r) { return "translate(" + (r.left - f.t.l) + "px, " + (r.top - f.t.t) + "px) scale(" + (r.width / f.t.w) + ")" + (f.rot ? " rotate(" + f.rot + "deg)" : ""); }
  function openFocus(el) {
    if (focusState) return;
    var hot = el.classList.contains("cur-hot");
    var img = hot ? new Image() : el;
    if (hot) {
      if (el.__loading) return;
      img.src = el.getAttribute("data-src");
      if (!img.complete || !img.naturalWidth) {
        el.__loading = true;
        img.onload = function () { el.__loading = false; openFocus(el); };
        img.onerror = function () { el.__loading = false; };
        return;
      }
    }
    if (!img.complete || !img.naturalWidth) return;
    var room = el.closest(".cur-modal"); if (!room) return;
    var r = focusRect(el);
    var note = el.hasAttribute("data-on-print") ? "" : el.getAttribute("data-note") || "";
    var ov = document.createElement("div");
    ov.className = "cur-focus"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", img.alt || "Image");
    ov.innerHTML = '<div class="cur-focus-back"></div><img class="cur-focus-img" alt="" draggable="false">'
      + '<p class="cur-focus-note"' + (note ? "" : " hidden") + '></p><div class="cur-focus-count" aria-hidden="true"></div>'
      + '<button class="cur-focus-close" type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button>';
    var big = ov.querySelector(".cur-focus-img"), noteBox = ov.querySelector(".cur-focus-note"), noteEl = note ? noteBox : null;
    big.src = img.currentSrc || img.src; big.alt = hot ? el.getAttribute("aria-label") || "" : img.alt || "";
    if (noteEl) noteEl.textContent = note;
    room.appendChild(ov);
    var t = focusTarget(img, noteEl, hot ? r : null);
    if (hot) big.classList.add(el.classList.contains("cur-print") ? "is-print" : "is-window");
    ov.setAttribute("aria-label", big.alt || "Image");
    big.style.cssText = "left:" + t.l + "px;top:" + t.t + "px;width:" + t.w + "px;height:" + t.h + "px";
    if (noteEl) { noteEl.style.left = (t.vw - t.noteW) / 2 + "px"; noteEl.style.top = (t.t + t.h + 18) + "px"; }
    // `img` = the picture to show, `src` = what it grows out of (and returns to)
    var f = focusState = { rot: tiltOf(el), ov: ov, big: big, img: el, note: noteEl, noteBox: noteBox, count: ov.querySelector(".cur-focus-count"), back: ov.querySelector(".cur-focus-back"), close: ov.querySelector(".cur-focus-close"), t: t, anims: [] };
    focusCount(f);
    // a window on a board keeps its Preview-window corner (16pt at 726pt wide)
    f.srcR = hot ? 0 : parseFloat(getComputedStyle(img).borderTopLeftRadius) || 0;
    f.toR = hot ? 0 : 14;
    if (!hot || el.hasAttribute("data-on-print")) el.style.visibility = "hidden";   // the print itself lifts off the board
    var k = r.width / t.w, chrome = [f.close, f.count].concat(noteEl ? [noteEl] : []);
    if (reduceMotion || !big.animate) {
      f.anims = [ov.animate ? ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, fill: "both" }) : null].filter(Boolean);
    } else {
      f.anims.push(big.animate([{ transform: lift(f, r), borderRadius: f.srcR / k + "px" }, { transform: "none", borderRadius: f.toR + "px" }],
        { duration: 620, easing: springEase(0.42, 620), fill: "both" }));
      f.anims.push(f.back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: "ease", fill: "both" }));
      chrome.forEach(function (el) { f.anims.push(el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: 220, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "both" })); });
    }
    f.close.focus({ preventScroll: true });
    wireFocusDrag(f);
  }
  // ← / → (or a sideways swipe) step through every picture in the topic, in
  // page order: the picture slides out, the next one fades in at its own size
  function focusList(f) {
    var room = f.ov.closest(".cur-modal");
    if (!room) return [];
    // reading order: top to bottom, then left to right (a board's pictures
    // are stacked in z-order in the page, not in the order you see them)
    return [].slice.call(room.querySelectorAll(".cur-modal-content .cur-zoomable, .cur-modal-content .cur-hot"))
      .map(function (el, i) { var r = el.getBoundingClientRect(); return { el: el, t: r.top, l: r.left, i: i }; })
      .sort(function (a, b) { return Math.abs(a.t - b.t) > 24 ? a.t - b.t : (a.l - b.l) || (a.i - b.i); })
      .map(function (o) { return o.el; });
  }
  function focusCount(f) {
    var list = focusList(f), i = list.indexOf(f.img);
    f.count.textContent = list.length > 1 && i >= 0 ? (i + 1) + " / " + list.length : "";
  }
  function stepFocus(dir) {
    var f = focusState; if (!f || f.closing || f.stepping) return;
    var list = focusList(f), el = list[list.indexOf(f.img) + dir];
    var calm = reduceMotion || !f.big.animate;
    if (!el) { // the end of the topic: a small bump, nothing more
      if (!calm) { settleFocus(f); f.anims = [f.big.animate([{ transform: "none" }, { transform: "translateX(" + dir * 10 + "px)" }, { transform: "none" }], { duration: 280, easing: "ease-out" })]; }
      return;
    }
    f.stepping = true;
    var hot = el.classList.contains("cur-hot"), img = new Image();
    img.onerror = function () { f.stepping = false; };
    img.onload = function () {
      if (focusState !== f || f.closing) { f.stepping = false; return; }
      settleFocus(f);
      var out = calm ? null : f.big.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(" + -dir * 18 + "px)" }], { duration: 150, easing: "ease-in", fill: "both" });
      if (f.note && !calm) f.note.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "both" });
      function swapIn() {
        if (out) out.cancel();
        // leave its old place on the page, bring the new one into view so a
        // close lands back on it
        f.img.style.visibility = "";
        el.scrollIntoView({ block: "center" });
        var note = el.hasAttribute("data-on-print") ? "" : el.getAttribute("data-note") || "";
        f.noteBox.textContent = note; f.noteBox.hidden = !note; f.rot = tiltOf(el);
        f.noteBox.getAnimations && f.noteBox.getAnimations().forEach(function (a) { a.cancel(); });
        var t = focusTarget(img, note ? f.noteBox : null, hot ? focusRect(el) : null);
        f.big.src = img.src; f.big.alt = hot ? el.getAttribute("aria-label") || "" : el.alt || "";
        f.big.classList.toggle("is-window", hot && !el.classList.contains("cur-print"));
        f.big.classList.toggle("is-print", el.classList.contains("cur-print"));
        f.big.style.cssText = "left:" + t.l + "px;top:" + t.t + "px;width:" + t.w + "px;height:" + t.h + "px";
        if (note) { f.noteBox.style.left = (t.vw - t.noteW) / 2 + "px"; f.noteBox.style.top = (t.t + t.h + 18) + "px"; }
        f.ov.setAttribute("aria-label", f.big.alt || "Image");
        f.t = t; f.img = el; f.note = note ? f.noteBox : null;
        f.srcR = hot ? 0 : parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        f.toR = hot ? 0 : 14;
        if (!hot || el.hasAttribute("data-on-print")) el.style.visibility = "hidden";
        focusCount(f);
        if (!calm) {
          f.anims = [f.big.animate([{ opacity: 0, transform: "translateX(" + dir * 18 + "px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" })];
          if (f.note) f.anims.push(f.note.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 60, fill: "backwards" }));
        }
        f.stepping = false;
      }
      if (out) setTimeout(swapIn, 150); else swapIn();
    };
    img.src = hot ? el.getAttribute("data-src") : (el.currentSrc || el.src);
  }
  function restick(doc) { [].forEach.call(doc.querySelectorAll(".cur-print.is-peeled"), function (p) { p.classList.remove("is-peeled"); p.classList.add("is-sticking"); setTimeout(function () { p.classList.remove("is-sticking"); }, 400); }); }
  function settleFocus(f) { f.anims.forEach(function (a) { try { a.finish(); } catch (e) {} }); f.anims = []; }
  function closeFocus() {
    var f = focusState; if (!f) return false;
    if (f.closing) return true; f.closing = true;
    var live = getComputedStyle(f.big), from = { transform: live.transform === "none" ? "none" : live.transform, borderRadius: live.borderTopLeftRadius, opacity: live.opacity };
    var backFrom = getComputedStyle(f.back).opacity;
    f.anims.forEach(function (a) { a.cancel(); }); f.anims = [];
    var r = focusRect(f.img), onScreen = r.width && r.bottom > 0 && r.top < window.innerHeight;
    function done() { f.img.style.visibility = ""; f.ov.remove(); restick(f.ov.ownerDocument); if (focusState === f) focusState = null; try { f.img.focus({ preventScroll: true }); } catch (e) {} }
    if (reduceMotion || !f.big.animate) { done(); return true; }
    var k = r.width / f.t.w;
    var to = onScreen ? { transform: lift(f, r), borderRadius: f.srcR / k + "px", opacity: 1 } : { transform: "translateY(48px) scale(0.94)", borderRadius: f.toR + "px", opacity: 0 };
    var a = f.big.animate([from, to], { duration: 480, easing: springEase(0.36, 480), fill: "both" });
    f.back.animate([{ opacity: backFrom }, { opacity: 0 }], { duration: 300, easing: "ease", fill: "both" });
    [f.close, f.count].concat(f.note ? [f.note] : []).forEach(function (el) { el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 140, fill: "both" }); });
    a.onfinish = done;
    return true;
  }
  // drag to dismiss: 1:1 tracking, velocity from the last few moves
  function wireFocusDrag(f) {
    var start = null, hist = [], dragging = false, last = { dx: 0, dy: 0 };
    f.ov.addEventListener("pointerdown", function (e) {
      if (f.closing || e.target.closest(".cur-focus-close")) return;
      settleFocus(f);
      start = { x: e.clientX, y: e.clientY }; hist = [{ y: e.clientY, t: e.timeStamp }]; dragging = false;
      f.ov.setPointerCapture(e.pointerId);
    });
    f.ov.addEventListener("pointermove", function (e) {
      if (!start || f.closing) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) < 8) return;
      last = { dx: dx, dy: dy };
      dragging = true;
      hist.push({ y: e.clientY, t: e.timeStamp }); if (hist.length > 5) hist.shift();
      var p = Math.min(1, Math.abs(dy) / (window.innerHeight * 0.5));
      f.big.style.transform = "translate(" + dx + "px, " + dy + "px) scale(" + (1 - p * 0.18) + ")";
      f.back.style.opacity = String(1 - p * 0.85);
      if (f.note) f.note.style.opacity = String(1 - Math.min(1, p * 3));
    });
    function end(e) {
      if (!start) return;
      var was = dragging; start = null; dragging = false;
      if (!was) { if (e.type === "pointerup") closeFocus(); return; }
      // a sideways swipe steps to the next / previous picture
      if (Math.abs(last.dx) > 60 && Math.abs(last.dx) > Math.abs(last.dy) * 1.4) {
        f.big.style.transform = ""; f.back.style.opacity = ""; if (f.note) f.note.style.opacity = "";
        stepFocus(last.dx < 0 ? 1 : -1); return;
      }
      var a = hist[0], b = hist[hist.length - 1], vy = b.t > a.t ? (b.y - a.y) / (b.t - a.t) * 1000 : 0;
      var cur = new DOMMatrixReadOnly(getComputedStyle(f.big).transform);
      var projected = cur.m42 + (vy / 1000) * 0.998 / (1 - 0.998); // where the throw would come to rest
      if (Math.abs(projected) > window.innerHeight * 0.22) { closeFocus(); return; }
      // not far enough: spring home from where it is
      var from = getComputedStyle(f.big).transform;
      f.big.style.transform = ""; f.back.style.opacity = ""; if (f.note) f.note.style.opacity = "";
      f.anims = [f.big.animate([{ transform: from }, { transform: "none" }], { duration: 520, easing: springEase(0.4, 520) })];
    }
    f.ov.addEventListener("pointerup", end);
    f.ov.addEventListener("pointercancel", end);
    f.close.addEventListener("click", function () { closeFocus(); });
  }

  function closeCurModal() {
    var m = document.querySelector(".cur-modal");
    if (!m || m.hidden || m.classList.contains("is-closing")) return;
    if (focusState) { focusState.img.style.visibility = ""; focusState.ov.remove(); focusState = null; }
    m.classList.add("is-closing");
    songStop();
    curTopic = null;
    setRoomHash("");
    roomAnimate(m, false, function () {
      stopRoom(m);
      m.classList.remove("is-closing");
      m.hidden = true; document.body.style.overflow = "";
      var c = m.querySelector(".cur-modal-content"); if (c) c.innerHTML = "";
      var lb = m.querySelector(".cur-label"); if (lb) lb.innerHTML = "";
      var so = m.querySelector(".cur-sources"); if (so) so.hidden = true;
    });
  }
  function buildTOC(modal) {
    var toc = modal.querySelector(".cur-toc"); if (!toc) return;
    var content = modal.querySelector(".cur-modal-content");
    var heads = content ? [].slice.call(content.querySelectorAll(".cur-h")) : [];
    if (heads.length < 1) { toc.hidden = true; toc.innerHTML = ""; return; }
    toc.hidden = false;
    toc.innerHTML = '<div class="cur-toc-label">Contents</div>' + heads.map(function (h) {
      return '<a href="#' + h.id + '" data-sec="' + h.id + '">' + (h.textContent || "") + "</a>";
    }).join("");
    [].forEach.call(toc.querySelectorAll("a"), function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); var t = document.getElementById(a.dataset.sec); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
    });
    var scroller = modal.querySelector(".cur-modal-body");
    if (scroller && "IntersectionObserver" in window) {
      if (modal.__tocObs) modal.__tocObs.disconnect();
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { var id = en.target.id; [].forEach.call(toc.querySelectorAll("a"), function (a) { a.classList.toggle("is-active", a.dataset.sec === id); }); }
        });
      }, { root: scroller, rootMargin: "0px 0px -72% 0px", threshold: 0 });
      heads.forEach(function (h) { obs.observe(h); });
      modal.__tocObs = obs;
    }
  }
  // Mac window chrome, shared with Studio — fetched the first time a topic
  // has a video to frame
  var macwinLoading = null;
  function loadMacWin() {
    if (window.MacWin) return Promise.resolve();
    if (!macwinLoading) macwinLoading = new Promise(function (res, rej) {
      var sc = document.createElement("script"); sc.src = "/assets/macwin.js?v=4";
      sc.onload = res; sc.onerror = function () { macwinLoading = null; rej(); };
      document.head.appendChild(sc);
    });
    return macwinLoading;
  }
  // a board window is MacWin's Preview window baked at 2× around the photo (37pt title bar, 3pt sides,
  // the long side of the photo 720pt): show just the photo, and hand focus mode the same crop
  function developPrints(root) {
    [].forEach.call(root.querySelectorAll(".cur-print-photo img"), function (im) {
      function crop() {
        var nw = im.naturalWidth, nh = im.naturalHeight; if (!nw) return;
        var k = Math.max(nw / 726, nh / 760), e = 5 * k, x = 3 * k + e, y = 37 * k + e, w = nw - 2 * x, h = nh - 40 * k - 2 * e;
        var box = im.parentNode; box.style.aspectRatio = (w / h).toFixed(4);
        im.style.cssText = "width:" + (nw / w * 100) + "%;height:" + (nh / h * 100) + "%;left:" + (-x / w * 100) + "%;top:" + (-y / h * 100) + "%";
        im.classList.add("is-in");
        var card = im.closest(".cur-print");
        (document.fonts && document.fonts.load ? document.fonts.load('40px "My Hand"') : Promise.resolve()).catch(function () {}).then(function () {
          try { polaroid(im, x, y, w, h, card.getAttribute("data-note") || "", function (url) { card.setAttribute("data-src", url); card.setAttribute("data-on-print", ""); }); } catch (err) {}
        });
      }
      if (im.complete && im.naturalWidth) crop(); else im.addEventListener("load", crop, { once: true });
    });
  }
  // a video hangs as a print too: the player on white card, its title written underneath, a strip of tape
  // the print as one picture — white border, the photo, the note in Isaac's hand on the strip below
  function polaroid(im, x, y, w, h, note, done) {
    var pw = Math.round(w), ph = Math.round(h), fr = Math.round(pw * 0.048), bottom = Math.round(pw * 0.21);
    var c = document.createElement("canvas"); c.width = pw + 2 * fr; c.height = ph + fr + bottom;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#fdfcf9"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(im, x, y, w, h, fr, fr, pw, ph);
    if (note) {
      var size = Math.round(pw * 0.058), maxW = pw - 8, lines = [], cur = "";
      ctx.font = size + 'px "My Hand", Charter, Georgia, serif'; ctx.fillStyle = "#1f1d20"; ctx.textBaseline = "alphabetic";
      note.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').split(/\s+/).forEach(function (wd) {
        var t = cur ? cur + " " + wd : wd;
        if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = wd; } else cur = t;
      });
      if (cur) lines.push(cur);
      lines.slice(0, 2).forEach(function (ln, k) { ctx.fillText(ln, fr + 4, ph + fr + size * 1.3 + k * size * 1.12); });
    }
    c.toBlob(function (b) { if (b) done(URL.createObjectURL(b)); }, "image/jpeg", 0.92);
  }
  // pulling the tape off: a short dry crackle, made on the spot (Web Audio, no file), quiet
  var audioCtx = null;
  function peelSound() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var ac = audioCtx, dur = 0.32, n = Math.round(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) {
        var t = i / n, env = Math.pow(t, 0.35) * Math.pow(1 - t, 1.6);          // rises as it lets go, then falls away
        var crackle = Math.random() < 0.06 + 0.25 * t ? (Math.random() * 2 - 1) * 1.8 : (Math.random() * 2 - 1) * 0.35;
        d[i] = crackle * env;
      }
      var src = ac.createBufferSource(); src.buffer = buf;
      var bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.7;
      var hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
      var g = ac.createGain(); g.gain.value = 0.22;
      src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(ac.destination);
      src.start();
    } catch (e) {}
  }
  function frameVideos(root) {
    [].forEach.call(root.querySelectorAll("figure[data-win]:not(.is-framed)"), function (fig, i) {
      var media = fig.querySelector("iframe, video"); if (!media) return;
      fig.classList.add("is-framed", "cur-vprint");
      fig.style.setProperty("--tilt", [-0.8, 0.7, -0.5, 0.9][i % 4] + "deg");
      var hole = document.createElement("div"); hole.className = "cur-vprint-hole";
      media.replaceWith(hole); hole.appendChild(media);
      var note = document.createElement("div"); note.className = "cur-vprint-note";
      note.textContent = String(fig.getAttribute("data-win") || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
      hole.after(note);
      if (media.tagName === "VIDEO" && media.autoplay) media.play().catch(function () {});
    });
  }

  function renderCurTopic(modal) {
    var no = curNo(curTopic);
    modal.querySelector(".cur-label").innerHTML = curLabelHTML(curTopic, false) + curTuneHTML(curTopic.song) + (no ? '<span class="cur-no">' + no + "</span>" : "");
    modal.querySelector(".cur-modal-content").innerHTML = curBlocksHTML(curTopic.blocks);
    frameVideos(modal); developPrints(modal);
    buildTOC(modal);
    renderSources(modal, curTopic.inspiration);
  }
  function htmlEsc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  // the inspiration list, as the exhibition's closing credits card. A line
  // written "Title : Author - Year" reads as a catalogue entry
  // ("Author, Title, Year"); anything else is shown as written.
  function renderSources(modal, text) {
    var box = modal.querySelector(".cur-sources"); if (!box) return;
    var lines = String(text || "").split(/\n+/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l && !/^(inspirations?|sources?)\s*:?$/i.test(l); });
    if (!lines.length) { box.hidden = true; return; }
    box.hidden = false;
    box.querySelector(".cur-sources-list").innerHTML = lines.map(function (l) {
      var m = /^(.+?)\s+:\s+(.+?)\s+[-–—]\s+(\d{4})$/.exec(l), out;
      if (m) out = htmlEsc(m[2]) + ", <em>" + htmlEsc(m[1]) + "</em>, " + m[3];
      else out = htmlEsc(l).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      return "<li><span>" + out + "</span></li>";
    }).join("");
  }
  function openCurTopic(slug) {
    var modal = document.querySelector(".cur-modal"); if (!modal) return;
    var reopening = modal.classList.contains("is-closing");
    modal.classList.remove("is-closing");
    modal.dataset.slug = slug;
    applyTone(modal, slug);
    setRoomHash(slug);
    var content = modal.querySelector(".cur-modal-content");
    if (!reopening || !content.innerHTML) {
      modal.querySelector(".cur-label").innerHTML = "";
      modal.querySelector(".cur-sources").hidden = true;
      content.innerHTML = '<p class="cur-loading">' + ui("loading") + "</p>";
      modal.querySelector(".cur-modal-body").scrollTop = 0;
    }
    modal.hidden = false; document.body.style.overflow = "hidden";
    roomAnimate(modal, true);
    var close = modal.querySelector(".cur-modal-close"); if (close) close.focus({ preventScroll: true });
    fetch("/curation/topics/" + slug + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (t) {
      if (modal.dataset.slug !== slug || modal.hidden) return;
      curTopic = t; applyTone(modal, slug); renderCurTopic(modal);
    }).catch(function () { content.innerHTML = '<p class="cur-loading">' + ui("failed") + "</p>"; });
  }
  // "23 October 2026" (or "23 octobre 2026") from the topic's YYYY-MM-DD date
  function curDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
    if (!m) return "";
    try {
      return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(siteLang() === "fr" ? "fr-FR" : "en-GB",
        { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return ""; }
  }
  // a museum label: "Author, / Title, description, date" — one run of text.
  // On the feed the title is the card's button (its ::after stretches over the
  // whole card); in the room it's the dialog's heading.
  function curLabelHTML(t, asButton) {
    var desc = String(loc(t, "desc") || "").trim().replace(/[.,;:]+$/, ""), date = curDate(t.date);
    var tail = [desc, date].filter(Boolean), title = esc(loc(t, "title"));
    return '<span class="cur-author">' + esc(t.author || "") + ",</span> "
      + (asButton ? '<h2 class="cur-title"><button class="cur-open" type="button">' + title + "</button>"
                  : '<h2 class="cur-title" id="curRoomTitle">' + title)
      + (tail.length ? "," : "") + "</h2> "
      + (desc ? '<span class="cur-desc">' + esc(desc) + (date ? "," : "") + "</span> " : "")
      + (date ? '<time datetime="' + esc(t.date) + '">' + date + "</time>" : "");
  }
  // the topic's soundtrack (optional): one quiet line at the foot of its label
  function curTuneHTML(song) {
    var sid = song && youtubeId(song.src); if (!sid) return "";
    var st = String(song.title || "").trim() || "Untitled", sa = String(song.artist || "").trim(), fr = siteLang() === "fr";
    return '<div class="cur-tune" data-yt="' + sid + '" data-start="' + (+song.start || 0) + '">'
      + '<button class="cur-song-play" type="button" aria-label="' + htmlEsc((fr ? "Écouter " : "Play ") + st + (sa ? " — " + sa : "")).replace(/"/g, "&quot;") + '">'
      + '<svg class="ic-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.3 0-1.7l-10-6.4c-.7-.5-1.6 0-1.6.8z"/></svg>'
      + '<svg class="ic-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg></button>'
      + '<span class="cur-tune-name">' + htmlEsc(st) + (sa ? '<span class="cur-tune-by"> · ' + htmlEsc(sa) + "</span>" : "") + "</span>"
      + '<span class="cur-song-time" aria-hidden="true"></span></div>'
      + '<span class="cur-song-bar" aria-hidden="true"><span></span></span>';
  }
  function curCardText(t) { return curLabelHTML(t, true); }
  // the btbr mark, blind-embossed into the label's bottom-left corner
  var CUR_MARK_SVG = '<svg class="cur-mark" viewBox="-3 -3 272 280" aria-hidden="true" focusable="false"><path d="'
    + "M0 0h126v10H0zM0 38h10v126H0zM256 148h10v126h-10zM68 132h10v126H68zM10 194h122v10H10zM104 248h126v10H104z"
    + '"/></svg>';
  function curFoot(t) { var no = curNo(t); return '<div class="cur-foot">' + CUR_MARK_SVG + (no ? '<span class="cur-no">' + no + "</span>" : "") + "</div>"; }
  function curCard(t) {
    var cover = t.cover ? '<img src="' + esc(t.cover) + '" alt="" loading="lazy">' : "<span>no image</span>";
    return '<article class="cur-card" data-slug="' + esc(t.slug) + '">'
      + '<div class="cur-sheet"><div class="cur-text">' + curCardText(t) + "</div>" + curFoot(t) + "</div>"
      + '<div class="cur-tray"><div class="cur-well"><div class="cur-media' + (t.cover ? " has-cover" : " cur-ph") + '">' + cover + "</div></div></div>"
      + "</article>";
  }
  function curEmptyHTML() {
    return '<div class="cur-empty"><p class="cur-empty-title">' + ui("emptyT") + '</p><p class="cur-empty-sub">' + ui("emptyS") + "</p></div>";
  }
  // ---- the cover tray, ten ways (trying them: /curation/?tray=<name>; "plate" is the photo resting in its well)
  var TRAY = (new URLSearchParams(location.search).get("tray") || "frame").toLowerCase();
  var topicCache = {}, bareCache = {};
  function topicData(slug) {
    return topicCache[slug] || (topicCache[slug] = fetch("/curation/topics/" + encodeURIComponent(slug) + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }).catch(function () { return {}; }));
  }
  // a board window (MacWin's Preview window baked at 2×) → just its photo, as a blob URL
  function bareURL(src) {
    if (!/\/board-\d+-\d+\.png($|\?)/.test(src)) return Promise.resolve(src);
    return bareCache[src] || (bareCache[src] = new Promise(function (res) {
      var im = new Image(); im.onload = function () {
        var nw = im.naturalWidth, nh = im.naturalHeight, k = Math.max(nw / 726, nh / 760), e = 5 * k, x = 3 * k + e, y = 37 * k + e, w = nw - 2 * x, h = nh - 40 * k - 2 * e;
        var c = document.createElement("canvas"); c.width = Math.round(Math.min(w, 900)); c.height = Math.round(c.width * h / w);
        c.getContext("2d").drawImage(im, x, y, w, h, 0, 0, c.width, c.height);
        c.toBlob(function (b) { res(b ? URL.createObjectURL(b) : src); }, "image/jpeg", 0.9);
      };
      im.onerror = function () { res(src); }; im.src = src;
    }));
  }
  // the topic's photographs: the cover when it is one, then every picture on its boards
  function topicPhotos(t) {
    return topicData(t.slug).then(function (d) {
      var list = [];
      if (t.feed || d.feed) list.push(t.feed || d.feed);              // chosen in Studio
      if (/\.(jpe?g|webp)($|\?)/i.test(t.cover || "") && list.indexOf(t.cover) < 0) list.push(t.cover);
      (d.blocks || []).forEach(function (b) {
        if (b.type !== "image") return;
        (b.board && b.board.items && b.board.items.length ? b.board.items.map(function (it) { return it.src; }) : [b.src]).forEach(function (u) { if (u && list.indexOf(u) < 0) list.push(u); });
      });
      if (!list.length && t.cover) list.push(t.cover);
      return Promise.all(list.slice(0, 6).map(bareURL));
    });
  }
  function trayImg(u) { return '<img src="' + esc(u) + '" alt="">'; }
  function trayPrint(u, cls, tilt, tape, note) {
    return '<span class="tp ' + (cls || "") + ' tape-' + (tape || "top") + '" style="--tilt:' + (tilt || 0) + 'deg"><span class="tp-in"><span class="tp-ph">' + trayImg(u) + "</span>"
      + '<span class="tp-note">' + htmlEsc(note || "") + "</span></span></span>";
  }
  var TRAYS = {
    // one print, taped, the topic's name written on it
    print: function (t, p) { return trayPrint(p[0], "tp-one", -2.4, "top", loc(t, "title")); },
    // one print hung on a pin; it swings a little on hover
    pin: function (t, p) { return '<span class="tp-pinwrap">' + trayPrint(p[0], "tp-one tp-pinned", 0, "none", loc(t, "title")) + '<i class="tp-pin"></i></span>'; },
    // a museum frame: thin black moulding, a wide white mat, hung on the wall of the well
    frame: function (t, p) { return '<span class="tf-frame"><span class="tf-mat">' + trayImg(p[0]) + "</span></span>"; },
    // a print in a frame: the polaroid itself, taped onto the mat behind glass
    framedprint: function (t, p) { return '<span class="tf-frame tf-deep"><span class="tf-mat tf-mat-print">' + trayPrint(p[0], "tp-inframe", -1.6, "top", loc(t, "title")) + '</span><span class="tf-glass"></span></span>'; },
    // a darkroom line: prints drying on a string, held by wooden pegs
    line: function (t, p) {
      var q = [0, 1, 2].map(function (k) { return p[k % p.length]; });
      return '<span class="tl-line"></span>' + trayPrint(q[0], "tl-p tl-p1", -3, "none") + trayPrint(q[1], "tl-p tl-p2", 2.5, "none") + trayPrint(q[2], "tl-p tl-p3", -1.5, "none")
        + '<i class="tl-peg tl-g1"></i><i class="tl-peg tl-g2"></i><i class="tl-peg tl-g3"></i>';
    },
    // a photo book: cloth cover, the photograph tipped in, the title stamped below
    book: function (t, p) { return '<span class="tk-book"><span class="tk-spine"></span><span class="tk-tip">' + trayImg(p[0]) + '</span><span class="tk-title">' + htmlEsc(loc(t, "title")) + '</span><span class="tk-sub">' + htmlEsc(t.author || "") + "</span></span>"; },
    // the museum wall: a framed photograph, its small label beside it — as in the room
    museum: function (t, p) {
      return '<span class="tm-wall"><span class="tf-frame tm-frame"><span class="tf-mat">' + trayImg(p[0]) + '</span></span><span class="tm-label"><b>' + htmlEsc(t.author || "") + ',</b> ' + htmlEsc(loc(t, "title"))
        + (loc(t, "desc") ? ", " + htmlEsc(String(loc(t, "desc"))) : "") + '<i>' + htmlEsc(curNo(t) || "") + "</i></span></span>";
    },
    // a lightbox: three slides lit from below
    lightbox: function (t, p) {
      return '<span class="tx-box">' + [0, 1, 2].map(function (k) { return '<span class="tx-slide tx-s' + (k + 1) + '"><span class="ts-win">' + trayImg(p[k % p.length]) + "</span></span>"; }).join("") + "</span>";
    }
  };
  function dressTrays(root) {
    if (!TRAYS[TRAY]) return;
    document.body.classList.add("tray-" + TRAY);
    [].forEach.call(root.querySelectorAll(".cur-card"), function (card) {
      var t = (curList || []).filter(function (x) { return x.slug === card.dataset.slug; })[0], well = card.querySelector(".cur-well");
      if (!t || !well) return;
      topicPhotos(t).then(function (p) {
        if (!p.length) return;
        well.innerHTML = '<div class="cur-media tray-art">' + TRAYS[TRAY](t, p) + "</div>";
      });
    });
  }
  function initCuration() {
    var feed = document.querySelector("[data-curation]");
    if (!feed || feed.dataset.loaded) return;
    feed.dataset.loaded = "1";
    fetch("/curation/topics/index.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      curList = list || [];
      if (!curList.length) { feed.insertAdjacentHTML("beforeend", curEmptyHTML()); return; }
      feed.insertAdjacentHTML("beforeend", curList.map(curCard).join(""));
      dressTrays(feed);
      // after the grid, not in it, so a short row of cards stays centred
      feed.insertAdjacentHTML("afterend", '<p class="cur-end">' + ui("end") + "</p>");
      openFromHash();
    }).catch(function () { curList = []; feed.insertAdjacentHTML("beforeend", curEmptyHTML()); });
  }
  // deep links: /curation/#slug opens that topic (out of its tray, once the
  // table is laid out); the address follows the open room without adding
  // history entries, so Back still leaves the page as before
  function hashSlug() { return decodeURIComponent((location.hash || "").slice(1)); }
  function openFromHash() {
    var slug = hashSlug();
    if (!slug || !curList || !document.querySelector(".curation-frame")) return;
    if (!curList.some(function (x) { return x.slug === slug; })) return;
    var m = document.querySelector(".cur-modal");
    if (m && !m.hidden && m.dataset.slug === slug) return;
    requestAnimationFrame(function () { openCurTopic(slug); });
  }
  function setRoomHash(slug) {
    if (!document.querySelector(".curation-frame")) return;
    var url = location.pathname + location.search + (slug ? "#" + encodeURIComponent(slug) : "");
    try { history.replaceState(history.state, "", url); } catch (e) {}
  }
  window.addEventListener("hashchange", openFromHash);
  // re-render the curation feed + open topic in the current language
  function applyCurLang(touched) {
    var frame = document.querySelector(".curation-frame"); if (!frame) return;
    if (curList) {
      frame.querySelectorAll(".cur-card").forEach(function (card) {
        var t = curList.filter(function (x) { return x.slug === card.dataset.slug; })[0];
        var box = card.querySelector(".cur-text");
        if (t && box) { box.innerHTML = curCardText(t); touched.push(box); }
        var no = card.querySelector(".cur-no"); if (t && no) no.textContent = curNo(t);
      });
      var end = frame.querySelector(".cur-end"); if (end) { end.textContent = ui("end"); touched.push(end); }
      var empty = frame.querySelector(".cur-empty"); if (empty) { empty.outerHTML = curEmptyHTML(); touched.push(frame.querySelector(".cur-empty")); }
    }
    var modal = frame.querySelector(".cur-modal");
    if (modal && !modal.hidden && curTopic) { renderCurTopic(modal); touched.push(modal.querySelector(".cur-modal-panel")); }
  }

  // ---- site language (EN / FR) ----
  // English by default; the choice is remembered per device. Static page text
  // is translated by /i18n/fr.js — a map from the English (an element's inner
  // HTML, whitespace collapsed) to its French — fetched only once someone picks
  // FR. Each swapped element keeps its English in a data-en-* attribute, so
  // flipping back is exact.
  var LANG_KEY = "btbr_lang";
  function siteLang() {
    var v = null;
    try { v = localStorage.getItem(LANG_KEY) || localStorage.getItem("btbr_cur_lang"); } catch (e) {}
    return v === "fr" ? "fr" : "en";
  }
  function tr(en) { return (siteLang() === "fr" && window.__btbrFR && window.__btbrFR[en]) || en; }
  var frLoading = null;
  function loadFR() {
    if (window.__btbrFR) return Promise.resolve();
    if (!frLoading) frLoading = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "/i18n/fr.js?v=1";
      s.onload = res;
      s.onerror = function () { frLoading = null; rej(); };
      document.head.appendChild(s);
    });
    return frLoading;
  }
  var I18N_SKIP = ".curation, .cur-modal, .lang-btn, svg";
  var I18N_ATTRS = ["alt", "aria-label", "title"];
  function squash(s) { return s.replace(/\s+/g, " ").trim(); }
  function ownText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }
  // dict = the French map to translate into, or null to restore the English
  function i18nFrame(frame, dict, touched) {
    var all = frame.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      // skip nodes already swapped out with their parent, and areas that
      // translate themselves (curation feed + pop-up)
      if (!frame.contains(el) || el.closest(I18N_SKIP)) continue;
      I18N_ATTRS.forEach(function (a) {
        var keep = "data-en-" + a;
        if (dict) {
          var v = !el.hasAttribute(keep) && el.getAttribute(a);
          var fr = v && dict[squash(v)];
          if (fr) { el.setAttribute(keep, v); el.setAttribute(a, fr); }
        } else if (el.hasAttribute(keep)) {
          el.setAttribute(a, el.getAttribute(keep)); el.removeAttribute(keep);
        }
      });
      if (dict) {
        if (el.hasAttribute("data-en-html") || !ownText(el)) continue;
        var html = dict[squash(el.innerHTML)];
        if (html == null) continue;
        el.setAttribute("data-en-html", el.innerHTML);
        el.innerHTML = html;
        touched.push(el);
      } else if (el.hasAttribute("data-en-html")) {
        el.innerHTML = el.getAttribute("data-en-html");
        el.removeAttribute("data-en-html");
        touched.push(el);
      }
    }
  }
  function i18nTitle(dict) {
    var root = document.documentElement, en = root.getAttribute("data-en-title");
    if (dict) {
      var fr = dict[document.title];
      if (fr) { root.setAttribute("data-en-title", document.title); document.title = fr; }
    } else if (en) {
      if (window.__btbrFR && document.title === window.__btbrFR[en]) document.title = en;
      root.removeAttribute("data-en-title");
    }
  }
  // put the page in the reader's language; `fade` re-develops the swapped
  // words (blur → sharp) when they flip it by hand
  function applyLang(fade) {
    var lang = siteLang(), root = document.documentElement;
    root.lang = lang;
    var label = lang === "fr" ? "Read in English" : "Lire en français";
    document.querySelectorAll(".lang-btn").forEach(function (b) {
      b.textContent = lang.toUpperCase();
      b.setAttribute("aria-label", label); b.title = label;
    });
    if (lang === "fr" && !window.__btbrFR) {
      // first paint of a French page waits (briefly) for the translations
      if (!fade) {
        root.classList.add("i18n-wait");
        setTimeout(function () { root.classList.remove("i18n-wait"); }, 1500);
      }
      loadFR().then(function () { root.classList.remove("i18n-wait"); applyLang(fade); },
                    function () { root.classList.remove("i18n-wait"); });
      return;
    }
    var dict = lang === "fr" ? window.__btbrFR : null, touched = [];
    var frame = document.querySelector(".frame");
    if (frame) i18nFrame(frame, dict, touched);
    i18nTitle(dict);
    reflect();
    applyCurLang(touched);
    if (fade && !reduceMotion) touched.forEach(function (el) {
      // leave hidden words hidden (e.g. the home page's hover-only "soon")
      if (!el || getComputedStyle(el).opacity === "0") return;
      el.classList.remove("lang-in"); void el.offsetWidth; el.classList.add("lang-in");
    });
  }
  function toggleLang() {
    try { localStorage.setItem(LANG_KEY, siteLang() === "fr" ? "en" : "fr"); } catch (e) { return; }
    applyLang(true);
  }
  // reveal the "Studio" link only on devices that have a saved publish token
  function initStudioLink() {
    var has = false;
    try { has = !!localStorage.getItem("btbr_cur_token"); } catch (e) {}
    if (!has) return;
    document.querySelectorAll(".studio-reveal[hidden]").forEach(function (el) { el.hidden = false; });
  }
  window.__btbrInitStudioLink = initStudioLink;
  function initHomeSoon() {
    var link = document.getElementById("curationLink");
    if (!link || link.dataset.checked) return;
    link.dataset.checked = "1";
    fetch("/curation/topics/index.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      if (!list || !list.length) link.classList.add("is-soon");
    }).catch(function () { link.classList.add("is-soon"); });
  }
  window.__btbrInitCuration = initCuration;
  window.__btbrInitHomeSoon = initHomeSoon;
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".lang-btn")) { toggleLang(); return; }
    // the label's title button and the cover tray both open the topic
    var openBtn = t.closest(".cur-open, .cur-card .cur-tray");
    if (openBtn) { var card = openBtn.closest(".cur-card"); if (card) openCurTopic(card.dataset.slug); return; }
    var sp = t.closest(".cur-song-play");
    if (sp) { var tune = sp.closest(".cur-tune"); if (tune) songToggle(tune); return; }
    var sh = t.closest(".cur-modal-share");
    if (sh) { shareTopic(sh); return; }
    var zt = t.closest(".cur-zoomable, .cur-hot");
    if (zt && zt.closest(".cur-modal-content")) {
      if (zt.classList.contains("cur-print") && !reduceMotion && !focusState && !zt.classList.contains("is-peeled")) {
        zt.classList.add("is-peeled"); peelSound();
        setTimeout(function () { openFocus(zt); }, 260);
        return;
      }
      openFocus(zt); return;
    }
    if (t.closest(".cur-modal-close") || t.classList.contains("cur-modal-backdrop")) closeCurModal();
  });
  document.addEventListener("pointerover", function (e) {
    var h = e.target && e.target.closest && e.target.closest(".cur-hot");
    if (h && !h.__pre) { h.__pre = new Image(); h.__pre.src = h.getAttribute("data-src"); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (!closeFocus()) closeCurModal(); return; }
    if (focusState && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); stepFocus(e.key === "ArrowRight" ? 1 : -1); return; }
    var z = e.target && e.target.classList && e.target.classList.contains("cur-zoomable");
    if (z && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openFocus(e.target); }
  });

  bindPage();
})();
