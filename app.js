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
    if (p) p.textContent = audio.paused ? "Play song" : "Pause";
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
  function swap(html, opts) {
    opts = opts || {};
    var doc = new DOMParser().parseFromString(html, "text/html");
    var next = doc.querySelector(".frame");
    var cur = document.querySelector(".frame");
    if (!next || !cur) return false;
    var incoming = document.importNode(next, true);
    // the about page carries its own "develop-in" entrance; other pages get the
    // quick fade+lift — unless a View Transition is driving the swap, which owns
    // the motion itself.
    var themed = incoming.classList.contains("about-frame") ||
                 incoming.classList.contains("home-frame") ||
                 incoming.classList.contains("curation-frame") ||
                 incoming.classList.contains("feed-home");
    var enter = !themed && !opts.noEnter;
    if (enter) incoming.classList.add("frame-enter"); // start faded/lifted
    // a card morph captures a snapshot of the incoming page — suppress its own
    // entrance/reveal so that snapshot is fully painted (clean morph, no pop)
    if (opts.heroName) incoming.classList.add("cf-instant");
    cur.replaceWith(incoming);
    document.title = doc.title;
    window.scrollTo(0, 0);
    // shared-element morph: tag the destination's first screenshot so it pairs
    // with the clicked home card during the View Transition
    if (opts.heroName) {
      var hero = incoming.querySelector(".shots .shot img") ||
                 incoming.querySelector(".project-icon");
      if (hero) {
        hero.style.viewTransitionName = opts.heroName;
        window.__btbrHero = hero;
      }
    }
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

  // after a shared-element transition, release the destination's morph name so
  // it doesn't linger and interfere with later transitions
  function clearHero() {
    if (window.__btbrHero) {
      window.__btbrHero.style.viewTransitionName = "";
      window.__btbrHero = null;
    }
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
    var tile = link.classList.contains("tile")
      ? link
      : (link.closest ? link.closest(".tile") : null);
    if (tile && document.startViewTransition && !reduce) {
      // clicked a home app card: morph the card into the app page's first
      // screenshot with a shared-element View Transition
      var media = tile.querySelector(".tile-img");
      page.then(function (html) {
        if (media) media.style.viewTransitionName = "app-hero";
        try {
          var vt = document.startViewTransition(function () {
            if (swap(html, { noEnter: true, heroName: "app-hero" })) {
              history.pushState(null, "", href);
            }
          });
          vt.finished.then(clearHero, clearHero);
        } catch (err) {
          if (media) media.style.viewTransitionName = "";
          go(html);
        }
      }).catch(function () { window.location.href = href; });
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
  function curBlocksHTML(blocks) {
    return (blocks || []).map(function (b) {
      if (b.type === "text") return b.head ? '<h3 class="cur-h">' + esc(b.html) + "</h3>" : "<p>" + esc(b.html) + "</p>";
      if (b.type === "image") {
        var cap = b.caption ? '<figcaption class="cur-cap">' + b.caption + "</figcaption>" : "";
        return '<figure class="cur-fig2' + (b.inset ? " inset" : "") + '"><img src="' + esc(b.src) + '" alt="' + esc(b.alt) + '" loading="lazy">' + cap + "</figure>";
      }
      if (b.type === "video") {
        if (/youtu\.?be/.test(b.src)) {
          var m = b.src.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
          return '<figure class="cur-fig2 cur-vid"><iframe src="https://www.youtube.com/embed/' + (m ? m[1] : "") + '" allowfullscreen></iframe></figure>';
        }
        var at = b.loop ? "autoplay muted loop playsinline" : "controls playsinline";
        var cap2 = b.caption ? '<figcaption class="cur-cap">' + b.caption + "</figcaption>" : "";
        return '<figure class="cur-fig2"><video src="' + esc(b.src) + '" ' + at + "></video>" + cap2 + "</figure>";
      }
      return "";
    }).join("");
  }
  function closeCurModal() {
    var m = document.querySelector(".cur-modal");
    if (m && !m.hidden) { m.hidden = true; document.body.style.overflow = ""; var c = m.querySelector(".cur-modal-content"); if (c) c.innerHTML = ""; }
  }
  function openCurTopic(slug) {
    var modal = document.querySelector(".cur-modal"); if (!modal) return;
    var content = modal.querySelector(".cur-modal-content");
    modal.querySelector(".cur-modal-title").textContent = "";
    modal.querySelector(".cur-modal-author").textContent = "";
    content.innerHTML = '<p class="cur-loading">Loading…</p>';
    modal.hidden = false; document.body.style.overflow = "hidden";
    fetch("/curation/topics/" + slug + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (t) {
      modal.querySelector(".cur-modal-title").textContent = t.title || "";
      modal.querySelector(".cur-modal-author").textContent = t.author || "";
      content.innerHTML = curBlocksHTML(t.blocks);
    }).catch(function () { content.innerHTML = '<p class="cur-loading">Couldn’t load this topic.</p>'; });
  }
  function curCard(t) {
    var cover = t.cover ? '<img src="' + esc(t.cover) + '" alt="" loading="lazy">' : "<span>no image</span>";
    return '<article class="cur-card" data-slug="' + esc(t.slug) + '">'
      + '<div class="cur-text">'
      + '<div class="cur-author"><span class="cur-avatar" aria-hidden="true"></span> ' + esc(t.author || "") + "</div>"
      + '<h2 class="cur-title">' + esc(t.title || "") + "</h2>"
      + (t.desc ? '<p class="cur-desc">' + esc(t.desc) + "</p>" : "")
      + '<button class="cur-open" type="button">Open</button>'
      + "</div>"
      + '<div class="cur-media' + (t.cover ? " has-cover" : " cur-ph") + '">' + cover + "</div>"
      + "</article>";
  }
  function initCuration() {
    var feed = document.querySelector("[data-curation]");
    if (!feed || feed.dataset.loaded) return;
    feed.dataset.loaded = "1";
    var emptyHTML = '<div class="cur-empty"><p class="cur-empty-title">Curation is in the making.</p><p class="cur-empty-sub">New topics are on the way — come back soon.</p></div>';
    fetch("/curation/topics/index.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      if (!list || !list.length) { feed.insertAdjacentHTML("beforeend", emptyHTML); return; }
      feed.insertAdjacentHTML("beforeend", list.map(curCard).join(""));
      feed.insertAdjacentHTML("beforeend", '<p class="cur-end">You’re at the bottom of the list.</p>');
    }).catch(function () { feed.insertAdjacentHTML("beforeend", emptyHTML); });
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
    var openBtn = t.closest(".cur-open");
    if (openBtn) { var card = openBtn.closest(".cur-card"); if (card) openCurTopic(card.dataset.slug); return; }
    if (t.closest(".cur-modal-close") || t.classList.contains("cur-modal-backdrop")) closeCurModal();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCurModal(); });

  bindPage();
})();
