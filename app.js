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
  // Native <details> snaps open; we animate the content height instead so it
  // glides. Works in every browser and degrades to an instant toggle if JS
  // is off.
  function wireDetails(details) {
    if (details.__smooth) return;
    details.__smooth = true;
    var summary = details.querySelector(":scope > summary");
    var body = details.querySelector(":scope > *:not(summary)");
    if (!summary || !body) return;

    function settle(keepOpen) {
      return function te(ev) {
        if (ev.propertyName !== "height") return;
        body.removeEventListener("transitionend", te);
        details.open = keepOpen;
        body.style.height = "";
        body.style.opacity = "";
        details.__busy = false;
      };
    }

    summary.addEventListener("click", function (e) {
      e.preventDefault();
      if (details.__busy) return;
      details.__busy = true;

      if (details.open) {
        // closing: current height -> 0, then drop the open attribute
        body.style.height = body.offsetHeight + "px";
        body.getBoundingClientRect(); // force reflow so the start height sticks
        body.style.height = "0px";
        body.style.opacity = "0";
        body.addEventListener("transitionend", settle(false));
      } else {
        // opening: 0 -> natural height, then release to auto
        details.open = true;
        var target = body.scrollHeight;
        body.style.height = "0px";
        body.style.opacity = "0";
        body.getBoundingClientRect(); // reflow before animating up
        body.style.height = target + "px";
        body.style.opacity = "1";
        body.addEventListener("transitionend", settle(true));
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
    // the about page carries its own "develop-in" entrance; other pages get the
    // quick fade+lift
    var themed = incoming.classList.contains("about-frame");
    if (!themed) incoming.classList.add("frame-enter"); // start faded/lifted
    cur.replaceWith(incoming);
    document.title = doc.title;
    window.scrollTo(0, 0);
    bindPage();
    if (!themed) {
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
    if (toAbout && cur && !reduce) {
      // "fade to memory": desaturate + dim the current page, then let the about
      // page develop in
      cur.classList.add("to-memory");
      Promise.all([page, new Promise(function (res) { setTimeout(res, 520); })])
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

  bindPage();
})();
