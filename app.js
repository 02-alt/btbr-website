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

  function reflect() {
    var p = document.getElementById("play");
    if (p) p.textContent = audio.paused ? "Play song" : "Pause";
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
    var photo = document.querySelector(".about-photo");
    var lb = document.getElementById("lightbox");
    if (photo && lb) {
      photo.onclick = function () { lb.classList.add("open"); };
      lb.onclick = function () { lb.classList.remove("open"); };
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
    cur.replaceWith(document.importNode(next, true));
    document.title = doc.title;
    window.scrollTo(0, 0);
    bindPage();
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
    fetch(href)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        if (swap(html)) history.pushState(null, "", href);
        else window.location.href = href;
      })
      .catch(function () { window.location.href = href; });
  });

  window.addEventListener("popstate", function () {
    fetch(location.href)
      .then(function (r) { return r.text(); })
      .then(function (html) { swap(html); });
  });

  bindPage();
})();
