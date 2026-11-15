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
    backloggd: [["bl-tvcard", "Card"], ["bl-tv", "TV"], ["bl-win", "Window"], ["bl-launch", "Launcher"], ["bl-glass", "Glass"], ["bl-phone", "iPhone"], ["bl-notifs", "Notifications"], ["bl-lock", "Lock Screen"], ["bl-top", "Top games"], ["bl-replay", "Replay"], ["bl-grid", "Grid"], ["bl-appstore", "Review"], ["bl-messages", "Messages"], ["bl-books", "Books"]]
  };
  var OWN_BG = { tv: 1, quicktime: 1, keynote: 1, hero: 1, icon: 1, glass: 1, playing: 1, album: 1, grid: 1, books: 1, editorial: 1, note: 1, collection: 1 };
  var NO_KICKER = { grid: 1, books: 1 };   // styles that bring their own background
  S.length = "";
  S.style = { youtube: "window", web: "safari", app: "card", music: "playing", arena: "grid", book: "books", bandcamp: "editorial", wiki: "note", backloggd: "bl-tvcard" }; S.dek = "";
  S.bl = { game: { genres: [], platforms: [] }, cover: null, shot: null, hero: null, rating: 4.5, hours: "", platform: "", steam: "",
    time: "", date: "", next: "", label: "", games: "", total: "", year: [{}, {}, {}, {}], period: "year", tint: "cover", month: new Date().getMonth(), labelSet: false,
    rtitle: "", text: "", best: "", name: "Isaaaaaaaac", day: "", ask: "" }; S.stickerY = STICKER_Y;
  try { Object.assign(S.style, JSON.parse(localStorage.getItem("btbr_story_style") || "{}")); } catch (e) {}
  Object.keys(S.style).forEach(function (k) { if (STYLES[k] && !STYLES[k].some(function (o) { return o[0] === S.style[k]; })) S.style[k] = STYLES[k][0][0]; });   // a style that's gone
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
    $("dropText").textContent = k === "backloggd" ? "for the big picture, if you don’t like Backloggd’s — or paste a Steam link below" : k === "youtube" || k === "wiki" ? "drop one here, or press ⌘V" : k === "bandcamp" ? "or on Bandcamp right-click the cover, Copy Image, and press ⌘V here" : "or take one with ⌘⇧⌃4 and press ⌘V";
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
    $("dekField").hidden = !(st === "hero" || st === "icon" || st === "editorial" || st === "note" || st === "collection" || st === "bl-tvcard");
    $("lengthField").hidden = st !== "collection";
    blFields();
    $("tDek").placeholder = /^bl-/.test(st) ? "A fallen kingdom of bugs, and you in the dark of it" : st === "note" ? "A line of your own" : st === "editorial" ? "e.g. 14 songs · 2022 · Jazz" : st === "collection" ? "New in my collection." : "";
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
  function bgPic() { return S.item && S.item.kind === "app" ? S.app && S.app.icon : S.item && S.item.kind === "backloggd" ? S.pic || (S.bl && S.bl.cover) : S.pic; }
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
  function blCover() { return S.bl.cover; }
  function blShot() { return S.pic || S.bl.shot || S.bl.cover; }
  var BL = {};
  // the story's own background: a tone, or the cover blurred
  function blGround(x) {
    var bp = bgPic(), dark;
    if (S.bg === "blur" && bp) { blurPic(x, bp, "rgba(0,0,0,0.28)", 1.3); dark = true; }
    else { var t = S.bg === "blur" ? "#e6e4e6" : S.bg; x.fillStyle = t; x.fillRect(0, 0, W, H); dark = toneDark(t); }
    return { ink: dark ? "#f5f5f7" : "#111", soft: dark ? "rgba(245,245,247,0.62)" : "#8a888b" };
  }
  /* Now playing, the Apple way: the game's art and three quiet figures — hours played, your rating,
     Backloggd's average — nothing to press, it's a story */
  function blStatCols() {
    var g = S.bl.game, c = [], h = String(S.bl.hours || "").trim().replace(/\s*h(ours?)?$/i, "");
    if (h) c.push([h + " h", "Played"]);
    if (S.bl.rating) c.push(["\u2605 " + S.bl.rating, "My rating"]);
    if (g.avg) c.push([g.avg, "On Backloggd"]);
    return c;
  }
  function blStatRow(x, a, b, w, ink, soft, line, left) {   // → the row's bottom
    var c = blStatCols(); if (!c.length) return b;
    x.fillStyle = line; x.fillRect(a, b, w, 1.5);
    var cw = w / c.length;
    c.forEach(function (s, i) {
      var cx = left ? a + i * cw : a + cw * (i + 0.5), al = left ? "left" : "center";
      if (i && !left) { x.fillStyle = line; x.fillRect(a + i * cw, b + 26, 1.5, 80); }
      say(x, s[0], cx, b + 66, "700 40px " + SANS, ink, al, -0.5);
      say(x, s[1], cx, b + 100, "400 24px " + SANS, soft, al);
    });
    return b + 116;
  }
  function blArt() { return S.bl.hero || blShot(); }
  // a white card: the art on top, the name, the figures, a line about it
  BL["bl-tvcard"] = function (x) {
    var c = blGround(x), g = S.bl.game, a = 134, w = W - 268, b = 400, ih = 470, p = 48;
    var k = S.kicker.trim(); if (k) say(x, one(x, k, "500 40px " + SANS, W - 200), W / 2, 326, "500 40px " + SANS, c.soft, "center", 0.5);
    var t = S.title || g.title, fs = fitSize(x, t, 700, SANS, 54, 38, w - 2 * p);
    var ty = b + ih + 34 + fs * 0.93, sy = ty + 42;
    var sub = one(x, [S.sub, g.genres[0], g.year].filter(Boolean).join(" \u00B7 "), "400 28px " + SANS, w - 2 * p);
    var rowTop = sy + 34, rowEnd = blStatCols().length ? rowTop + 116 : sy;
    var dek = S.dek.trim() ? S.dek.trim().charAt(0).toUpperCase() + S.dek.trim().slice(1).replace(/[.]?$/, ".") : "";
    x.font = "400 28px " + SANS; var dl = dek ? lines(x, dek, w - 2 * p, 2) : [];
    var bottom = (dl.length ? rowEnd + 26 + 28 + (dl.length - 1) * 39 : rowEnd) + 52, h = bottom - b;
    x.save(); x.shadowColor = "rgba(0,0,0,0.22)"; x.shadowBlur = 70; x.shadowOffsetY = 28; rr(x, a, b, w, h, 56); x.fillStyle = "#fff"; x.fill(); x.restore();
    x.save(); rr(x, a, b, w, h, 56); x.clip(); blFit(x, blArt(), a, b, w, ih, 0.62, 0.25); x.restore();
    say(x, t, a + p, ty, "700 " + fs + "px " + SANS, "#1d1d1f", "left", -1);
    say(x, sub, a + p, sy, "400 28px " + SANS, "#6e6e73");
    if (blStatCols().length) blStatRow(x, a + p, rowTop, w - 2 * p, "#1d1d1f", "#86868b", "#e5e5ea");
    dl.forEach(function (l, i) { say(x, l, a + p, rowEnd + 26 + 28 + i * 39, "400 28px " + SANS, "#6e6e73"); });
    return { sticker: Math.min(1700, bottom + 110), sign: Math.min(1840, bottom + 250), soft: c.soft };
  };
  // the art full-bleed, fading to black; the name large, the studio, the figures
  BL["bl-tv"] = function (x) {
    var g = S.bl.game;
    x.fillStyle = "#0b0b0c"; x.fillRect(0, 0, W, H);
    blFit(x, blArt(), 0, 0, W, 1080, 0.62, 0.2);
    var gr = x.createLinearGradient(0, 600, 0, 1100); gr.addColorStop(0, "rgba(11,11,12,0)"); gr.addColorStop(1, "#0b0b0c");
    x.fillStyle = gr; x.fillRect(0, 600, W, 500);
    var label = ["Backloggd", S.kicker.trim()].filter(Boolean).join(" \u00B7 ").toUpperCase();
    say(x, one(x, label, "700 26px " + SANS, W - 160), 80, 1136, "700 26px " + SANS, "rgba(255,255,255,0.6)", "left", 2);
    var t = S.title || g.title, fs = fitSize(x, t, 700, SANS, 96, 56, W - 160), ty = 1150 + fs * 0.95;
    say(x, t, 80, ty, "700 " + fs + "px " + SANS, "#fff", "left", -2.5);
    var y = ty;
    if (S.sub) { y += 74; say(x, one(x, S.sub, "500 44px " + SANS, W - 160), 80, y, "500 44px " + SANS, "rgba(255,255,255,0.75)"); }
    var end = blStatRow(x, 80, y + 44, W - 160, "#fff", "rgba(255,255,255,0.55)", "rgba(255,255,255,0.16)");
    var meta = [g.genres[0], g.year].filter(Boolean).join(" \u00B7 ");
    if (meta) { end += 60; say(x, meta, 80, end, "400 28px " + SANS, "rgba(255,255,255,0.5)"); }
    return { sticker: Math.min(1700, end + 130), sign: Math.min(1840, end + 270), soft: "rgba(255,255,255,0.5)" };
  };
  /* the game in a Mac window — three ways to say how it's going, none of them a progress bar */
  function blWin(x, a, b, w, h, fill) {
    x.save(); x.shadowColor = "rgba(0,0,0,0.12)"; x.shadowBlur = 6; x.shadowOffsetY = 2; rr(x, a, b, w, h, 28); x.fillStyle = fill; x.fill(); x.restore();
    x.save(); x.shadowColor = "rgba(0,0,0,0.22)"; x.shadowBlur = 70; x.shadowOffsetY = 28; rr(x, a, b, w, h, 28); x.fillStyle = fill; x.fill(); x.restore();
  }
  function blLights(x, a, b) { ["#ff5f57", "#febc2e", "#28c840"].forEach(function (c, i) { x.beginPath(); x.arc(a + 37 + i * 34, b + 35, 11, 0, Math.PI * 2); x.fillStyle = c; x.fill(); }); }
  function blUnder(x, c, y, line, name) {   // the name under the window, and one quiet line
    var t = name || S.title || S.bl.game.title || "", fs = fitSize(x, t, 700, SANS, 46, 34, W - 160);
    say(x, t, W / 2, y, "700 " + fs + "px " + SANS, c.ink, "center", -0.7);
    if (line) say(x, one(x, line, "400 32px " + SANS, W - 160), W / 2, y + 52, "400 32px " + SANS, c.soft, "center");
    return y + 52;
  }
  function blTop(x, c) { var k = S.kicker.trim(); if (k) say(x, one(x, k, "500 40px " + SANS, W - 200), W / 2, 326, "500 40px " + SANS, c.soft, "center", 0.5); }
  function blHoursTxt() { var h = String(S.bl.hours || "").trim().replace(/\s*h(ours?)?$/i, ""); return h ? h + " h" : ""; }
  // a pane of frosted glass over the window's art: the art again, blurred, tinted, a fine light edge
  function blFrost(x, a, b, w, h, r, art) {
    x.save(); rr(x, a, b, w, h, r); x.clip();
    x.filter = "blur(36px) saturate(1.7)"; art(); x.filter = "none";
    x.fillStyle = "rgba(30,30,34,0.5)"; x.fillRect(a, b, w, h); x.restore();
    rr(x, a + 0.75, b + 0.75, w - 1.5, h - 1.5, r); x.strokeStyle = "rgba(255,255,255,0.18)"; x.lineWidth = 1.5; x.stroke();
  }
  // A · the art fills the window; the name on it, the figures along its foot
  BL["bl-win"] = function (x) {
    var c = blGround(x), g = S.bl.game, a = 80, b = 470, w = W - 160, h = 680;
    blTop(x, c); blWin(x, a, b, w, h, "#000");
    x.save(); rr(x, a, b, w, h, 28); x.clip();
    blFit(x, blArt(), a, b, w, h, 0.62, 0.25);
    var gl = x.createLinearGradient(a, 0, a + w, 0); gl.addColorStop(0, "rgba(0,0,0,0.78)"); gl.addColorStop(0.62, "rgba(0,0,0,0.05)"); x.fillStyle = gl; x.fillRect(a, b, w, h);
    var gb = x.createLinearGradient(0, b + h - 300, 0, b + h); gb.addColorStop(0, "rgba(0,0,0,0)"); gb.addColorStop(1, "rgba(0,0,0,0.7)"); x.fillStyle = gb; x.fillRect(a, b + h - 300, w, 300);
    x.restore(); blLights(x, a, b);
    var t = S.title || g.title, fs = fitSize(x, t, 700, SANS, 68, 44, w - 96);
    say(x, t, a + 48, b + 262, "700 " + fs + "px " + SANS, "#fff", "left", -1.4);
    say(x, one(x, [S.sub, g.year, g.genres[0]].filter(Boolean).join(" \u00B7 "), "400 26px " + SANS, w - 96), a + 48, b + 312, "400 26px " + SANS, "rgba(255,255,255,0.72)");
    blStatRow(x, a + 48, b + h - 156, w - 96, "#fff", "rgba(255,255,255,0.6)", "rgba(255,255,255,0.22)", true);
    var end = blUnder(x, c, b + h + 104, ["Backloggd", S.sub, S.bl.platform].filter(Boolean).join(" \u00B7 "));
    return { sticker: Math.min(1700, end + 130), sign: Math.min(1840, end + 300), soft: c.soft };
  };
  // B · a game's page in a launcher: the art across the top, the box standing on it, the stars beside
  BL["bl-launch"] = function (x) {
    var c = blGround(x), g = S.bl.game, a = 80, b = 470, w = W - 160, h = 700, base = "#121214";
    blTop(x, c); blWin(x, a, b, w, h, base);
    x.save(); rr(x, a, b, w, h, 28); x.clip();
    blFit(x, blArt(), a, b, w, 420, 0.62, 0.25);
    var gb = x.createLinearGradient(0, b + 220, 0, b + 420); gb.addColorStop(0, "rgba(18,18,20,0)"); gb.addColorStop(1, base); x.fillStyle = gb; x.fillRect(a, b + 220, w, 201);
    x.restore(); blLights(x, a, b);
    var ca = a + 48, cb = b + 250, cw = 250, ch = 333;
    x.save(); x.shadowColor = "rgba(0,0,0,0.6)"; x.shadowBlur = 50; x.shadowOffsetY = 24; rr(x, ca, cb, cw, ch, 14); x.fillStyle = "#000"; x.fill(); x.restore();
    x.save(); rr(x, ca, cb, cw, ch, 14); x.clip(); blFit(x, blCover(), ca, cb, cw, ch); x.restore();
    rr(x, ca + 0.75, cb + 0.75, cw - 1.5, ch - 1.5, 14); x.strokeStyle = "rgba(255,255,255,0.12)"; x.lineWidth = 1.5; x.stroke();
    var tx = a + 336, tw = w - 336 - 40, t = S.title || g.title, fs = fitSize(x, t, 700, SANS, 58, 36, tw);
    say(x, t, tx, b + 492, "700 " + fs + "px " + SANS, "#fff", "left", -1.2);
    say(x, one(x, [S.sub, g.year, g.genres[0]].filter(Boolean).join(" \u00B7 "), "400 25px " + SANS, tw), tx, b + 534, "400 25px " + SANS, "rgba(255,255,255,0.6)");
    var sx = tx, hrs = blHoursTxt();
    if (S.bl.rating) { blStars(x, S.bl.rating, tx, b + 566, 34, "#fff", "rgba(255,255,255,0.25)"); sx = tx + 5 * 34 + 4 * 34 * 0.16 + 22; }
    if (hrs) {
      if (sx > tx) { say(x, "\u00B7", sx, b + 594, "400 26px " + SANS, "rgba(255,255,255,0.35)"); sx += 26; }
      say(x, hrs.replace(/ h$/, " hours"), sx, b + 594, "400 26px " + SANS, "rgba(255,255,255,0.85)");
    }
    var end = blUnder(x, c, b + h + 104, ["Backloggd", g.avg && "\u2605 " + g.avg + " average"].filter(Boolean).join(" \u00B7 "));
    return { sticker: Math.min(1700, end + 130), sign: Math.min(1840, end + 300), soft: c.soft };
  };
  // C · a glass card floating on the art: the cover, the name, your stars — nothing to press
  BL["bl-glass"] = function (x) {
    var c = blGround(x), g = S.bl.game, a = 80, b = 470, w = W - 160, h = 680;
    var art = function () { blFit(x, blArt(), a, b, w, h, 0.62, 0.25); };
    blTop(x, c); blWin(x, a, b, w, h, "#000");
    x.save(); rr(x, a, b, w, h, 28); x.clip(); art();
    var gb = x.createLinearGradient(0, b + h * 0.45, 0, b + h); gb.addColorStop(0, "rgba(0,0,0,0)"); gb.addColorStop(1, "rgba(0,0,0,0.35)"); x.fillStyle = gb; x.fillRect(a, b, w, h);
    var hrs = blHoursTxt();
    if (hrs) {
      var lab = hrs + " played"; x.font = "600 24px " + SANS; var pw = x.measureText(lab).width + 44, pa = a + w - 28 - pw;
      blFrost(x, pa, b + 22, pw, 48, 24, art); say(x, lab, pa + pw / 2, b + 54, "600 24px " + SANS, "#fff", "center");
    }
    var ga = a + 36, gw = w - 72, gh = 162, gt = b + h - 36 - gh;
    blFrost(x, ga, gt, gw, gh, 40, art);
    x.restore(); blLights(x, a, b);
    x.save(); rr(x, ga + 22, gt + 22, 118, 118, 20); x.clip(); blFit(x, blCover(), ga + 22, gt + 22, 118, 118, 0.5, 0.3); x.restore();
    var sw = S.bl.rating ? 5 * 34 + 4 * 34 * 0.16 : 0, tx = ga + 22 + 118 + 26, tw = gw - (tx - ga) - (sw ? sw + 40 : 24);
    var t = S.title || g.title, fs = fitSize(x, t, 700, SANS, 40, 28, tw);
    say(x, t, tx, gt + 76, "700 " + fs + "px " + SANS, "#fff", "left", -0.4);
    say(x, one(x, [S.sub, g.year].filter(Boolean).join(" \u00B7 "), "400 24px " + SANS, tw), tx, gt + 112, "400 24px " + SANS, "rgba(255,255,255,0.65)");
    if (sw) {
      blStars(x, S.bl.rating, ga + gw - 34 - sw, gt + 50, 34, "#fff", "rgba(255,255,255,0.25)");
      say(x, "my rating", ga + gw - 34, gt + 116, "400 22px " + SANS, "rgba(255,255,255,0.6)", "right");
    }
    var end = blUnder(x, c, b + h + 104, ["Backloggd", S.sub, hrs].filter(Boolean).join(" \u00B7 "));
    return { sticker: Math.min(1700, end + 130), sign: Math.min(1840, end + 300), soft: c.soft };
  };
  /* Just finished: the moment told by Backloggd's notifications — on a Lock Screen in an iPhone,
     as a stack on the story's background, or a whole Lock Screen */
  function blStarStr(r) { r = +r || 0; var f = Math.floor(r), half = r - f >= 0.5 ? "½" : ""; return "★".repeat(f) + half; }
  function blNotes() {
    var t = S.title || S.bl.game.title, h = blHoursTxt(), out = [];
    out.push({ when: "now", body: "Finished " + t + (h ? " — " + h.replace(/ h$/, " hours") : ""), icon: 1 });
    if (S.bl.rating) out.push({ when: "2m ago", body: "You rated it " + blStarStr(S.bl.rating), icon: 1 });
    if (S.bl.next.trim()) out.push({ when: "5m ago", body: S.bl.next.trim(), faded: 1 });
    return out;
  }
  function blNotif(x, a, b, w, s, dark, n) {   // one notification, at scale s → its height
    var pad = 30 * s, ic = 90 * s, r = 44 * s, h = ic + 2 * pad, mid = b + h / 2;
    x.save();
    if (n.faded) { x.globalAlpha = 0.78; x.translate(a + w / 2, mid); x.scale(0.95, 0.95); x.translate(-(a + w / 2), -mid); }
    if (dark) {
      rr(x, a, b, w, h, r); x.fillStyle = "rgba(40,40,44,0.55)"; x.fill();
      rr(x, a + 0.75, b + 0.75, w - 1.5, h - 1.5, r); x.strokeStyle = "rgba(255,255,255,0.14)"; x.lineWidth = 1.5; x.stroke();
    } else {
      x.save(); x.shadowColor = "rgba(0,0,0,0.14)"; x.shadowBlur = 40 * s; x.shadowOffsetY = 18 * s; rr(x, a, b, w, h, r); x.fillStyle = "rgba(250,250,252,0.94)"; x.fill(); x.restore();
      rr(x, a + 0.5, b + 0.5, w - 1, h - 1, r); x.strokeStyle = "rgba(0,0,0,0.07)"; x.lineWidth = 1; x.stroke();
    }
    var ia = a + pad, ib = b + pad;
    if (n.icon && blCover()) { x.save(); rr(x, ia, ib, ic, ic, 20 * s); x.clip(); blFit(x, blCover(), ia, ib, ic, ic, 0.5, 0.3); x.restore(); }
    else { rr(x, ia, ib, ic, ic, 20 * s); x.fillStyle = dark ? "rgba(255,255,255,0.18)" : "#d9d9de"; x.fill(); }
    var ink = dark ? "#fff" : "#1d1d1f", soft = dark ? "rgba(255,255,255,0.55)" : "#86868b", tx = ia + ic + 24 * s, tw = a + w - pad - tx;
    say(x, "Backloggd", tx, mid - 6 * s, "700 " + 30 * s + "px " + SANS, ink);
    say(x, n.when, a + w - pad, mid - 6 * s, "400 " + 26 * s + "px " + SANS, soft, "right");
    say(x, one(x, n.body, "400 " + 32 * s + "px " + SANS, tw), tx, mid + 36 * s, "400 " + 32 * s + "px " + SANS, ink);
    x.restore();
    return h;
  }
  function blDoneLine() { return ["Backloggd", S.sub, blStarStr(S.bl.rating)].filter(Boolean).join(" · "); }
  // the Lock Screen, in an iPhone
  BL["bl-phone"] = function (x) {
    var c = blGround(x), a = 300, b = 390, w = 480, h = 980, sa = a + 16, sb = b + 16, sw = w - 32, sh = h - 32;
    blTop(x, c);
    x.save(); x.shadowColor = "rgba(0,0,0,0.12)"; x.shadowBlur = 6; x.shadowOffsetY = 2; rr(x, a, b, w, h, 78); x.fillStyle = "#1d1d1f"; x.fill(); x.restore();
    x.save(); x.shadowColor = "rgba(0,0,0,0.22)"; x.shadowBlur = 70; x.shadowOffsetY = 28; rr(x, a, b, w, h, 78); x.fillStyle = "#1d1d1f"; x.fill(); x.restore();
    x.save(); rr(x, sa, sb, sw, sh, 64); x.clip();
    x.fillStyle = "#1c1c2e"; x.fillRect(sa, sb, sw, sh);
    x.filter = "blur(30px) saturate(1.4)"; blFit(x, blCover(), sa - 40, sb - 40, sw + 80, sh + 80); x.filter = "none";
    x.fillStyle = "rgba(0,0,0,0.12)"; x.fillRect(sa, sb, sw, sh);
    rr(x, sa + sw / 2 - 65, sb + 20, 130, 38, 19); x.fillStyle = "#000"; x.fill();
    say(x, S.bl.date, sa + sw / 2, sb + 124, "600 22px " + SANS, "#fff", "center");
    say(x, S.bl.time, sa + sw / 2, sb + 236, "600 120px " + SANS, "#fff", "center", -3);
    var y = sb + 520; blNotes().forEach(function (n) { y += blNotif(x, sa + 14, y, sw - 28, 0.48, true, n) + 8; });
    x.restore();
    var end = blUnder(x, c, b + h + 104, blDoneLine());
    return { sticker: Math.min(1700, end + 110), sign: Math.min(1840, end + 250), soft: c.soft };
  };
  // the notifications alone, on the story's background
  BL["bl-notifs"] = function (x) {
    var c = blGround(x), y = 520;
    blTop(x, c);
    blNotes().forEach(function (n) { y += blNotif(x, 110, y, W - 220, 0.98, false, n) + 22; });
    var end = blUnder(x, c, Math.max(y + 140, 1190), ["Backloggd", S.sub].filter(Boolean).join(" · "));
    return { sticker: Math.min(1700, end + 130), sign: Math.min(1840, end + 300), soft: c.soft };
  };
  // the whole story as the Lock Screen
  BL["bl-lock"] = function (x) {
    blurPic(x, blCover(), "rgba(0,0,0,0.18)", 1.5);
    say(x, S.bl.date, W / 2, 300, "600 40px " + SANS, "rgba(255,255,255,0.85)", "center");
    say(x, S.bl.time, W / 2, 530, "600 250px " + SANS, "#fff", "center", -7);
    var y = 860; blNotes().forEach(function (n) { y += blNotif(x, 50, y, W - 100, 1, true, n) + 16; });
    return { sticker: Math.min(1700, Math.max(y + 110, 1480)), sign: 1810, soft: "rgba(255,255,255,0.6)" };
  };
  /* My year in games: the game you pasted first, then up to four more by their Backloggd links */
  function blH(v) { return String(v || "").trim().replace(/\s*h(ours?)?$/i, ""); }
  function blYearList() {
    var out = [{ title: S.title || S.bl.game.title, dev: S.sub, cover: blCover(), art: blArt(), hours: blH(S.bl.hours), rating: S.bl.rating }];
    S.bl.year.forEach(function (y) { if (y.game) out.push({ title: y.game.title, dev: y.game.dev, cover: y.cover, art: y.cover, hours: blH(y.hours), rating: y.rating || 0 }); });
    return out;
  }
  function blYearLine() {
    var l = blYearList(), sum = l.reduce(function (t, g) { return t + (parseFloat(g.hours) || 0); }, 0), games = blH(S.bl.games), total = blH(S.bl.total) || (sum ? String(Math.round(sum)) : "");
    return ["Backloggd", games && games + " games", total && total + " hours"].filter(Boolean).join(" · ");
  }
  function blGameMeta(g, long) { return [g.hours && g.hours + (long ? " hours" : " h"), blStarStr(g.rating)].filter(Boolean).join(" · "); }
  /* the year's colour: Graphite, or drawn from the #1 game's cover — its strongest hue, light at the top to near-black */
  var hueMemo = new WeakMap();
  function blHue(im) {
    if (!im) return null; if (hueMemo.has(im)) return hueMemo.get(im);
    var c = document.createElement("canvas"); c.width = c.height = 24; var x = c.getContext("2d"), d;
    try { x.drawImage(im, 0, 0, 24, 24); d = x.getImageData(0, 0, 24, 24).data; } catch (e) { hueMemo.set(im, null); return null; }
    var sx = 0, sy = 0, ws = 0;   // a mean of hues on the colour wheel, weighted by how vivid each pixel is
    for (var i = 0; i < d.length; i += 4) {
      var r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn; if (!ch) continue;
      var h = mx === r ? ((g - b) / ch) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4, w = ch * mx;
      sx += Math.cos(h * Math.PI / 3) * w; sy += Math.sin(h * Math.PI / 3) * w; ws += w;
    }
    var out = ws ? { h: Math.round((Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360), s: Math.min(68, Math.max(30, Math.round(Math.hypot(sx, sy) / ws * 140))) } : null;
    hueMemo.set(im, out); return out;
  }
  function blTint() {   // → { stops, accent }
    var hu = S.bl.tint === "cover" && blHue(blCover());
    if (!hu) return { stops: ["#3a3a3c", "#1c1c1e", "#0e0e0f"], accent: "#6e6e73" };
    return { stops: ["hsl(" + hu.h + "," + hu.s + "%,56%)", "hsl(" + hu.h + "," + hu.s + "%,32%)", "hsl(" + hu.h + "," + hu.s + "%,14%)"], accent: "hsl(" + hu.h + "," + Math.min(75, hu.s + 10) + "%,46%)" };
  }
  // the top games as a white card
  BL["bl-top"] = function (x) {
    var c = blGround(x), l = blYearList(), a = 134, w = W - 268, b = 400, p = 48, rh = 128, top = b + 160, h = 160 + l.length * rh + 24;
    blTop(x, c);
    x.save(); x.shadowColor = "rgba(0,0,0,0.22)"; x.shadowBlur = 70; x.shadowOffsetY = 28; rr(x, a, b, w, h, 56); x.fillStyle = "#fff"; x.fill(); x.restore();
    say(x, S.bl.label.toUpperCase(), a + p, b + 72, "700 26px " + SANS, blTint().accent, "left", 0.5);
    say(x, "Top games", a + p, b + 134, "700 60px " + SANS, "#1d1d1f", "left", -1.2);
    x.fillStyle = "#e5e5ea"; x.fillRect(a + p, top, w - 2 * p, 1.5);
    l.forEach(function (g, i) {
      var y = top + i * rh, ca = a + p + 52, tx = ca + 96 + 22, tw = a + w - p - tx - 90;
      say(x, String(i + 1), a + p, y + 76, "700 30px " + SANS, "#1d1d1f");
      x.save(); rr(x, ca, y + 16, 96, 96, 12); x.clip(); blFit(x, g.cover, ca, y + 16, 96, 96, 0.5, 0.3); x.restore();
      say(x, one(x, g.title || "", "600 32px " + SANS, tw), tx, y + 58, "600 32px " + SANS, "#1d1d1f");
      if (g.dev) say(x, one(x, g.dev, "400 24px " + SANS, tw), tx, y + 92, "400 24px " + SANS, "#86868b");
      if (g.hours) say(x, g.hours + " h", a + w - p, y + 74, "400 26px " + SANS, "#86868b", "right");
      if (i < l.length - 1) { x.fillStyle = "#f0f0f3"; x.fillRect(a + p, y + rh, w - 2 * p, 1.5); }
    });
    var end = b + h;
    return { sticker: Math.min(1700, end + 110), sign: Math.min(1840, end + 250), soft: c.soft };
  };
  // Replay: full-bleed red to orange, the year large, the games down the page
  BL["bl-replay"] = function (x) {
    var l = blYearList(), gr = x.createLinearGradient(W * 0.35, 0, W * 0.65, H), tn = blTint().stops;
    gr.addColorStop(0, tn[0]); gr.addColorStop(0.55, tn[1]); gr.addColorStop(1, tn[2]); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    say(x, S.bl.label.toUpperCase(), 80, 280, "700 30px " + SANS, "rgba(255,255,255,0.62)", "left", 0.5);
    var k = S.kicker.trim() || "My year in games"; x.font = "700 112px " + SANS;
    var tl = lines(x, k, W - 160, 2);
    if (tl.length === 2) {   // two lines of even length read better than a long one and an orphan
      var ws = k.split(/\s+/), best = null;
      for (var i = 1; i < ws.length; i++) { var l1 = ws.slice(0, i).join(" "), l2 = ws.slice(i).join(" "), m = Math.max(x.measureText(l1).width, x.measureText(l2).width); if (m <= W - 160 && (!best || m < best[2])) best = [l1, l2, m]; }
      if (best) tl = [best[0], best[1]];
    }
    tl.forEach(function (t, i) { say(x, t, 80, 392 + i * 107, "700 112px " + SANS, "#fff", "left", -3.5); });
    var y0 = 392 + (tl.length - 1) * 107 + 70, rh = Math.min(174, (1640 - y0) / Math.max(1, l.length));
    l.forEach(function (g, i) {
      var y = y0 + i * rh, cs = Math.min(150, rh - 24), tw = W - 80 - 340;
      say(x, String(i + 1), 80, y + cs / 2 + 20, "700 56px " + SANS, "#fff");
      if (!i) { x.save(); x.shadowColor = "rgba(0,0,0,0.25)"; x.shadowBlur = 40; x.shadowOffsetY = 16; rr(x, 160, y, cs, cs, 18); x.fillStyle = "#000"; x.fill(); x.restore(); }
      x.save(); rr(x, 160, y, cs, cs, 18); x.clip(); blFit(x, g.cover, 160, y, cs, cs, 0.5, 0.3); x.restore();
      say(x, one(x, g.title || "", "700 46px " + SANS, tw), 340, y + cs / 2 - 4, "700 46px " + SANS, "#fff", "left", -0.6);
      var m = blGameMeta(g, true); if (m) say(x, m, 340, y + cs / 2 + 38, "400 28px " + SANS, "rgba(255,255,255,0.85)");
    });
    return { sticker: 1700, sign: 1818, soft: "rgba(255,255,255,0.8)" };
  };
  // the first game wide, the next two beside each other
  BL["bl-grid"] = function (x) {
    var c = blGround(x), l = blYearList(), a = 110, w = W - 220, b = 400, f = l[0];
    blTop(x, c);
    function shot(im, px, py, pw, ph, r, ay) {
      x.save(); x.shadowColor = "rgba(0,0,0,0.22)"; x.shadowBlur = 50; x.shadowOffsetY = 20; rr(x, px, py, pw, ph, r); x.fillStyle = "#000"; x.fill(); x.restore();
      x.save(); rr(x, px, py, pw, ph, r); x.clip(); blFit(x, im, px, py, pw, ph, 0.6, ay); x.restore();
    }
    shot(f.art, a, b, w, 440, 24, 0.25);
    say(x, one(x, "1 · " + f.title, "700 34px " + SANS, w - 220), a, b + 494, "700 34px " + SANS, c.ink, "left", -0.4);
    say(x, one(x, [f.dev, f.hours && f.hours + " h"].filter(Boolean).join(" · "), "400 26px " + SANS, w - 220), a, b + 530, "400 26px " + SANS, c.soft);
    if (f.rating) { var sw = 5 * 30 + 4 * 30 * 0.16; blStars(x, f.rating, a + w - sw, b + 470, 30, c.ink, c.ink === "#111" ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.25)"); }
    var end = b + 540, cw = (w - 28) / 2;
    l.slice(1, 3).forEach(function (g, i) {
      var px = a + i * (cw + 28), py = b + 590;
      shot(g.cover, px, py, cw, 250, 20, 0.3);
      say(x, one(x, (i + 2) + " · " + g.title, "700 28px " + SANS, cw), px, py + 292, "700 28px " + SANS, c.ink);
      var m = blGameMeta(g); if (m) say(x, one(x, m, "400 24px " + SANS, cw), px, py + 324, "400 24px " + SANS, c.soft);
      end = py + 330;
    });
    var e2 = blUnder(x, c, end + 110, blYearLine(), S.bl.label);   // under it, the year — not the game
    return { sticker: Math.min(1700, e2 + 110), sign: Math.min(1840, e2 + 250), soft: c.soft };
  };
  /* the quote: your review the Apple way — an App Store review, a Messages thread, a page in Books */
  var SERIF = '"New York", "Iowan Old Style", "Palatino", Georgia, serif';
  function blText() { return String(S.bl.text || "").trim() || "Every bench feels earned. I got lost for hours in the dark of it and never once wanted the map to be easier. The hardest parts are the ones I’ll remember."; }
  function blBest() {   // the best line: yours, or the review's last sentence
    var b = String(S.bl.best || "").trim(); if (b) return b;
    var ss = blText().match(/[^.!?]+[.!?]+/g); return ss ? ss[ss.length - 1].trim() : blText();
  }
  function blDay() { return S.bl.day || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  function blFitLines(x, text, weight, family, size, min, maxW, maxH, lh) {   // shrink until it fits → [lines, size]
    var l;
    for (;;) { x.font = weight + " " + size + "px " + family; l = blWrap(x, text, maxW); if (l.length * size * lh <= maxH || size <= min) return [l, size]; size -= 2; }
  }
  // an App Store review card: the title, the orange stars, your name and the day, your words, the game
  BL["bl-appstore"] = function (x) {
    var c = blGround(x), g = S.bl.game, a = 110, w = W - 220, b = 420, px = 56, iw = w - 2 * px;
    blTop(x, c);
    x.font = "700 40px " + SANS; var tl = blWrap(x, S.bl.rtitle.trim() || blBest(), iw - 150).slice(0, 2);
    var fl = blFitLines(x, blText(), 400, SANS, 33, 26, iw, 620, 1.45), bl = fl[0], bs = fl[1], blh = bs * 1.45;
    var y0 = b + 52, ty = y0 + 38, sy = ty + (tl.length - 1) * 46 + 30, by = sy + 36 + 28 + bs, fy = by + (bl.length - 1) * blh + 40, h = fy + 32 + 96 + 56 - b;
    x.save(); x.shadowColor = "rgba(0,0,0,0.22)"; x.shadowBlur = 70; x.shadowOffsetY = 28; rr(x, a, b, w, h, 44); x.fillStyle = "#fff"; x.fill(); x.restore();
    tl.forEach(function (l, i) { say(x, l, a + px, ty + i * 46, "700 40px " + SANS, "#1d1d1f", "left", -0.6); });
    say(x, blDay(), a + w - px, ty - 2, "400 26px " + SANS, "#86868b", "right");
    if (S.bl.rating) blStars(x, S.bl.rating, a + px, sy, 36, "#ff9500", "#ffd8a8");
    say(x, one(x, S.bl.name, "400 26px " + SANS, 300), a + w - px, sy + 30, "400 26px " + SANS, "#86868b", "right");
    bl.forEach(function (l, i) { say(x, l, a + px, by + i * blh, "400 " + bs + "px " + SANS, "#1d1d1f"); });
    x.fillStyle = "#e5e5ea"; x.fillRect(a + px, fy, iw, 1.5);
    var cy = fy + 32;
    x.save(); rr(x, a + px, cy, 96, 96, 22); x.clip(); blFit(x, blCover(), a + px, cy, 96, 96, 0.5, 0.3); x.restore();
    say(x, one(x, S.title || g.title, "600 30px " + SANS, iw - 130), a + px + 118, cy + 44, "600 30px " + SANS, "#1d1d1f");
    var sub = [S.sub, blHoursTxt() && blHoursTxt().replace(/ h$/, " hours") + (S.bl.platform ? " on " + S.bl.platform : "")].filter(Boolean).join(" · ");
    if (sub) say(x, one(x, sub, "400 24px " + SANS, iw - 130), a + px + 118, cy + 78, "400 24px " + SANS, "#86868b");
    var end = b + h;
    return { sticker: Math.min(1700, end + 110), sign: Math.min(1840, end + 250), soft: c.soft };
  };
  // Messages: a friend asks, you answer with your best line, the stars, and the game as a link
  function blBubble(x, a, b, w, h, fill) { rr(x, a, b, w, h, Math.min(46, h / 2)); x.fillStyle = fill; x.fill(); }
  BL["bl-messages"] = function (x) {
    var g = S.bl.game, L = 60, R = W - 60, maxW = 700, pad = 34, fs = 38, lh = 49;
    x.fillStyle = "#f2f2f7"; x.fillRect(0, 0, W, H);
    var k = S.kicker.trim(); if (k) say(x, one(x, k, "500 40px " + SANS, W - 200), W / 2, 326, "500 40px " + SANS, "#6e6e73", "center", 0.5);
    say(x, "Today " + S.bl.time, W / 2, 440, "400 24px " + SANS, "#8e8e93", "center");
    var y = 474;
    function bubble(text, out) {
      x.font = "400 " + fs + "px " + SANS; var ls = blWrap(x, text, maxW - 2 * pad).slice(0, 6), tw = Math.max.apply(null, ls.map(function (l) { return x.measureText(l).width; }));
      var bw = tw + 2 * pad, bh = ls.length * lh + 2 * 26 - (lh - fs) + 4, ba = out ? R - bw : L;
      blBubble(x, ba, y, bw, bh, out ? "#0a84ff" : "#fff");
      ls.forEach(function (l, i) { say(x, l, ba + pad, y + 26 + fs * 0.86 + i * lh, "400 " + fs + "px " + SANS, out ? "#fff" : "#1d1d1f"); });
      y += bh + 14;
    }
    bubble(S.bl.ask.trim() || "so… was " + (S.title || g.title) + " worth it?", false);
    y += 22; bubble(blBest(), true);
    if (S.bl.rating) { var sw = 5 * 42 + 4 * 42 * 0.16, bw = sw + 64; blBubble(x, R - bw, y, bw, 82, "#0a84ff"); blStars(x, S.bl.rating, R - bw + 32, y + 20, 42, "#fff", "rgba(255,255,255,0.35)"); y += 82 + 14; }
    var cw = 560, ca = R - cw, ih = 300, ch = ih + 104;
    x.save(); x.shadowColor = "rgba(0,0,0,0.14)"; x.shadowBlur = 50; x.shadowOffsetY = 20; rr(x, ca, y, cw, ch, 40); x.fillStyle = "#e9e9eb"; x.fill(); x.restore();
    x.save(); rr(x, ca, y, cw, ch, 40); x.clip(); blFit(x, blArt(), ca, y, cw, ih, 0.62, 0.25); x.restore();
    say(x, one(x, S.title || g.title, "600 30px " + SANS, cw - 60), ca + 30, y + ih + 50, "600 30px " + SANS, "#1d1d1f");
    say(x, "backloggd.com", ca + 30, y + ih + 82, "400 24px " + SANS, "#6e6e73");
    y += ch + 36;
    say(x, "Read " + S.bl.time, R - 14, y, "400 22px " + SANS, "#8e8e93", "right");
    return { sticker: Math.min(1700, y + 110), sign: Math.min(1840, y + 250), soft: "#8e8e93" };
  };
  // Books: the whole review as a page, the best line highlighted
  BL["bl-books"] = function (x) {
    var c = blGround(x), g = S.bl.game, a = 110, w = W - 220, b = 420, px = 72, iw = w - 2 * px;
    blTop(x, c);
    var text = blText(), best = blBest(), at = text.indexOf(best);
    if (at < 0) { text = text + " " + best; at = text.length - best.length; }
    // words, each knowing if it's in the highlight
    var words = [], re = /\S+/g, m;
    while ((m = re.exec(text))) words.push({ t: m[0], hi: m.index >= at && m.index < at + best.length });
    var size = 38, lines;
    for (;;) {
      x.font = "400 " + size + "px " + SERIF; lines = []; var cur = [], wd = 0, sp = x.measureText(" ").width;
      words.forEach(function (o) { var ow = x.measureText(o.t).width; if (cur.length && wd + sp + ow > iw) { lines.push(cur); cur = []; wd = 0; } wd += (cur.length ? sp : 0) + ow; cur.push(o); });
      if (cur.length) lines.push(cur);
      if (lines.length * size * 1.6 <= 640 || size <= 28) break; size -= 2;
    }
    var lh = size * 1.6, ty = b + 70 + 22 + 44 + size, h = (ty - b) + (lines.length - 1) * lh + 54 + 24 + 64;
    x.save(); x.shadowColor = "rgba(0,0,0,0.2)"; x.shadowBlur = 70; x.shadowOffsetY = 28; rr(x, a, b, w, h, 30); x.fillStyle = "#fbfaf7"; x.fill(); x.restore();
    say(x, one(x, (S.title || g.title || "").toUpperCase(), "600 22px " + SANS, iw), W / 2, b + 92, "600 22px " + SANS, "#a29d93", "center", 3);
    x.font = "400 " + size + "px " + SERIF; var sp = x.measureText(" ").width;
    lines.forEach(function (ln, i) {
      var lx = a + px, by = ty + i * lh;
      ln.forEach(function (o, j) {   // the yellow first, run by run, under the words
        var ow = x.measureText(o.t).width;
        if (o.hi) { var ext = j < ln.length - 1 && ln[j + 1].hi ? sp : 0; rr(x, lx - 6, by - size * 0.92, ow + ext + 12, size * 1.22, 5); x.fillStyle = "#ffe066"; x.fill(); }
        lx += ow + sp;
      });
      lx = a + px; ln.forEach(function (o) { say(x, o.t, lx, by, "400 " + size + "px " + SERIF, "#2b2a28"); lx += x.measureText(o.t).width + sp; x.font = "400 " + size + "px " + SERIF; });
    });
    var fy = ty + (lines.length - 1) * lh + 54 + 24;
    say(x, [blStarStr(S.bl.rating), blHoursTxt() && blHoursTxt().replace(/ h$/, " hours")].filter(Boolean).join(" · "), a + px, fy, "400 24px " + SANS, "#a29d93");
    say(x, one(x, S.bl.name + " on Backloggd", "400 24px " + SANS, iw / 2), a + w - px, fy, "400 24px " + SANS, "#a29d93", "right");
    var end = blUnder(x, c, b + h + 104, ["Backloggd", S.sub].filter(Boolean).join(" · "));
    return { sticker: Math.min(1700, end + 110), sign: Math.min(1840, end + 250), soft: c.soft };
  };
  var BL_OWN = { "bl-tv": 1, "bl-lock": 1, "bl-replay": 1, "bl-messages": 1 };   // the rest sit on the story's background
  Object.keys(BL).forEach(function (k) { FULL[k] = BL[k]; if (BL_OWN[k]) OWN_BG[k] = 1; });
  NO_KICKER["bl-lock"] = 1;
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
  // what each kind of story asks for: the figures, the moment you finished, your year
  var BL_NOW = /^bl-(tvcard|tv|win|launch|glass)$/, BL_DONE = /^bl-(phone|notifs|lock)$/, BL_YEAR = /^bl-(top|replay|grid)$/, BL_QUOTE = /^bl-(appstore|messages|books)$/;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function blMonthly() { return S.bl.period === "month"; }
  function blFields() {
    var on = !!(S.item && S.item.kind === "backloggd"), st = styleOf();
    $("blSec").hidden = !on; if (!on) return;
    $("blDone").hidden = !BL_DONE.test(st); $("blYear").hidden = !BL_YEAR.test(st); $("blQuote").hidden = !BL_QUOTE.test(st);
    $("blTimeOnly").hidden = st !== "bl-messages";
    $("blRating3").value = String(S.bl.rating); $("blHours3").value = S.bl.hours; $("blPlat3").value = S.bl.platform; $("blPlat3").closest(".field").hidden = st !== "bl-win";
    if (!S.bl.time) { var d = new Date(); S.bl.time = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); S.bl.date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).replace(",", ""); }
    var yy = "\u2019" + String(new Date().getFullYear()).slice(2);
    if (!S.bl.labelSet) S.bl.label = blMonthly() ? MONTHS[S.bl.month] + " " + yy : "Replay " + yy;   // follows the period until you write your own
    [].forEach.call($("blPeriod").children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === S.bl.period); });
    [].forEach.call($("blTint").children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === S.bl.tint); });
    $("blTintRow").hidden = !(st === "bl-replay" || st === "bl-top");
    $("blMonth").value = String(S.bl.month); $("blMonthRow").hidden = !blMonthly();
    $("blRTitle").value = S.bl.rtitle; $("blText").value = S.bl.text; $("blBest").value = S.bl.best; $("blName").value = S.bl.name; $("blDay").value = S.bl.day; $("blAsk").value = S.bl.ask; $("blTime2").value = S.bl.time;
    $("blRTitleRow").hidden = st !== "bl-appstore"; $("blAskRow").hidden = st !== "bl-messages";
    $("blTime").value = S.bl.time; $("blDate").value = S.bl.date; $("blNext").value = S.bl.next;
    $("blLabel").value = S.bl.label; $("blGames").value = S.bl.games; $("blTotal").value = S.bl.total;
    $("blFirst").textContent = "1 \u00B7 " + (S.title || S.bl.game.title || "this game") + " — its hours and rating are in the figures above";
    // the line on top follows the style until you write your own
    if (!S.kickerSet) { S.kicker = BL_DONE.test(st) ? "Just finished" : BL_YEAR.test(st) ? (blMonthly() ? "My " + MONTHS[S.bl.month] + " in games" : "My year in games") : st === "bl-messages" ? "Asked about it" : BL_QUOTE.test(st) ? "My review" : "Now playing"; $("kicker").value = S.kicker; }
    $("blSteam").value = S.bl.steam || "";
  }
  [["blHours3", "hours"], ["blPlat3", "platform"], ["blTime", "time"], ["blDate", "date"], ["blNext", "next"], ["blGames", "games"], ["blTotal", "total"],
   ["blRTitle", "rtitle"], ["blText", "text"], ["blBest", "best"], ["blName", "name"], ["blDay", "day"], ["blAsk", "ask"], ["blTime2", "time"]].forEach(function (p) {
    $(p[0]).addEventListener("input", function () { S.bl[p[1]] = this.value; draw(); });
  });
  $("blLabel").addEventListener("input", function () { S.bl.label = this.value; S.bl.labelSet = !!this.value.trim(); draw(); });
  $("blPeriod").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.bl.period = b.dataset.v; blFields(); draw(); });
  $("blTint").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.bl.tint = b.dataset.v; blFields(); draw(); });
  $("blMonth").addEventListener("change", function () { S.bl.month = +this.value; blFields(); draw(); });
  $("blRating3").addEventListener("change", function () { S.bl.rating = +this.value; draw(); });
  // the other four games of the year: a Backloggd link each, read like the first, with your hours and rating
  [].forEach.call(document.querySelectorAll("#blYearRows .ylink"), function (inp, i) {
    var row = inp.closest(".yrow"), slot = S.bl.year[i];
    inp.addEventListener("change", function () {
      var m = /backloggd\.com\/games\/([^\/?#\s]+)/.exec(this.value);
      if (!m) { S.bl.year[i] = { hours: slot.hours, rating: slot.rating }; slot = S.bl.year[i]; draw(); return; }
      var mine = slot.ask = {};
      fetch("https://backloggd.com/games/" + m[1] + "/", { cache: "no-cache" }).then(function (r) { return r.text(); }).then(function (html) {
        var g = blParse(html); if (!g || slot.ask !== mine) return;
        slot.game = g; row.querySelector(".yname").textContent = g.title;
        return loadImg(g.cover).then(function (im) { if (slot.ask === mine) { slot.cover = im; draw(); } });
      }).catch(function () { row.querySelector(".yname").textContent = "Couldn\u2019t read that page"; });
    });
    row.querySelector(".yhours").addEventListener("input", function () { slot.hours = this.value; draw(); });
    row.querySelector(".yrate").addEventListener("change", function () { slot.rating = +this.value; draw(); });
  });
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
