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
  function authorAvatar(name) { var pp = authorPP(name); return pp ? '<img class="cur-avatar" src="' + pp + '" alt="" loading="lazy">' : '<span class="cur-avatar" aria-hidden="true"></span>'; }
  function curBlocksHTML(blocks) {
    return (blocks || []).map(function (b) {
      if (b.type === "text") {
        var raw = loc(b, "html") || "";
        // the contenteditable bakes in <div>/<br> line breaks; split into clean
        // paragraphs and drop empty lines so spacing is even
        var parts = raw.split(/<\/?div[^>]*>|<\/?p[^>]*>|<br\s*\/?>/i);
        var paras = [];
        for (var k = 0; k < parts.length; k++) { var s = parts[k].trim(); if (s && s.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, "").trim()) paras.push(s); }
        if (!paras.length) return "";
        if (b.head) return '<h3 class="cur-h">' + paras.join(" ") + "</h3>";
        return paras.map(function (p) { return "<p>" + p + "</p>"; }).join("");
      }
      if (b.type === "image") {
        var capT = loc(b, "caption");
        var cap = capT ? '<figcaption class="cur-cap">' + capT + "</figcaption>" : "";
        return '<figure class="cur-fig2' + (b.inset ? " inset" : "") + '"><img src="' + esc(b.src) + '" alt="' + esc(loc(b, "alt")) + '" loading="lazy">' + cap + "</figure>";
      }
      if (b.type === "video") {
        if (/youtu\.?be/.test(b.src)) {
          var m = b.src.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
          return '<figure class="cur-fig2 cur-vid"><iframe src="https://www.youtube.com/embed/' + (m ? m[1] : "") + '" allowfullscreen></iframe></figure>';
        }
        var at = b.loop ? "autoplay muted loop playsinline" : "controls playsinline";
        var capV = loc(b, "caption");
        var cap2 = capV ? '<figcaption class="cur-cap">' + capV + "</figcaption>" : "";
        return '<figure class="cur-fig2"><video src="' + esc(b.src) + '" ' + at + "></video>" + cap2 + "</figure>";
      }
      return "";
    }).join("");
  }
  function closeCurModal() {
    var m = document.querySelector(".cur-modal");
    if (m && !m.hidden) { m.hidden = true; document.body.style.overflow = ""; var c = m.querySelector(".cur-modal-content"); if (c) c.innerHTML = ""; }
    curTopic = null;
  }
  function renderCurTopic(modal) {
    modal.querySelector(".cur-modal-title").textContent = loc(curTopic, "title");
    var au = curTopic.author || "";
    modal.querySelector(".cur-modal-author").innerHTML = authorAvatar(au) + "<span>" + esc(au) + "</span>";
    modal.querySelector(".cur-modal-content").innerHTML = curBlocksHTML(curTopic.blocks);
  }
  function openCurTopic(slug) {
    var modal = document.querySelector(".cur-modal"); if (!modal) return;
    var content = modal.querySelector(".cur-modal-content");
    modal.querySelector(".cur-modal-title").textContent = "";
    modal.querySelector(".cur-modal-author").textContent = "";
    content.innerHTML = '<p class="cur-loading">' + ui("loading") + "</p>";
    modal.hidden = false; document.body.style.overflow = "hidden";
    fetch("/curation/topics/" + slug + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (t) {
      curTopic = t; renderCurTopic(modal);
    }).catch(function () { content.innerHTML = '<p class="cur-loading">' + ui("failed") + "</p>"; });
  }
  function curCardText(t) {
    var desc = loc(t, "desc");
    return '<div class="cur-author">' + authorAvatar(t.author || "") + " " + esc(t.author || "") + "</div>"
      + '<h2 class="cur-title">' + esc(loc(t, "title")) + "</h2>"
      + (desc ? '<p class="cur-desc">' + esc(desc) + "</p>" : "")
      + '<button class="cur-open" type="button">' + ui("open") + "</button>";
  }
  function curCard(t) {
    var cover = t.cover ? '<img src="' + esc(t.cover) + '" alt="" loading="lazy">' : "<span>no image</span>";
    return '<article class="cur-card" data-slug="' + esc(t.slug) + '">'
      + '<div class="cur-text">' + curCardText(t) + "</div>"
      + '<div class="cur-media' + (t.cover ? " has-cover" : " cur-ph") + '">' + cover + "</div>"
      + "</article>";
  }
  function curEmptyHTML() {
    return '<div class="cur-empty"><p class="cur-empty-title">' + ui("emptyT") + '</p><p class="cur-empty-sub">' + ui("emptyS") + "</p></div>";
  }
  function initCuration() {
    var feed = document.querySelector("[data-curation]");
    if (!feed || feed.dataset.loaded) return;
    feed.dataset.loaded = "1";
    fetch("/curation/topics/index.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      curList = list || [];
      if (!curList.length) { feed.insertAdjacentHTML("beforeend", curEmptyHTML()); return; }
      feed.insertAdjacentHTML("beforeend", curList.map(curCard).join(""));
      feed.insertAdjacentHTML("beforeend", '<p class="cur-end">' + ui("end") + "</p>");
    }).catch(function () { curList = []; feed.insertAdjacentHTML("beforeend", curEmptyHTML()); });
  }
  // re-render the curation feed + open topic in the current language
  function applyCurLang(touched) {
    var frame = document.querySelector(".curation-frame"); if (!frame) return;
    if (curList) {
      frame.querySelectorAll(".cur-card").forEach(function (card) {
        var t = curList.filter(function (x) { return x.slug === card.dataset.slug; })[0];
        var box = card.querySelector(".cur-text");
        if (t && box) { box.innerHTML = curCardText(t); touched.push(box); }
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
    var openBtn = t.closest(".cur-open");
    if (openBtn) { var card = openBtn.closest(".cur-card"); if (card) openCurTopic(card.dataset.slug); return; }
    if (t.closest(".cur-modal-close") || t.classList.contains("cur-modal-backdrop")) closeCurModal();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCurModal(); });

  bindPage();
})();
