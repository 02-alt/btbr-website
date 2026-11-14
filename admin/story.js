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
  var STYLES = {
    youtube: [["window", "Window"], ["tv", "Apple TV"], ["quicktime", "QuickTime"], ["keynote", "Keynote"]],
    web: [["safari", "Safari"], ["ipad", "iPad"], ["hero", "Headline"]],
    app: [["card", "Store card"], ["icon", "Icon"], ["glass", "Glass"]],
    music: [["playing", "Now Playing"], ["album", "Album page"]],
    arena: [["grid", "Channel"]],
    book: [["books", "Apple Books"]],
    bandcamp: [["editorial", "Album page"], ["collection", "New in Cabin"]],
    wiki: [["note", "Notes"]],
    backloggd: [["bl-label", "Label"], ["bl-poster", "Poster"], ["bl-prints", "Prints"], ["bl-hand", "Review"], ["bl-quote", "Quote"]]
  };
  var OWN_BG = { tv: 1, quicktime: 1, keynote: 1, hero: 1, icon: 1, glass: 1, playing: 1, album: 1, grid: 1, books: 1, editorial: 1, note: 1, collection: 1 };
  var NO_KICKER = { grid: 1, books: 1 };   // styles that bring their own background
  S.length = "";
  S.style = { youtube: "window", web: "safari", app: "card", music: "playing", arena: "grid", book: "books", bandcamp: "editorial", wiki: "note", backloggd: "bl-label" }; S.dek = "";
  S.bl = { game: { genres: [], platforms: [] }, cover: null, shot: null, hero: null, rating: 4.5, text: "", best: "", platform: "", hours: "", name: "Isaaaaaaaac", note1: "the start", note2: "the best part", steam: "" }; S.stickerY = STICKER_Y;
  try { Object.assign(S.style, JSON.parse(localStorage.getItem("btbr_story_style") || "{}")); } catch (e) {}
  function styleOf() { return S.item ? S.style[S.item.kind] : ""; }
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
      return { title: meta("og:title") || (d.title || "").trim(), image: img, path: path, desc: meta("og:description") || meta("description") };
    }).catch(function () { return { title: "", image: "", path: path }; });
  }

  /* ---------- Apple Music, Are.na, books ---------- */
  function musicLookup(it) {
    function ask(id, extra) { return fetch("https://itunes.apple.com/lookup?id=" + id + "&country=" + it.country + (extra || "")).then(function (r) { return r.json(); }).then(function (d) { return d.results || []; }); }
    var first = it.song ? ask(it.song).then(function (r) { return r[0] && r[0].collectionId ? r[0].collectionId : it.album; }) : Promise.resolve(it.album);
    return first.then(function (albumId) { return ask(albumId, "&entity=song"); }).then(function (r) {
      var col = r.filter(function (x) { return x.wrapperType === "collection"; })[0]; if (!col) return null;
      var tracks = r.filter(function (x) { return x.wrapperType === "track"; }).sort(function (a, b) { return (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber); })
        .map(function (t) { return { id: String(t.trackId), name: t.trackName, ms: t.trackTimeMillis || 0, n: t.trackNumber }; });
      var at = -1; tracks.forEach(function (t, i) { if (it.song && t.id === it.song) at = i; });
      return { album: col.collectionName, artist: col.artistName, genre: col.primaryGenreName || "", year: String(col.releaseDate || "").slice(0, 4), count: col.trackCount || tracks.length, tracks: tracks, at: at, art: bigArt(col.artworkUrl100, "1200x1200") };
    }).catch(function () { return null; });
  }
  function arenaLookup(it) {
    var u = it.block ? "https://api.are.na/v2/blocks/" + it.block : "https://api.are.na/v2/channels/" + encodeURIComponent(it.slug) + "?per=12";
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return null;
      function txt(t) { return new DOMParser().parseFromString(String(t || ""), "text/html").body.textContent.replace(/^\s*>\s*/, "").replace(/[*_#`]+/g, "").trim(); }
      function item(c) { var im = c.image && (c.image.square || c.image.display || {}).url; return { img: im || "", title: txt(c.title || c.generated_title), text: c.class === "Text" ? txt(c.content) : "", kind: c.class }; }
      if (it.block) return { title: d.title || d.generated_title || "Block", by: d.user ? d.user.full_name : "", len: 1, items: [item(d)], block: true };
      return { title: d.title, by: d.user ? d.user.full_name : "", len: d.length || 0, status: d.status, items: (d.contents || []).slice(0, 9).map(item) };
    }).catch(function () { return null; });
  }
  function bookLookup(it) {
    if (it.src === "apple") return fetch("https://itunes.apple.com/lookup?id=" + it.id + "&country=" + it.country).then(function (r) { return r.json(); }).then(function (d) {
      var r = (d.results || [])[0]; if (!r) return null;
      return { title: r.trackName, author: r.artistName, year: String(r.releaseDate || "").slice(0, 4), pages: 0, price: r.formattedPrice || "", art: bigArt(r.artworkUrl100, "1000x1000"), apple: true };
    }).catch(function () { return null; });
    var F = "&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i,publisher&limit=1";
    var q = it.isbn ? Promise.resolve("isbn=" + it.isbn) : it.work ? Promise.resolve("q=key:/works/" + it.work)
      : fetch("https://openlibrary.org/books/" + it.edition + ".json").then(function (r) { return r.json(); }).then(function (e) { return "q=key:" + ((e.works || [])[0] || {}).key; });
    return q.then(function (s) { return fetch("https://openlibrary.org/search.json?" + s + F); }).then(function (r) { return r.json(); }).then(function (d) {
      var b = (d.docs || [])[0]; if (!b) return null;
      return { title: b.title, author: (b.author_name || [])[0] || "", year: b.first_publish_year ? String(b.first_publish_year) : "", pages: b.number_of_pages_median || 0, pub: (b.publisher || [])[0] || "", art: b.cover_i ? "https://covers.openlibrary.org/b/id/" + b.cover_i + "-L.jpg" : "" };
    }).catch(function () { return null; });
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
    var cc = (/^\/([a-z]{2})\//.exec(u.pathname) || [])[1] || "us";
    if (/^(music|itunes)\.apple\.com$/.test(u.hostname) && /\/(album|song)\//.test(u.pathname) && (m = /\/(?:id)?(\d+)\/?$/.exec(u.pathname))) {
      var song = u.searchParams.get("i") || (/\/song\//.test(u.pathname) ? m[1] : "");
      return { kind: "music", album: /\/album\//.test(u.pathname) ? m[1] : "", song: song, country: cc, url: href, host: "music.apple.com" };
    }
    if (/^books\.apple\.com$/.test(u.hostname) && (m = /\/id(\d+)/.exec(u.pathname))) return { kind: "book", src: "apple", id: m[1], country: cc, url: href, host: "books.apple.com" };
    if (host === "openlibrary.org" && (m = /^\/(works|books|isbn)\/([\w-]+)/.exec(u.pathname)))
      return { kind: "book", src: "ol", work: m[1] === "works" ? m[2] : "", edition: m[1] === "books" ? m[2] : "", isbn: m[1] === "isbn" ? m[2] : "", url: href, host: "openlibrary.org" };
    if (host === "are.na" && (m = /^\/block\/(\d+)/.exec(u.pathname))) return { kind: "arena", block: m[1], url: href, host: "are.na" };
    if (host === "are.na" && (m = /^\/([\w-]+)\/([\w-]+)\/?$/.exec(u.pathname)) && !/^(about|explore|settings|feed|notifications|search|blog|pricing|tools)$/.test(m[1]))
      return { kind: "arena", slug: m[2], url: href, host: "are.na" };
    if (/^(apps|itunes)\.apple\.com$/.test(u.hostname) && (m = /\/id(\d+)/.exec(u.pathname))) {
      var c = /^\/([a-z]{2})\//.exec(u.pathname);
      return { kind: "app", id: m[1], country: c ? c[1] : "us", url: href, host: "apps.apple.com" };
    }
    if (/(^|\.)bandcamp\.com$/.test(host) && (m = /^\/(album|track)\/([\w-]+)/.exec(u.pathname))) {
      var who = host.split(".")[0];
      return { kind: "bandcamp", artist: who === "bandcamp" ? "" : who, slug: m[2], url: href, host: host };
    }
    if (/(^|\.)wikipedia\.org$/.test(host) && (m = /^\/wiki\/(.+)$/.exec(u.pathname))) {
      var lang = (/^([a-z-]+)\.(?:m\.)?wikipedia\.org$/.exec(u.hostname) || [])[1] || "en";
      return { kind: "wiki", lang: lang, page: m[1], url: href, host: lang + ".wikipedia.org" };
    }
    if (host === "backloggd.com" && (m = /^\/games\/([^\/?#]+)/.exec(u.pathname))) return { kind: "backloggd", slug: m[1], url: "https://backloggd.com/games/" + m[1] + "/", host: "backloggd.com" };
    var own = host === SITE || u.origin === location.origin;
    return { kind: "web", url: own ? "https://" + SITE + u.pathname + u.search + u.hash : href, host: own ? SITE : host, own: own, path: own ? u.pathname + u.search : "" };
  }
  function kindName(it) { return { youtube: "YouTube", app: "App Store", music: "Apple Music", arena: "Are.na", book: "Book", bandcamp: "Bandcamp", wiki: "Wikipedia", backloggd: "Backloggd" }[it.kind] || (it.own ? "This site" : "Website"); }
  function defaultKicker(it) {
    if (it.own && /^\/curation\/[^\/]+/.test(it.path)) return "New in the curation";
    if (it.kind === "backloggd") return "My review";
    if (topic && it.kind !== "bandcamp" && it.kind !== "wiki") return "From \u201C" + topic.title + "\u201D";
    return { youtube: "Now watching", app: "Worth downloading", music: "Now playing", arena: "", book: "Reading", bandcamp: "Bandcamp \u00B7 Lossless", wiki: "Worth reading" }[it.kind] != null
      ? { youtube: "Now watching", app: "Worth downloading", music: "Now playing", arena: "", book: "Reading", bandcamp: "Bandcamp \u00B7 Lossless", wiki: "Worth reading" }[it.kind] : "Worth a look";
  }

  /* ---------- choosing a link ---------- */
  function choose(href, fromList) {
    href = clean(href);
    if (!href) { note("That doesn’t look like a link.", true); return; }
    var it = classify(href), my = ++token;
    S.item = it; S.pic = null; S.picSrc = ""; S.still = 0; S.own = null; S.app = null; S.music = null; S.arena = null; S.book = null; S.wiki = null;
    S.title = ""; S.dek = ""; S.sub = it.kind === "youtube" ? "YouTube" : it.host;
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
        var first = String(r.description || "").split(/\n/)[0].split(/(?<=[.!?])\s/)[0].trim();
        S.dek = first && first.length <= 70 ? first : (r.primaryGenreName || "");
        note((mac ? "Mac App Store" : "App Store") + " · " + (r.primaryGenreName || ""), false);
        return Promise.all([loadImg(bigArt(r.artworkUrl512 || r.artworkUrl100, mac ? "512x512" : "512x512").replace(/\.jpg$/, mac ? ".png" : ".jpg"))]
          .concat(shots.map(loadImg))).then(function (a) {
          if (my !== token) return;
          S.app.icon = a[0]; S.app.shots = a.slice(1).filter(Boolean); S.pic = a[0];
        });
      });
    } else if (it.kind === "bandcamp") {
      // Bandcamp shares nothing with other sites: a first guess from the link, the cover from you
      S.title = it.slug.replace(/-/g, " "); S.sub = it.artist;
      note("Bandcamp · paste the cover and check the title and artist", false);
      p = Promise.resolve();
    } else if (it.kind === "wiki") {
      note("Looking it up on Wikipedia…", false);
      p = fetch("https://" + it.lang + ".wikipedia.org/api/rest_v1/page/summary/" + it.page).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (my !== token) return;
        if (!d || !d.title) { note("Wikipedia doesn’t know that page.", true); return; }
        S.title = d.title.replace(/<[^>]+>/g, ""); S.sub = it.host; S.wiki = { desc: d.description || "", text: d.extract || "" };
        note("Wikipedia" + (d.description ? " · " + d.description : ""), false);
        var o = d.originalimage, t = d.thumbnail, src = o && o.width <= 2400 ? o.source : t ? t.source.replace(/\/\d+px-/, "/1200px-") : "";
        return loadImg(src).then(function (im) { if (my === token && im && !S.picSrc) S.pic = im; });
      });
    } else if (it.kind === "music") {
      note("Looking it up on Apple Music…", false);
      p = musicLookup(it).then(function (m) {
        if (my !== token) return;
        if (!m) { note("Apple Music doesn’t know that one.", true); return; }
        S.music = m; S.title = m.at >= 0 ? m.tracks[m.at].name : m.album; S.sub = m.artist;
        note("Apple Music · " + (m.at >= 0 ? "a song from " + m.album : "an album, " + m.count + " songs"), false);
        return loadImg(m.art).then(function (im) { if (my === token) S.pic = im; });
      });
    } else if (it.kind === "arena") {
      note("Looking it up on Are.na…", false);
      p = arenaLookup(it).then(function (a) {
        if (my !== token) return;
        if (!a) { note("Are.na doesn’t show that channel (is it private?).", true); return; }
        S.arena = a; S.title = a.title; S.sub = a.by;
        note("Are.na · " + (a.block ? "a block" : a.len + " blocks"), false);
        return Promise.all(a.items.map(function (b) { return b.img ? loadImg(b.img) : null; })).then(function (ims) { if (my !== token) return; ims.forEach(function (im, i) { a.items[i].im = im; }); S.pic = ims.filter(Boolean)[0] || null; });
      });
    } else if (it.kind === "book") {
      note("Looking the book up…", false);
      p = bookLookup(it).then(function (b) {
        if (my !== token) return;
        if (!b) { note("Couldn’t find that book.", true); return; }
        S.book = b; S.title = b.title; S.sub = b.author;
        note((b.apple ? "Apple Books" : "Open Library") + (b.year ? " · " + b.year : ""), false);
        return loadImg(b.art).then(function (im) { if (my === token) S.pic = im; });
      });
    } else if (it.kind === "backloggd") {
      S.bl.game = { genres: [], platforms: [] }; S.bl.cover = S.bl.shot = S.bl.hero = null; S.bl.steam = "";
      p = blLoad(it, my);
    } else if (it.own) {
      p = ownPage(it.path).then(function (o) {
        if (my !== token) return;
        S.title = String(o.title || "").replace(/\s+[—–|-]\s+builtoberemembered.*$/i, "");
        S.dek = String(o.desc || "").split(/(?<=[.!?])\s/)[0].trim();
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
    music: '<svg viewBox="0 0 16 16"><path d="M6 11.5V3.8l6.5-1.3v7.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="4.6" cy="11.6" r="1.6" fill="currentColor"/><circle cx="11.1" cy="10.1" r="1.6" fill="currentColor"/></svg>',
    home: '<i class="mk" aria-hidden="true"></i>'
  };
  function renderLinks() {
    var ol = $("links"); ol.innerHTML = "";
    links.forEach(function (l, i) {
      var li = document.createElement("li"); li.className = "lnk"; li.setAttribute("role", "option"); li.tabIndex = 0; li.dataset.i = i;
      var k = l.it.kind === "youtube" ? "yt" : l.it.kind === "app" ? "app" : l.it.kind === "music" ? "music" : l.it.own ? "home" : "web";
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
    $("picSec").hidden = !it || !(k === "youtube" || k === "web" || k === "bandcamp" || k === "wiki" || k === "backloggd");
    $("wordsSec").hidden = !it;
    $("chromeRow").hidden = k !== "web";
    $("shotsRow").hidden = k !== "app";
    $("stills").hidden = k !== "youtube";
    var has = !!(S.picSrc || (k === "web" && S.pic));
    var mine = k === "web" || k === "bandcamp" || k === "backloggd";
    $("dropImg").hidden = !(mine && S.pic);
    if (mine && S.pic) $("dropImg").src = S.picSrc || S.pic.src;
    $("dropTitle").textContent = k === "backloggd" ? (S.picSrc ? "Drop another to replace it" : "Drop a screenshot of the game") : k === "youtube" || k === "wiki" ? "Use your own picture" : has || (mine && S.pic) ? "Drop another to replace it" : k === "bandcamp" ? "Drop the album cover here" : "Drop a screenshot here";
    $("dropText").textContent = k === "backloggd" ? "for the prints and the poster — Backloggd only gives one" : k === "youtube" || k === "wiki" ? "drop one here, or press ⌘V" : k === "bandcamp" ? "or on Bandcamp right-click the cover, Copy Image, and press ⌘V here" : "or take one with ⌘⇧⌃4 and press ⌘V";
    $("rmPic").hidden = !(mine && S.pic) && !(k === "youtube" && S.own);
    $("picVal").textContent = k === "youtube" ? (S.own ? "Your own" : ["Cover", "\u00BC in", "Halfway", "\u00BE in"][S.still]) : "";
    $("titleLbl").textContent = { app: "Name", arena: "Channel", bandcamp: "Album", backloggd: "Game" }[k] || "Title";
    $("subLbl").textContent = { app: "Maker", music: "Artist", arena: "By", book: "Author", bandcamp: "Artist", backloggd: "Studio" }[k] || "Under it";
    $("kickerLbl").textContent = k === "wiki" ? "Note title" : "Line on top";
    $("tSub").placeholder = it ? it.host : "";
    $("tTitle").placeholder = k === "web" ? "Optional — the page’s name" : "";
    [].forEach.call($("chrome").children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === S.chrome); });
    var st = styleOf(), seg = $("style"); seg.innerHTML = "";
    $("styleRow").hidden = !it || STYLES[k].length < 2;
    $("kicker").closest(".field").hidden = !!NO_KICKER[st];
    if (it) STYLES[k].forEach(function (o) {
      var b = document.createElement("button"); b.type = "button"; b.dataset.v = o[0]; b.textContent = o[1]; b.setAttribute("aria-pressed", o[0] === st);
      seg.appendChild(b);
    });
    $("chromeRow").hidden = !(k === "web" && st === "safari");
    $("shotsRow").hidden = !(k === "app" && (st === "card" || st === "glass"));
    $("bgRow").hidden = $("swatches").hidden = !!OWN_BG[st];
    $("dekField").hidden = !(st === "hero" || st === "icon" || st === "editorial" || st === "note" || st === "collection" || st === "bl-label" || st === "bl-poster");
    $("lengthField").hidden = st !== "collection";
    blFields();
    $("tDek").placeholder = /^bl-/.test(st) ? "a fallen kingdom of bugs, and you in the dark of it" : st === "note" ? "A line of your own" : st === "editorial" ? "e.g. 14 songs · 2022 · Jazz" : st === "collection" ? "New in my collection." : "";
    swatches();
  }
  function fields() { $("tTitle").value = S.title; $("tSub").value = S.sub; $("kicker").value = S.kicker; $("tDek").value = S.dek; }
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

  /* ---------- the full-screen styles (each brings its own background) ---------- */
  function blurPic(x, im, dim, sat) {
    x.fillStyle = "#1c1c1e"; x.fillRect(0, 0, W, H);
    if (im) { x.save(); x.filter = "blur(90px) saturate(" + (sat || 1.4) + ")"; cover(x, im, -200, -200, W + 400, H + 400); x.restore(); }
    if (dim) { x.fillStyle = dim; x.fillRect(0, 0, W, H); }
  }
  function glassPane(x, a, b, w, h, r, tint) {
    x.save(); rr(x, a, b, w, h, r); x.fillStyle = tint || "rgba(255,255,255,0.16)"; x.fill();
    var g = x.createLinearGradient(0, b, 0, b + h); g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(0.5, "rgba(255,255,255,0.08)"); g.addColorStop(1, "rgba(255,255,255,0.25)");
    x.lineWidth = 2.5; x.strokeStyle = g; rr(x, a + 1, b + 1, w - 2, h - 2, r - 1); x.stroke(); x.restore();
  }
  function playTri(x, cx, cy, r, fill) { x.beginPath(); x.moveTo(cx - r * 0.42, cy - r * 0.62); x.lineTo(cx + r * 0.62, cy); x.lineTo(cx - r * 0.42, cy + r * 0.62); x.closePath(); x.fillStyle = fill; x.fill(); }
  function say(x, t, px, py, font, fill, align, ls) {
    x.font = font; x.fillStyle = fill; x.textAlign = align || "left"; x.textBaseline = "alphabetic";
    if ("letterSpacing" in x) x.letterSpacing = (ls || 0) + "px"; x.fillText(t, px, py); if ("letterSpacing" in x) x.letterSpacing = "0px";
  }
  function para(x, t, px, py, font, fill, align, maxW, lh, max) {   // → the last line's baseline
    x.font = font; var ls = lines(x, t, maxW, max || 2); ls.forEach(function (l, i) { say(x, l, px, py + i * lh, font, fill, align); });
    return py + Math.max(0, ls.length - 1) * lh;
  }
  function one(x, t, font, maxW) { x.font = font; return lines(x, t, maxW, 1)[0] || ""; }
  function fitSize(x, t, weight, family, max, min, maxW) { var s = max; x.font = weight + " " + s + "px " + family; while (s > min && x.measureText(t).width > maxW) { s -= 4; x.font = weight + " " + s + "px " + family; } return s; }
  function pillBtn(x, a, b, w, h, bg, label, font, fg) { rr(x, a, b, w, h, h / 2); x.fillStyle = bg; x.fill(); x.font = font; x.fillStyle = fg; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(label, a + w / 2, b + h / 2 + 1); }
  function iconAt(x, a, b, s) {
    var ap = S.app; if (!ap || !ap.icon) { rr(x, a, b, s, s, s * 0.2237); x.fillStyle = "rgba(127,127,127,0.25)"; x.fill(); return; }
    if (ap.mac) { x.drawImage(ap.icon, a, b, s, s); return; }
    x.save(); rr(x, a, b, s, s, s * 0.2237); x.clip(); x.drawImage(ap.icon, a, b, s, s); x.restore();
    rr(x, a + 0.75, b + 0.75, s - 1.5, s - 1.5, s * 0.2237); x.strokeStyle = "rgba(0,0,0,0.1)"; x.lineWidth = 1.5; x.stroke();
  }
  function shortTitle() { return String(S.title || S.item.host).split(/\s+[—–|-]\s+/)[0]; }
  function priceLabel() { var p = S.app && S.app.price; return p && !/^free$|^gratuit$|^0/i.test(p) ? p : "Get"; }
  function storeLine() { var ap = S.app || {}, p = priceLabel(); return (p === "Get" ? "Free" : p) + " on the " + (ap.mac ? "Mac App Store" : "App Store"); }
  function mss(ms) { var t = Math.round(ms / 1000); return Math.floor(t / 60) + ":" + ("0" + t % 60).slice(-2); }
  var cabinImg = null;
  function avgOf(im) { var c = document.createElement("canvas"); c.width = c.height = 8; var k = c.getContext("2d"); k.drawImage(im, 0, 0, 8, 8); var d = k.getImageData(0, 0, 8, 8).data, r = 0, g = 0, b = 0; for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } return [r / 64, g / 64, b / 64]; }
  var FULL = {
    // Bandcamp — Apple Music's editorial album page, the cover melting into its own colour; played in Cabin
    editorial: function (x) {
      var c = S.pic ? avgOf(S.pic) : [28, 28, 30], k = 0.42, bg = "rgb(" + (c[0] * k | 0) + "," + (c[1] * k | 0) + "," + (c[2] * k | 0) + ")";
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      if (S.pic) {
        x.save(); x.beginPath(); x.rect(0, 0, W, W); x.clip(); cover(x, S.pic, 0, 0, W, W); x.restore();
        var g = x.createLinearGradient(0, 620, 0, 1080); g.addColorStop(0, "rgba(" + (c[0] * k | 0) + "," + (c[1] * k | 0) + "," + (c[2] * k | 0) + ",0)"); g.addColorStop(1, bg);
        x.fillStyle = g; x.fillRect(0, 0, W, 1090);
      }
      if (S.kicker.trim()) say(x, one(x, S.kicker.trim().toUpperCase(), "700 26px " + SYS, 920), 80, 1140, "700 26px " + SYS, "rgba(255,255,255,0.6)", "left", 2);
      var t = S.title || "…", fs = fitSize(x, t, 800, SYS, 96, 52, 920);
      say(x, t, 80, 1240, "800 " + fs + "px " + SYS, "#fff", "left", -2);
      say(x, one(x, S.sub, "500 44px " + SYS, 920), 80, 1306, "500 44px " + SYS, "rgba(255,255,255,0.75)");
      if (S.dek.trim()) say(x, one(x, S.dek.trim(), "500 28px " + SYS, 920), 80, 1360, "500 28px " + SYS, "rgba(255,255,255,0.5)");
      var by = S.dek.trim() ? 1410 : 1370;
      rr(x, 80, by, 420, 92, 46); x.fillStyle = "#fff"; x.fill(); playTri(x, 150, by + 46, 20, bg);
      say(x, "Play in Cabin", 310, by + 58, "600 34px " + SYS, bg, "center");
      glassPane(x, 520, by, 200, 92, 46, "rgba(255,255,255,0.18)"); say(x, "Buy", 620, by + 58, "600 34px " + SYS, "#fff", "center");
      // the Cabin line: its icon, what it is
      var cy = by + 150;
      if (cabinImg) { x.save(); rr(x, 80, cy, 76, 76, 17); x.clip(); x.drawImage(cabinImg, 80, cy, 76, 76); x.restore(); }
      say(x, "Cabin — a Bandcamp player for the Mac", 180, cy + 34, "600 28px " + SYS, "rgba(255,255,255,0.85)");
      say(x, "Free · buildtoberemembered.com", 180, cy + 70, "400 24px " + SYS, "rgba(255,255,255,0.5)");
      return { sticker: Math.min(1700, cy + 190), sign: Math.min(1840, cy + 320), soft: "rgba(255,255,255,0.55)" };
    },
    // Bandcamp — Cabin's "New in your collection", said as a story: "Just bought" — the cover glowing in Cabin's dark window, its length, the receipt card
    collection: function (x) {
      x.fillStyle = "#0b0b0c"; x.fillRect(0, 0, W, H);
      var wa = 40, wb = 200, ww = 1000, wh = 1520;
      x.save(); rr(x, wa, wb, ww, wh, 44); x.clip(); x.fillStyle = "#19191b"; x.fillRect(wa, wb, ww, wh);
      var ca = 130, cb = 500, cs = 820;
      if (S.pic) { x.save(); x.filter = "blur(120px) saturate(1.5)"; x.globalAlpha = 0.75; cover(x, S.pic, ca - 60, cb - 40, cs + 120, cs + 120); x.restore(); }
      x.restore();
      rr(x, wa + 0.75, wb + 0.75, ww - 1.5, wh - 1.5, 44); x.strokeStyle = "rgba(255,255,255,0.1)"; x.lineWidth = 1.5; x.stroke();
      [["#ff5f57", 0], ["#febc2e", 32], ["#28c840", 64]].forEach(function (d) { x.beginPath(); x.arc(wa + 44 + d[1], wb + 44, 11, 0, Math.PI * 2); x.fillStyle = d[0]; x.fill(); });
      var head = !S.kicker.trim() || /^bandcamp\s*·\s*lossless$/i.test(S.kicker.trim()) ? "Just bought" : S.kicker.trim();
      say(x, "✦  " + one(x, head.toUpperCase(), "700 26px " + SYS, 800), W / 2, 410, "700 26px " + SYS, "rgba(255,255,255,0.75)", "center", 3);
      say(x, one(x, S.dek.trim() || "New in my collection.", "400 30px " + SYS, 860), W / 2, 456, "400 30px " + SYS, "rgba(255,255,255,0.6)", "center");
      shadowed(x, function () { rr(x, ca, cb, cs, cs, 36); x.fillStyle = "#000"; x.fill(); }, 2);
      x.save(); rr(x, ca, cb, cs, cs, 36); x.clip(); x.fillStyle = "#2a2a2c"; x.fillRect(ca, cb, cs, cs); if (S.pic) cover(x, S.pic, ca, cb, cs, cs);
      // its length, set over the cover's top right as on the sleeve
      var len = String(S.length || "").trim();
      if (len) {
        x.save(); x.shadowColor = "rgba(0,0,0,0.5)"; x.shadowBlur = 8;
        say(x, "LENGTH " + len, ca + cs - 36, cb + 70, "600 22px " + SYS, "rgba(255,255,255,0.85)", "right", 2);
        x.restore();
      }
      x.restore();
      // the receipt card
      var ka = ca + 24, kb = cb + cs - 300, kw = 600, kh = 276;
      shadowed(x, function () { rr(x, ka, kb, kw, kh, 26); x.fillStyle = "rgba(245,245,247,0.94)"; x.fill(); }, 0.8);
      rr(x, ka, kb, kw, kh, 26); x.fillStyle = "rgba(245,245,247,0.94)"; x.fill();
      say(x, one(x, S.title || "…", "700 40px " + SYS, kw - 60), ka + 30, kb + 60, "700 40px " + SYS, "#1d1d1f");
      say(x, one(x, S.sub, "400 26px " + SYS, kw - 60), ka + 30, kb + 98, "400 26px " + SYS, "#6e6e73");
      para(x, "Bought straight from " + (S.sub || "the artist") + " — no middle layer.", ka + 30, kb + 142, "400 22px " + SYS, "#3a3a3c", "left", kw - 60, 30, 2);
      rr(x, ka + 30, kb + 192, 270, 40, 20); x.fillStyle = "rgba(0,0,0,0.07)"; x.fill(); x.strokeStyle = "rgba(0,0,0,0.12)"; x.lineWidth = 1.5; x.stroke();
      x.beginPath(); x.arc(ka + 52, kb + 212, 9, 0, Math.PI * 2); x.fillStyle = "#3a3a3c"; x.fill();
      say(x, "Bought on Bandcamp", ka + 72, kb + 220, "600 21px " + SYS, "#1d1d1f");
      say(x, "▪ Cabin record ▪", ka + 30, kb + 258, "500 19px " + SYS, "#8e8e93");
      say(x, new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), ka + kw - 30, kb + 258, "500 19px " + SYS, "#8e8e93", "right");
      // First Listen · Share
      var by = cb + cs + 50;
      rr(x, W / 2 - 300, by, 330, 84, 42); x.fillStyle = "#fff"; x.fill(); playTri(x, W / 2 - 248, by + 42, 18, "#000"); say(x, "First Listen", W / 2 - 120, by + 53, "700 32px " + SYS, "#000", "center");
      glassPane(x, W / 2 + 46, by, 230, 84, 42, "rgba(255,255,255,0.14)");
      x.strokeStyle = "#fff"; x.lineWidth = 3.5; x.lineJoin = "round"; x.lineCap = "round";
      x.beginPath(); x.moveTo(W / 2 + 92, by + 36); x.lineTo(W / 2 + 84, by + 36); x.lineTo(W / 2 + 84, by + 62); x.lineTo(W / 2 + 114, by + 62); x.lineTo(W / 2 + 114, by + 36); x.lineTo(W / 2 + 106, by + 36); x.moveTo(W / 2 + 99, by + 48); x.lineTo(W / 2 + 99, by + 22); x.moveTo(W / 2 + 91, by + 30); x.lineTo(W / 2 + 99, by + 22); x.lineTo(W / 2 + 107, by + 30); x.stroke();
      say(x, "Share", W / 2 + 180, by + 53, "700 32px " + SYS, "#fff", "center");
      // whose window this is
      var cy = by + 140;
      if (cabinImg) { x.save(); rr(x, W / 2 - 230, cy, 56, 56, 13); x.clip(); x.drawImage(cabinImg, W / 2 - 230, cy, 56, 56); x.restore(); }
      say(x, "Cabin — a Bandcamp player for the Mac", W / 2 - 160, cy + 37, "500 25px " + SYS, "rgba(255,255,255,0.6)");
      return { sticker: 1630, sign: 1800, soft: "rgba(255,255,255,0.5)" };
    },
    // Wikipedia — an Apple Notes page: the date, a title, a line of yours, the article as its link card
    note: function (x) {
      x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
      say(x, "‹ Notes", 50, 290, "400 36px " + SYS, "#e5a00d");
      var d = new Date(), when = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) + " at " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      say(x, when, W / 2, 380, "400 26px " + SYS, "#8e8e93", "center");
      var nt = S.kicker.trim() || S.title, fs = fitSize(x, nt, 700, SYS, 64, 40, 940);
      say(x, nt, 70, 480, "700 " + fs + "px " + SYS, "#000");
      var y = 480; if (S.dek.trim()) y = para(x, S.dek.trim(), 70, 550, "400 36px " + SYS, "#3a3a3c", "left", 940, 48, 2);
      var a = 70, b = y + 90, w = 940, ih = S.pic ? Math.min(560, Math.max(360, w * S.pic.naturalHeight / S.pic.naturalWidth)) : 0, ch = ih + 160;
      shadowed(x, function () { rr(x, a, b, w, ch, 30); x.fillStyle = "#f2f2f7"; x.fill(); }, 0.35);
      x.save(); rr(x, a, b, w, ch, 30); x.clip(); x.fillStyle = "#f2f2f7"; x.fillRect(a, b, w, ch); if (S.pic) { x.beginPath(); x.rect(a, b, w, ih); x.clip(); cover(x, S.pic, a, b, w, ih); } x.restore();
      say(x, one(x, S.title, "600 34px " + SYS, w - 64), a + 32, b + ih + 66, "600 34px " + SYS, "#1d1d1f");
      say(x, one(x, S.sub || S.item.host, "400 26px " + SYS, w - 64), a + 32, b + ih + 116, "400 26px " + SYS, "#8e8e93");
      var end = b + ch;
      return { sticker: Math.min(1700, end + 150), sign: Math.min(1840, end + 300), soft: "#8e8e93" };
    },
    // M1 — Apple Music's Now Playing: the cover big over its own colours, the scrubber, the controls
    playing: function (x) {
      var m = S.music || { tracks: [], at: -1 };
      blurPic(x, S.pic, "rgba(0,0,0,0.28)", 1.5);
      if (S.kicker.trim()) say(x, one(x, S.kicker.trim(), "600 36px " + SYS, 900), W / 2, 290, "600 36px " + SYS, "rgba(255,255,255,0.75)", "center");
      var s = 800, a = (W - s) / 2, b = 340;
      shadowed(x, function () { rr(x, a, b, s, s, 30); x.fillStyle = "#000"; x.fill(); }, 2);
      x.save(); rr(x, a, b, s, s, 30); x.clip(); x.fillStyle = "#333"; x.fillRect(a, b, s, s); if (S.pic) cover(x, S.pic, a, b, s, s); x.restore();
      say(x, one(x, S.title || "…", "700 54px " + SYS, s), a, 1240, "700 54px " + SYS, "#fff");
      say(x, one(x, S.sub, "400 44px " + SYS, s), a, 1298, "400 44px " + SYS, "rgba(255,255,255,0.6)");
      var t = m.tracks[m.at >= 0 ? m.at : 0], dur = t ? t.ms : 0, el = dur * 0.3;
      rr(x, a, 1346, s, 10, 5); x.fillStyle = "rgba(255,255,255,0.25)"; x.fill(); rr(x, a, 1346, s * 0.3, 10, 5); x.fillStyle = "rgba(255,255,255,0.9)"; x.fill();
      if (dur) { say(x, mss(el), a, 1396, "600 24px " + SYS, "rgba(255,255,255,0.5)"); say(x, "−" + mss(dur - el), a + s, 1396, "600 24px " + SYS, "rgba(255,255,255,0.5)", "right"); }
      var cy = 1490; x.fillStyle = "#fff";
      x.fillRect(W / 2 - 34, cy - 38, 22, 76); x.fillRect(W / 2 + 12, cy - 38, 22, 76);   // pause
      [-1, 1].forEach(function (d) {                                                      // ⏮ ⏭
        var cx = W / 2 + d * 220;
        [0, 1].forEach(function (k) { var o = cx + d * (k ? 2 : -38); x.beginPath(); x.moveTo(o, cy - 26); x.lineTo(o + d * 36, cy); x.lineTo(o, cy + 26); x.closePath(); x.fill(); });
      });
      return { sticker: 1630, sign: 1770, soft: "rgba(255,255,255,0.6)" };
    },
    // M2 — the album's page in the Music app
    album: function (x) {
      var m = S.music || { tracks: [], at: -1, genre: "", year: "", count: 0 };
      x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
      if (S.kicker.trim()) say(x, one(x, S.kicker.trim().toUpperCase(), "600 26px " + SYS, 900), W / 2, 272, "600 26px " + SYS, "#8e8e93", "center", 2);
      var s = 520, a = (W - s) / 2, b = 310;
      shadowed(x, function () { rr(x, a, b, s, s, 24); x.fillStyle = "#000"; x.fill(); }, 1.2);
      x.save(); rr(x, a, b, s, s, 24); x.clip(); x.fillStyle = "#eee"; x.fillRect(a, b, s, s); if (S.pic) cover(x, S.pic, a, b, s, s); x.restore();
      var al = m.album || S.title;
      say(x, one(x, al, "700 52px " + SYS, 900), W / 2, 920, "700 52px " + SYS, "#000", "center");
      say(x, one(x, S.sub, "500 46px " + SYS, 900), W / 2, 976, "500 46px " + SYS, "#fa2d48", "center");
      say(x, [m.genre, m.year, m.count ? m.count + " songs" : ""].filter(Boolean).join(" · ").toUpperCase(), W / 2, 1024, "600 24px " + SYS, "#8e8e93", "center", 1);
      [[110, "Play"], [560, "Shuffle"]].forEach(function (p, i) {
        rr(x, p[0], 1066, 410, 90, 18); x.fillStyle = "#f2f2f7"; x.fill();
        if (!i) playTri(x, p[0] + 150, 1111, 22, "#fa2d48");
        say(x, p[1], p[0] + (i ? 205 : 230), 1123, "600 34px " + SYS, "#fa2d48", "center");
      });
      var rows = m.tracks.slice(0), start = m.at > 2 ? m.at - 1 : 0;
      rows.slice(start, start + 4).forEach(function (t, i) {
        var y = 1236 + i * 92, on = start + i === m.at;
        say(x, String(t.n || start + i + 1), 120, y, (on ? "600" : "400") + " 32px " + SYS, on ? "#fa2d48" : "#8e8e93");
        say(x, one(x, t.name, (on ? "600" : "400") + " 34px " + SYS, 760), 180, y, (on ? "600" : "400") + " 34px " + SYS, "#000");
        x.fillStyle = "rgba(0,0,0,0.08)"; x.fillRect(180, y + 32, 790, 1.5);
      });
      return { sticker: 1640, sign: 1780, soft: "#8e8e93" };
    },
    // R1 — an Are.na channel: who, what, how many, and a grid of its blocks
    grid: function (x) {
      var A = S.arena || { items: [], len: 0 };
      x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
      if (S.sub) say(x, one(x, S.sub + " /", "400 34px Arial, Helvetica, sans-serif", 940), 70, 300, "400 34px Arial, Helvetica, sans-serif", "#999");
      var fs = fitSize(x, S.title || "Are.na", 700, "Arial, Helvetica, sans-serif", 54, 34, 940);
      say(x, S.title || "Are.na", 70, 362, "700 " + fs + "px Arial, Helvetica, sans-serif", "#000");
      say(x, A.block ? "Block" : A.len + " blocks" + (A.status === "closed" ? " · Closed channel" : A.status === "public" ? " · Open channel" : ""), 70, 410, "400 28px Arial, Helvetica, sans-serif", "#999");
      function block(it, a, b, s, small) {
        x.strokeStyle = "#e6e6e6"; x.lineWidth = 2; x.strokeRect(a, b, s, s);
        if (it.im) cover(x, it.im, a + 1, b + 1, s - 2, s - 2);
        else { x.font = "400 " + (small ? 24 : 40) + "px Arial, Helvetica, sans-serif"; var ls = lines(x, it.text || it.title, s - (small ? 44 : 100), small ? 7 : 12); x.fillStyle = "#333"; x.textAlign = "left"; x.textBaseline = "alphabetic"; ls.forEach(function (l, i) { x.fillText(l, a + (small ? 22 : 50), b + (small ? 48 : 90) + i * (small ? 32 : 54)); }); }
        if (small && it.title) say(x, one(x, it.title, "400 22px Arial, Helvetica, sans-serif", s), a + s / 2, b + s + 34, "400 22px Arial, Helvetica, sans-serif", "#999", "center");
      }
      if (A.block) { block(A.items[0] || {}, 110, 470, 860, false); return { sticker: 1520, sign: 1680, soft: "#999" }; }
      var s = 290, gap = 35;
      A.items.slice(0, 9).forEach(function (it, i) { block(it, 70 + (i % 3) * (s + gap), 460 + ((i / 3) | 0) * (s + 70), s, true); });
      return { sticker: 1600, sign: 1760, soft: "#999" };
    },
    // L1 — Apple Books: the cover with its soft shadow, title, author, Get and Sample
    books: function (x) {
      var B = S.book || {};
      x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
      var r = S.pic ? S.pic.naturalHeight / S.pic.naturalWidth : 1.5, h = Math.min(820, 520 * r), w = h / r, a = (W - w) / 2, b = 280;
      shadowed(x, function () { rr(x, a, b, w, h, 8); x.fillStyle = "#000"; x.fill(); }, 1.6);
      x.save(); rr(x, a, b, w, h, 8); x.clip(); x.fillStyle = "#eee"; x.fillRect(a, b, w, h); if (S.pic) cover(x, S.pic, a, b, w, h); x.restore();
      var y = para(x, S.title || "…", W / 2, b + h + 110, "700 56px " + SYS, "#000", "center", 900, 66, 2);
      say(x, one(x, S.sub, "400 40px " + SYS, 900), W / 2, y + 58, "400 40px " + SYS, "#8e8e93", "center");
      say(x, ["Book", B.pages ? B.pages + " pages" : "", B.year].filter(Boolean).join(" · ").toUpperCase(), W / 2, y + 112, "600 24px " + SYS, "#8e8e93", "center", 1);
      var py = y + 160;
      if (B.apple) {
        var p = B.price && !/^free$|^0/i.test(B.price) ? B.price : "Get";
        pillBtn(x, 150, py, 370, 86, "#0071e3", p, "600 34px " + SYS, "#fff"); pillBtn(x, 560, py, 370, 86, "#f2f2f7", "Sample", "600 34px " + SYS, "#0071e3");
      } else if (B.pub) say(x, one(x, B.pub, "400 30px " + SYS, 900), W / 2, py + 40, "400 30px " + SYS, "#8e8e93", "center");
      var st = Math.min(1720, Math.max(1600, py + 220));
      return { sticker: st, sign: Math.min(1850, st + 140), soft: "#8e8e93" };
    },
    // Y1 — Apple TV: the still runs into black, a big title, ▶ Play
    tv: function (x) {
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      if (S.pic) cover(x, S.pic, -280, 0, 1640, 922);
      var g = x.createLinearGradient(0, 520, 0, 1000); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "#000"); x.fillStyle = g; x.fillRect(0, 0, W, 1000);
      if (S.kicker.trim()) say(x, S.kicker.trim().toUpperCase(), 80, 1010, "600 26px " + SYS, "rgba(255,255,255,0.55)", "left", 3);
      var y = para(x, S.title || "YouTube", 80, 1090, "700 64px " + SYS, "#fff", "left", 920, 74, 3);
      if (S.sub.trim()) say(x, one(x, S.sub.trim(), "500 30px " + SYS, 920), 80, y + 64, "500 30px " + SYS, "rgba(255,255,255,0.6)");
      var by = y + 112;
      rr(x, 80, by, 300, 92, 20); x.fillStyle = "#fff"; x.fill(); playTri(x, 146, by + 46, 22, "#000"); say(x, "Play", 248, by + 58, "600 36px " + SYS, "#000", "center");
      rr(x, 400, by, 92, 92, 46); x.fillStyle = "rgba(255,255,255,0.18)"; x.fill();
      x.fillStyle = "#fff"; x.fillRect(446 - 16, by + 44, 32, 4); x.fillRect(444, by + 30, 4, 32);
      var st = Math.min(1680, Math.max(1560, by + 240));
      return { sticker: st, sign: Math.min(1810, st + 150), soft: "rgba(255,255,255,0.5)" };
    },
    // Y2 — QuickTime with a Liquid Glass control bar, on the still blurred
    quicktime: function (x) {
      blurPic(x, S.pic, "rgba(0,0,0,0.25)");
      var a = 50, b = 560, w = 980, h = 551;
      shadowed(x, function () { rr(x, a, b, w, h, 30); x.fillStyle = "#000"; x.fill(); }, 1.8);
      x.save(); rr(x, a, b, w, h, 30); x.clip(); x.fillStyle = "#000"; x.fillRect(a, b, w, h); if (S.pic) cover(x, S.pic, a, b, w, h);
      var g = x.createLinearGradient(0, b, 0, b + 140); g.addColorStop(0, "rgba(0,0,0,0.45)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(a, b, w, 140); x.restore();
      [["#ff5f57", 0], ["#febc2e", 32], ["#28c840", 64]].forEach(function (d) { x.beginPath(); x.arc(a + 40 + d[1], b + 40, 11, 0, Math.PI * 2); x.fillStyle = d[0]; x.fill(); });
      x.font = "600 26px " + SYS; say(x, lines(x, S.title || "youtube.com", 560, 1)[0], a + w / 2, b + 50, "600 26px " + SYS, "rgba(255,255,255,0.9)", "center");
      glassPane(x, a + 150, b + h - 150, w - 300, 110, 32, "rgba(40,40,40,0.45)"); playTri(x, a + 230, b + h - 95, 24, "#fff");
      rr(x, a + 290, b + h - 99, 500, 8, 4); x.fillStyle = "rgba(255,255,255,0.3)"; x.fill(); rr(x, a + 290, b + h - 99, 150, 8, 4); x.fillStyle = "#fff"; x.fill();
      if (S.kicker.trim()) say(x, one(x, S.kicker.trim(), "500 40px " + SANS, W - 200), W / 2, 440, "500 40px " + SANS, "rgba(255,255,255,0.75)", "center");
      var y = para(x, S.title, W / 2, 1250, "700 48px " + SYS, "#fff", "center", 900, 58, 2);
      if (S.sub.trim()) say(x, one(x, S.sub.trim(), "400 32px " + SYS, 900), W / 2, (S.title ? y : 1190) + 56, "400 32px " + SYS, "rgba(255,255,255,0.65)", "center");
      return { sticker: 1560, sign: 1720, soft: "rgba(255,255,255,0.55)" };
    },
    // Y4 — Keynote stage: black, the still glowing, a floor reflection, one white line
    keynote: function (x) {
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      var a = 70, b = 640, w = 940, h = 529;
      if (S.pic) {
        x.save(); x.filter = "blur(100px)"; x.globalAlpha = 0.65; cover(x, S.pic, a, b, w, h); x.restore();
        x.save(); rr(x, a, b, w, h, 28); x.clip(); cover(x, S.pic, a, b, w, h); x.restore();
        x.save(); x.beginPath(); x.rect(0, b + h + 14, W, 260); x.clip(); x.translate(0, 2 * (b + h) + 16); x.scale(1, -1); x.globalAlpha = 0.22;
        rr(x, a, b, w, h, 28); x.clip(); cover(x, S.pic, a, b, w, h); x.restore();
        var g = x.createLinearGradient(0, b + h + 10, 0, b + h + 280); g.addColorStop(0, "rgba(0,0,0,0.35)"); g.addColorStop(1, "#000"); x.fillStyle = g; x.fillRect(0, b + h + 8, W, 290);
      }
      var k = S.kicker.trim() || "Now watching.";
      var fs = fitSize(x, k, 700, SYS, 72, 44, W - 160); say(x, k, W / 2, 420, "700 " + fs + "px " + SYS, "#f5f5f7", "center", -1);
      para(x, S.title, W / 2, 482, "500 34px " + SYS, "#86868b", "center", 860, 44, 2);
      if (S.sub.trim()) say(x, one(x, S.sub.trim(), "500 30px " + SYS, 900), W / 2, 1500, "500 30px " + SYS, "#86868b", "center");
      return { sticker: 1630, sign: 1790, soft: "#6e6e73" };
    },
    // W3 — the page on an iPad
    ipad: function (x) {
      var bg = S.bg === "blur" ? "#e3e5e8" : S.bg, dark = toneDark(bg);
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      var ink = dark ? "#f5f5f7" : "#1d1d1f", soft = dark ? "rgba(245,245,247,0.64)" : "#6e6e73";
      var t = shortTitle(), fs = fitSize(x, t, 700, SYS, 60, 40, W - 160);
      say(x, t, W / 2, 262, "700 " + fs + "px " + SYS, ink, "center"); say(x, one(x, S.sub.trim() || S.item.host, "400 30px " + SYS, 900), W / 2, 312, "400 30px " + SYS, soft, "center");
      var a = 110, b = 370, w = 860, h = 1180;
      shadowed(x, function () { rr(x, a, b, w, h, 64); x.fillStyle = "#1c1c1e"; x.fill(); }, 1.2);
      rr(x, a, b, w, h, 64); x.fillStyle = "#1c1c1e"; x.fill();
      x.save(); rr(x, a + 26, b + 26, w - 52, h - 52, 42); x.clip();
      x.fillStyle = "#fff"; x.fillRect(a + 26, b + 26, w - 52, h - 52);
      x.fillStyle = "#f6f6f6"; x.fillRect(a + 26, b + 26, w - 52, 72); x.fillStyle = "rgba(0,0,0,0.1)"; x.fillRect(a + 26, b + 97, w - 52, 1.5);
      rr(x, a + w / 2 - 190, b + 41, 380, 42, 12); x.fillStyle = "#e8e8ea"; x.fill();
      say(x, one(x, S.item.host, "500 21px " + SYS, 340), a + w / 2, b + 70, "500 21px " + SYS, "#3a3a3c", "center");
      if (S.pic) { var pw = w - 52, ph = pw * S.pic.naturalHeight / S.pic.naturalWidth; x.drawImage(S.pic, a + 26, b + 98, pw, ph); }
      else say(x, one(x, S.item.host, "700 54px " + SYS, w - 160), a + w / 2, b + h / 2, "700 54px " + SYS, "#1d1d1f", "center");
      x.restore();
      return { sticker: 1650, sign: 1800, soft: soft };
    },
    // W5 — an apple.com-style opener: a huge name, one line, blue links, the picture
    hero: function (x) {
      x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
      if (S.kicker.trim()) say(x, one(x, S.kicker.trim(), "600 34px " + SYS, 900), W / 2, 330, "600 34px " + SYS, "#bf4800", "center");
      var t = shortTitle(), fs = fitSize(x, t, 700, SYS, 150, 70, W - 120);
      say(x, t, W / 2, 470, "700 " + fs + "px " + SYS, "#1d1d1f", "center", -3);
      var y = 560; if (S.dek.trim()) y = para(x, S.dek.trim(), W / 2, 560, "600 50px " + SYS, "#1d1d1f", "center", 900, 62, 2) + 0;
      var ly = (S.dek.trim() ? y : 500) + 100, app = S.item.own && /^\/apps\//.test(S.item.path);
      if (app) { say(x, "Visit ›", W / 2 - 150, ly, "400 38px " + SYS, "#0066cc", "center"); say(x, "Download ›", W / 2 + 120, ly, "400 38px " + SYS, "#0066cc", "center"); }
      else say(x, "Visit " + S.item.host + " ›", W / 2, ly, "400 38px " + SYS, "#0066cc", "center");
      var pb = ly + 90, ph = Math.min(620, 1470 - pb);
      shadowed(x, function () { rr(x, 60, pb, 960, ph, 30); x.fillStyle = "#fff"; x.fill(); }, 0.6);
      x.save(); rr(x, 60, pb, 960, ph, 30); x.clip(); x.fillStyle = "#f5f5f7"; x.fillRect(60, pb, 960, ph);
      if (S.pic) { var r = S.pic.naturalHeight / S.pic.naturalWidth; if (r > ph / 960) x.drawImage(S.pic, 60, pb, 960, 960 * r); else cover(x, S.pic, 60, pb, 960, ph); }
      x.restore();
      return { sticker: Math.min(1700, pb + ph + 120), sign: Math.min(1830, pb + ph + 270), soft: "#86868b" };
    },
    // A2 — the icon big on white, the name, a line, Get
    icon: function (x) {
      x.fillStyle = "#fbfbfd"; x.fillRect(0, 0, W, H);
      if (S.kicker.trim()) say(x, one(x, S.kicker.trim(), "500 40px " + SANS, 900), W / 2, 400, "500 40px " + SANS, "#6e6e73", "center");
      x.save(); x.filter = "blur(30px)"; x.fillStyle = "rgba(0,0,0,0.18)"; x.beginPath(); x.ellipse(W / 2, 1080, 250, 40, 0, 0, Math.PI * 2); x.fill(); x.restore();
      if (!(S.app && S.app.mac)) shadowed(x, function () { rr(x, W / 2 - 230, 560, 460, 460, 103); x.fillStyle = "#fff"; x.fill(); }, 0.9);
      iconAt(x, W / 2 - 230, 560, 460);
      var t = S.title || "…", fs = fitSize(x, t, 700, SYS, 76, 48, W - 120);
      say(x, t, W / 2, 1250, "700 " + fs + "px " + SYS, "#1d1d1f", "center", -1);
      if (S.dek.trim()) say(x, one(x, S.dek.trim(), "500 40px " + SYS, W - 140), W / 2, 1320, "500 40px " + SYS, "#6e6e73", "center");
      var p = priceLabel(); x.font = "600 34px " + SYS; var pw = Math.max(220, x.measureText(p).width + 90);
      pillBtn(x, W / 2 - pw / 2, 1390, pw, 80, "#0071e3", p, "600 34px " + SYS, "#fff");
      say(x, storeLine(), W / 2, 1530, "400 28px " + SYS, "#86868b", "center");
      return { sticker: 1650, sign: 1800, soft: "#86868b" };
    },
    // A4 — one Liquid Glass card over the icon's colours
    glass: function (x) {
      var ap = S.app || {}; blurPic(x, ap.icon, "rgba(0,0,0,0.2)", 1.6);
      if (S.kicker.trim()) say(x, one(x, S.kicker.trim(), "500 40px " + SANS, 900), W / 2, 320, "500 40px " + SANS, "rgba(255,255,255,0.8)", "center");
      var shots = S.shots && ap.shots ? ap.shots : [], land = shots.length && shots[0].naturalWidth > shots[0].naturalHeight;
      if (land) shots = shots.slice(0, 1);
      var a = 60, b = 390, w = 960, sh = shots.length ? (land ? Math.min(560, 860 * shots[0].naturalHeight / shots[0].naturalWidth) : 820) : 0;
      var h = 290 + (sh ? sh + 50 : 0);
      glassPane(x, a, b, w, h, 64, "rgba(255,255,255,0.2)");
      iconAt(x, a + 50, b + 50, 170);
      x.font = "700 46px " + SYS; say(x, lines(x, S.title || "…", w - 330, 1)[0], a + 250, b + 110, "700 46px " + SYS, "#fff");
      x.font = "400 30px " + SYS; say(x, lines(x, [S.sub, ap.genre].filter(Boolean).join(" · "), w - 330, 1)[0] || "", a + 250, b + 158, "400 30px " + SYS, "rgba(255,255,255,0.75)");
      var p = priceLabel(); x.font = "700 28px " + SYS; pillBtn(x, a + 250, b + 180, Math.max(140, x.measureText(p).width + 60), 56, "rgba(255,255,255,0.9)", p, "700 28px " + SYS, "#0071e3");
      if (ap.rating && ap.count >= 5) say(x, ap.rating.toFixed(1) + " ★  ·  " + short(ap.count) + " ratings", a + w - 50, b + 218, "600 28px " + SYS, "#fff", "right");
      shots.forEach(function (im, i) {
        var sw = land ? w - 100 : 270, sx = a + 50 + i * (sw + 25), sy = b + 290;
        x.save(); rr(x, sx, sy, sw, sh, land ? 24 : 34); x.clip(); cover(x, im, sx, sy, sw, sh, true); x.restore();
      });
      var end = b + h;
      return { sticker: Math.min(1690, end + 120), sign: Math.min(1820, end + 270), soft: "rgba(255,255,255,0.75)" };
    }
  };
  /* ---------- Backloggd: a game, or your review of it ----------
     A game page answers cross-origin requests, so it's read straight from here: title, studio, year,
     a line from the description, genres, platforms, the average, plays, time to finish, the cover and
     the page's one picture. Reviews sit behind a bot check — those words, stars and hours are yours to type. */
  function blParse(html) {
    var d = new DOMParser().parseFromString(html, "text/html");
    var q1 = function (s) { return d.querySelector(s); }, all = function (s) { return [].slice.call(d.querySelectorAll(s)); };
    var txt = function (e) { return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; };
    var abs = function (u) { return !u ? "" : u.indexOf("//") === 0 ? "https:" + u : u; };
    var uniq = function (a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); };
    var g = {};
    g.title = (q1("#game-page-meta") && q1("#game-page-meta").getAttribute("data-name")) || txt(q1("h1"));
    if (!g.title) return null;
    g.dev = txt(q1('a[href^="/company/"]'));
    g.year = txt(q1("a.game-year")) || ((q1('meta[property="og:title"]') || {}).content || "").replace(/^.*\((\d{4})\).*$/, "$1");
    g.desc = ((q1('meta[name="description"]') || {}).content || "").trim();
    g.genres = uniq(all('a.game-details-value[href*="genre:"]').map(txt));
    g.platforms = uniq(all("a.game-page-platform").map(txt));
    g.avg = txt(q1("#game-rating h1") || q1(".game-rating h1"));
    all("a.d-flex").forEach(function (a) { if (/^plays$/i.test(txt(a.querySelector(".log-counter-label")))) g.plays = txt(a.querySelector(".log-counter-stat")); });
    all("p.label").forEach(function (p) {
      var row = p.closest(".row"), v = (p.parentNode && p.parentNode.querySelector(".stat-value.element-revealed")) || (row && row.querySelector(".stat-value.element-revealed"));
      var h = txt(v).replace(/h$/, "").trim(), lab = txt(p).toLowerCase();
      if (lab === "to finish" && !g.finishH) g.finishH = h;
    });
    var cv = all("img").map(function (i) { return i.getAttribute("src") || i.getAttribute("data-src") || ""; }).filter(function (s) { return /t_cover_big/.test(s); })[0] || "";
    g.cover = abs(cv.replace(/t_cover_big(_2x)?/, "t_cover_big_2x"));
    var bg = q1("#game-cover-art img"); g.shot = abs(bg && (bg.getAttribute("data-src") || bg.getAttribute("src")) || "");
    return g;
  }
  function blLine(desc) {
    var s = String(desc || "").replace(/\s+/g, " ").trim(); if (!s) return "";
    var cut = s.split(/(?<=[.!?])\s/)[0], m = /^(.{25,90}?)(,| in which | where | that | with an? )/i.exec(cut); if (m) cut = m[1];
    if (cut.length > 100) cut = cut.slice(0, 97).replace(/\s+\S*$/, "") + "…";
    return cut.replace(/[.]$/, "").replace(/^(A|An|The) /, function (w) { return w.toLowerCase(); });
  }
  function blPlatforms(list) {
    var map = [[/windows|pc/i, "PC"], [/mac/i, "Mac"], [/linux/i, "Linux"], [/switch/i, "Switch"], [/playstation|ps\d/i, "PlayStation"], [/xbox/i, "Xbox"], [/ios|iphone|ipad/i, "iPhone"], [/android/i, "Android"]], out = [];
    (list || []).forEach(function (p) { for (var i = 0; i < map.length; i++) if (map[i][0].test(p)) { if (out.indexOf(map[i][1]) < 0) out.push(map[i][1]); return; } if (out.indexOf(p) < 0) out.push(p); });
    return out;
  }
  function blHand(s) { return String(s || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-"); }
  // a picture into a box, cropped, aimed at (px, py) in 0–1
  function blFit(x, im, a, b, w, h, px, py) {
    if (!im) { x.fillStyle = "#cfcdd0"; x.fillRect(a, b, w, h); return; }
    var s = Math.max(w / im.naturalWidth, h / im.naturalHeight), sw = w / s, sh = h / s;
    x.drawImage(im, (im.naturalWidth - sw) * (px == null ? 0.5 : px), (im.naturalHeight - sh) * (py == null ? 0.5 : py), sw, sh, a, b, w, h);
  }
  function blWrap(x, text, maxW) {
    var out = [];
    String(text || "").split("\n").forEach(function (p) { var line = ""; p.split(/\s+/).forEach(function (w) { if (!w) return; var t = line ? line + " " + w : w; if (line && x.measureText(t).width > maxW) { out.push(line); line = w; } else line = t; }); out.push(line); });
    return out;
  }
  function blStar(x, cx, cy, r) { x.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; x[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); } x.closePath(); }
  function blStars(x, rating, a, b, size, on, off) {
    var r = size / 2, gap = size * 0.16;
    for (var i = 0; i < 5; i++) {
      var cx = a + r + i * (size + gap), cy = b + r, f = Math.max(0, Math.min(1, rating - i));
      x.fillStyle = off; blStar(x, cx, cy, r); x.fill();
      if (f > 0) { x.save(); x.beginPath(); x.rect(cx - r, cy - r, size * f, size); x.clip(); x.fillStyle = on; blStar(x, cx, cy, r); x.fill(); x.restore(); }
    }
  }
  function blPaper(x, a, b, w, h) {
    x.save(); x.shadowColor = "rgba(40,30,40,0.18)"; x.shadowBlur = 70; x.shadowOffsetY = 34; x.fillStyle = "#fff"; x.fillRect(a, b, w, h); x.restore();
    x.save(); x.shadowColor = "rgba(40,30,40,0.06)"; x.shadowBlur = 6; x.shadowOffsetY = 2; x.fillStyle = "#fff"; x.fillRect(a, b, w, h); x.restore();
  }
  // a polaroid: the picture, a note in Isaac's hand, a strip of tape → its height
  function blPrint(x, im, a, b, w, ar, rot, note, ns, px, py) {
    var pad = Math.round(w * 0.048), iw = w - 2 * pad, ih = Math.round(iw / ar), nh = Math.round((ns || 52) * 1.9), h = pad + ih + nh;
    x.save(); x.translate(a + w / 2, b + h / 2); x.rotate(rot * Math.PI / 180); x.translate(-w / 2, -h / 2);
    x.save(); x.shadowColor = "rgba(0,0,0,0.3)"; x.shadowBlur = 60; x.shadowOffsetY = 30; x.fillStyle = "#fdfcf9"; x.fillRect(0, 0, w, h); x.restore();
    blFit(x, im, pad, pad, iw, ih, px, py);
    if (note) { x.font = "400 " + (ns || 52) + 'px "My Hand", "Bradley Hand", cursive'; x.fillStyle = "#1f1d20"; x.textAlign = "left"; x.textBaseline = "alphabetic"; var t = blHand(note); while (x.measureText(t).width > iw && t.length > 3) t = t.slice(0, -2); x.fillText(t, pad + 6, pad + ih + nh * 0.62); }
    x.save(); x.translate(w / 2, 0); x.rotate(-0.035); x.fillStyle = "rgba(235,228,205,0.86)"; var tw = Math.min(180, w * 0.4); x.fillRect(-tw / 2, -24, tw, 48); x.restore();
    x.restore();
    return h;
  }
  function blMeta() {
    var g = S.bl.game, out = [];
    if (g.avg) out.push(g.avg + " ★ on Backloggd"); if (g.plays) out.push(g.plays + " played"); if (g.finishH) out.push("~" + g.finishH + " h to finish");
    return out;
  }
  function blCover() { return S.bl.cover; }
  function blShot() { return S.pic || S.bl.shot || S.bl.cover; }
  var HAND = '"My Hand", "Bradley Hand", cursive';
  var BL = {
    // the cover hung in a museum frame, the white label under it
    "bl-label": function (x) {
      var g = S.bl.game;
      x.fillStyle = "#e6e4e6"; x.fillRect(0, 0, W, H);
      var fw = 600, fx = (W - fw) / 2, fy = 250, inner = fw - 52 - 120, ih = Math.round(inner * 4 / 3), fh = 52 + 120 + ih;
      x.save(); x.translate(fx + fw / 2, fy + fh / 2); x.rotate(-0.6 * Math.PI / 180); x.translate(-fw / 2, -fh / 2);
      x.save(); x.shadowColor = "rgba(30,20,30,0.45)"; x.shadowBlur = 90; x.shadowOffsetY = 50; x.fillStyle = "#141414"; x.fillRect(0, 0, fw, fh); x.restore();
      x.fillStyle = "#faf9f6"; x.fillRect(26, 26, fw - 52, fh - 52);
      x.save(); x.shadowColor = "rgba(0,0,0,0.25)"; x.shadowBlur = 4; x.shadowOffsetY = 1; blFit(x, blCover(), 26 + 60, 26 + 60, inner, ih); x.restore();
      x.restore();
      var lx = 70, lw = W - 140, ly = fy + fh + 64;
      x.font = "400 58px " + SANS; if ("letterSpacing" in x) x.letterSpacing = "-1.4px";
      var tl = blWrap(x, [S.sub && S.sub + ",", (S.title || g.title) + ",", [S.dek, g.year].filter(Boolean).join(", ")].filter(Boolean).join("\n"), lw - 100).slice(0, 5);
      var meta = blMeta(), lh = 64, lhgt = 44 + tl.length * lh + (meta.length ? 66 : 0) + 30;
      blPaper(x, lx, ly, lw, lhgt);
      x.fillStyle = "#111"; x.textAlign = "left"; x.textBaseline = "top";
      tl.forEach(function (l, i) { x.fillText(l, lx + 50, ly + 44 + i * lh); });
      if ("letterSpacing" in x) x.letterSpacing = "0px";
      if (meta.length) { x.font = "400 27px " + SANS; x.fillStyle = "#8a888b"; x.fillText(meta.join("   ·   "), lx + 50, ly + 44 + tl.length * lh + 24); }
      x.textBaseline = "alphabetic";
      return { sticker: Math.min(1700, ly + lhgt + 110), sign: Math.min(1840, ly + lhgt + 250), soft: "#8a888b" };
    },
    // the game's art, its name large, one line, three pictures
    "bl-poster": function (x) {
      var g = S.bl.game;
      x.fillStyle = "#0b0b0d"; x.fillRect(0, 0, W, H);
      blFit(x, S.bl.hero || blCover(), 0, 0, W, 1060, 0.6, 0.08);
      var gr = x.createLinearGradient(0, 0, 0, 1080); gr.addColorStop(0, "rgba(11,11,13,0)"); gr.addColorStop(0.55, "rgba(11,11,13,0.1)"); gr.addColorStop(0.85, "rgba(11,11,13,0.88)"); gr.addColorStop(1, "#0b0b0d");
      x.fillStyle = gr; x.fillRect(0, 0, W, 1080);
      say(x, [S.sub, g.year].filter(Boolean).join(" · ").toUpperCase(), 80, 990, "400 30px " + SANS, "#9a9aa0", "left", 4);
      var t = S.title || g.title, fs = fitSize(x, t, 700, SANS, 128, 72, W - 160);
      say(x, t, 80, 990 + fs * 1.05, "700 " + fs + "px " + SANS, "#fff", "left", -4);
      var y = 990 + fs * 1.05 + 70;
      if (S.dek.trim()) y = para(x, S.dek.trim().charAt(0).toUpperCase() + S.dek.trim().slice(1) + ".", 80, y, "400 38px " + SANS, "#c9c9cf", "left", W - 160, 50, 2) + 50;
      var tw = (W - 160 - 40) / 3, ty = Math.max(y, 1250);
      [blShot(), S.bl.hero || blCover(), blCover()].forEach(function (im, i) { x.save(); rr(x, 80 + i * (tw + 20), ty, tw, tw * 9 / 16, 12); x.clip(); blFit(x, im, 80 + i * (tw + 20), ty, tw, tw * 9 / 16); x.restore(); });
      var end = ty + tw * 9 / 16;
      if (g.avg) say(x, "★ " + g.avg + " on Backloggd", 80, end + 70, "400 28px " + SANS, "#7d7d84");
      return { sticker: Math.min(1700, end + 170), sign: Math.min(1840, end + 310), soft: "rgba(255,255,255,0.5)" };
    },
    // two pictures and the cover as taped prints, notes in your hand
    "bl-prints": function (x) {
      var g = S.bl.game;
      x.fillStyle = "#e6e4e6"; x.fillRect(0, 0, W, H);
      blPrint(x, blShot(), 70, 230, 480, 4 / 3, -3, S.bl.note1, 50);
      blPrint(x, S.bl.hero && S.bl.hero !== blCover() ? S.bl.hero : blShot(), 530, 520, 480, 4 / 3, 2.6, S.bl.note2, 50, 0.7);
      var ch = blPrint(x, blCover(), 100, 880, 340, 3 / 4, -1.4, S.title || g.title, 42);
      x.textAlign = "left"; x.textBaseline = "top"; x.font = "400 50px " + SANS; x.fillStyle = "#111";
      var tl = blWrap(x, [S.sub && S.sub + ",", g.year && g.year + "."].filter(Boolean).join("\n"), W - 590);
      tl.forEach(function (l, i) { x.fillText(l, 520, 1150 + i * 56); });
      var y = 1150 + tl.length * 56 + 22; x.font = "400 27px " + SANS; x.fillStyle = "#8a888b";
      [g.genres.slice(0, 3).join(" · "), blPlatforms(g.platforms).join(", ")].filter(Boolean).forEach(function (t) { blWrap(x, t, W - 590).slice(0, 3).forEach(function (l) { x.fillText(l, 520, y); y += 36; }); });
      x.textBaseline = "alphabetic";
      var end = Math.max(880 + ch, y);
      return { sticker: Math.min(1700, end + 110), sign: Math.min(1840, end + 250), soft: "#8a888b" };
    },
    // your review, written in your hand, the stars under it
    "bl-hand": function (x) {
      var g = S.bl.game, rv = S.bl;
      x.fillStyle = "#e6e4e6"; x.fillRect(0, 0, W, H);
      var ph = blPrint(x, blCover(), 350, 230, 380, 3 / 4, -2.5, [S.title || g.title, g.year].filter(Boolean).join(", "), 40);
      var q = '"' + blHand(rv.text || "Your review, in your hand.") + '"', size = 84, top = 230 + ph + 70;
      x.font = "400 " + size + "px " + HAND;
      while (blWrap(x, q, W - 180).length * size * 1.08 > 440 && size > 46) { size -= 4; x.font = "400 " + size + "px " + HAND; }
      x.fillStyle = "#1f1d20"; x.textAlign = "left"; x.textBaseline = "top";
      var ql = blWrap(x, q, W - 180); ql.forEach(function (l, i) { x.fillText(l, 90, top + i * size * 1.08); });
      var sy = top + ql.length * size * 1.08 + 40;
      blStars(x, rv.rating, 90, sy, 76, "#111", "rgba(0,0,0,0.16)");
      x.font = "400 30px " + SANS; x.fillStyle = "#8a888b"; x.fillText("— " + [rv.name, "on Backloggd"].filter(Boolean).join(", "), 90, sy + 116);
      x.textBaseline = "alphabetic";
      var end = sy + 150;
      return { sticker: Math.min(1700, end + 110), sign: Math.min(1840, end + 250), soft: "#8a888b" };
    },
    // your best line, large, over the game's art
    "bl-quote": function (x) {
      var g = S.bl.game, rv = S.bl;
      x.fillStyle = "#0b0b0d"; x.fillRect(0, 0, W, H);
      x.save(); x.globalAlpha = 0.4; blFit(x, S.bl.hero || blCover(), 0, 0, W, H, 0.6, 0.35); x.restore();
      var gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "rgba(11,11,13,0.2)"); gr.addColorStop(0.45, "rgba(11,11,13,0.6)"); gr.addColorStop(0.75, "#0b0b0d"); gr.addColorStop(1, "#0b0b0d");
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
      var k = S.kicker.trim(); if (k) say(x, one(x, k.toUpperCase(), "400 30px " + SANS, 920), 80, 290, "400 30px " + SANS, "#b9b9c0", "left", 4);
      var q = "“" + String(rv.best || rv.text || "Your best line.").replace(/^["“]|["”]$/g, "") + "”", size = 96;
      x.font = "700 " + size + "px " + SANS;
      while (blWrap(x, q, W - 160).length * size * 1.04 > 560 && size > 54) { size -= 4; x.font = "700 " + size + "px " + SANS; }
      var ql = blWrap(x, q, W - 160); ql.forEach(function (l, i) { say(x, l, 80, 350 + size + i * size * 1.04, "700 " + size + "px " + SANS, "#fff", "left", -3); });
      var sy = 350 + size + (ql.length - 1) * size * 1.04 + 70;
      blStars(x, rv.rating, 80, sy, 72, "#fff", "rgba(255,255,255,0.22)");
      var by = sy + 170;
      x.fillStyle = "rgba(255,255,255,0.18)"; x.fillRect(80, by - 40, W - 160, 1.5);
      x.save(); x.shadowColor = "rgba(0,0,0,0.5)"; x.shadowBlur = 40; x.shadowOffsetY = 20; rr(x, 80, by, 170, 227, 12); x.fillStyle = "#000"; x.fill(); x.restore();
      x.save(); rr(x, 80, by, 170, 227, 12); x.clip(); blFit(x, blCover(), 80, by, 170, 227); x.restore();
      say(x, one(x, S.title || g.title, "400 44px " + SANS, W - 360), 284, by + 70, "400 44px " + SANS, "#fff");
      var played = [rv.platform && "played on " + rv.platform, rv.hours && rv.hours + " h"].filter(Boolean).join(" · ");
      say(x, one(x, [S.sub, g.year].filter(Boolean).join(" · "), "400 30px " + SANS, W - 360), 284, by + 122, "400 30px " + SANS, "#9a9aa0");
      if (played) say(x, one(x, played, "400 30px " + SANS, W - 360), 284, by + 164, "400 30px " + SANS, "#9a9aa0");
      var end = by + 227;
      return { sticker: Math.min(1700, end + 110), sign: Math.min(1840, end + 250), soft: "rgba(255,255,255,0.5)" };
    }
  };
  Object.keys(BL).forEach(function (k) { FULL[k] = BL[k]; OWN_BG[k] = 1; });
  ["bl-label", "bl-poster", "bl-prints", "bl-hand"].forEach(function (k) { NO_KICKER[k] = 1; });
  function blLoad(it, my) {
    note("Reading Backloggd…", false);
    return fetch("https://backloggd.com/games/" + it.slug + "/", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (html) {
      if (my !== token) return;
      if (/not a bot|Anubis/i.test(html)) { note("Backloggd asked for a bot check — open the game page once in this browser, then paste the link again.", true); return; }
      var g = blParse(html); if (!g) { note("That doesn’t look like a Backloggd game page.", true); return; }
      S.bl.game = g; S.title = g.title; S.sub = g.dev; S.dek = blLine(g.desc);
      if (!S.bl.platform) S.bl.platform = blPlatforms(g.platforms)[0] || "";
      note("Backloggd · " + [g.year, g.avg && g.avg + " ★"].filter(Boolean).join(" · "), false);
      return Promise.all([loadImg(g.cover), loadImg(g.shot)]).then(function (a) { if (my !== token) return; S.bl.cover = a[0]; S.bl.shot = a[1]; S.bl.hero = null; });
    }).catch(function () { if (my === token) note("Couldn’t read that Backloggd page.", true); });
  }
  // the review fields and the prints' notes
  function blFields() {
    var on = !!(S.item && S.item.kind === "backloggd"), st = styleOf();
    $("blSec").hidden = !on; if (!on) return;
    $("blReview").hidden = !(st === "bl-hand" || st === "bl-quote");
    $("blNotes").hidden = st !== "bl-prints";
    $("blRating").value = String(S.bl.rating); $("blText").value = S.bl.text; $("blBest").value = S.bl.best;
    $("blPlatform").value = S.bl.platform; $("blHours").value = S.bl.hours; $("blName").value = S.bl.name;
    $("blNote1").value = S.bl.note1; $("blNote2").value = S.bl.note2; $("blSteam").value = S.bl.steam || "";
  }
  [["blText", "text"], ["blBest", "best"], ["blPlatform", "platform"], ["blHours", "hours"], ["blName", "name"], ["blNote1", "note1"], ["blNote2", "note2"]].forEach(function (p) {
    $(p[0]).addEventListener("input", function () { S.bl[p[1]] = this.value; draw(); });
  });
  $("blRating").addEventListener("change", function () { S.bl.rating = +this.value; draw(); });
  $("blSteam").addEventListener("change", function () {
    var m = /store\.steampowered\.com\/app\/(\d+)/.exec(this.value) || /^(\d{3,8})$/.exec(this.value.trim()); S.bl.steam = this.value;
    if (!m) { S.bl.hero = null; draw(); return; }
    var my = token; loadImg("https://cdn.cloudflare.steamstatic.com/steam/apps/" + m[1] + "/library_hero.jpg").then(function (im) { if (my === token) { S.bl.hero = im; draw(); } });
  });
  function signAt(x, y, soft) {
    if (!S.sign) return;
    var mh = 48, label = "builtoberemembered";
    x.font = "500 27px " + SANS; if ("letterSpacing" in x) x.letterSpacing = "0.3px";
    var tw = x.measureText(label).width, gap = 12, sx = (W - ((markImg ? mh + gap : 0) + tw)) / 2;
    if (markImg) { x.drawImage(markIn(soft, 96), sx, y - mh / 2, mh, mh); sx += mh + gap; }
    x.fillStyle = soft; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText(label, sx, y + 1);
    if ("letterSpacing" in x) x.letterSpacing = "0px";
  }
  function paint(c) {
    var x = c.getContext("2d"); x0 = x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
    S.stickerY = STICKER_Y;
    var full = S.item && FULL[styleOf()];
    if (full) { var r = full(x); S.stickerY = r.sticker; signAt(x, r.sign, r.soft); return; }
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

    signAt(x, SIGN_Y, soft);
  }
  var raf = 0;
  function draw() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      paint($("view"));
      var it = S.item;
      $("sticker").hidden = !it; $("sticker").style.top = (S.stickerY / H * 100) + "%";
      if (it) $("stickerHost").textContent = it.host.replace(/^www\./, "");
      $("hint").hidden = !!(it && ((it.kind !== "web" && it.kind !== "bandcamp") || S.pic));
      $("hintText").textContent = !it ? "Paste a link to begin" : it.kind === "bandcamp" ? "Drop the album cover here, or press ⌘V" : "Drop a screenshot of the page here, or press ⌘V";
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
  $("tDek").addEventListener("input", function () { S.dek = this.value; draw(); });
  $("tLength").addEventListener("input", function () { S.length = this.value; draw(); });
  $("style").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || !S.item) return;
    S.style[S.item.kind] = b.dataset.v;
    try { localStorage.setItem("btbr_story_style", JSON.stringify(S.style)); } catch (x) {}
    panels(); draw();
  });
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
    var it = S.item, base = it.kind === "youtube" ? "youtube-" + it.id : it.kind === "web" ? it.host + (it.own ? it.path : "") : it.kind + "-" + (S.title || it.host);
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
  window.StoryPage = { state: S, paint: paint, W: W, H: H };   // for checking the pictures from outside
  loadImg(MARK_SRC).then(function (im) { markImg = im; draw(); });
  loadImg("/assets/cabin.png").then(function (im) { cabinImg = im; draw(); });
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
