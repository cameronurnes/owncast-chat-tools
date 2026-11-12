(function () {
  "use strict";
  if (window.__chatToolsLoaded) return;
  window.__chatToolsLoaded = true;

  var BASE = "/plugins/chat-tools";
  var users = [];
  var open = false;

  var root = document.createElement("div");
  root.id = "chat-tools";
  var button = document.createElement("button");
  button.type = "button";
  button.className = "rt-toggle";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "chat-tools-panel");
  var count = document.createElement("span");
  count.className = "rt-count";
  var label = document.createElement("span");
  label.className = "rt-label";
  label.textContent = "in chat";
  button.appendChild(count);
  button.appendChild(label);
  var panel = document.createElement("div");
  panel.id = "chat-tools-panel";
  panel.className = "rt-panel";
  panel.hidden = true;
  var heading = document.createElement("div");
  heading.className = "rt-heading";
  heading.textContent = "In chat";
  var list = document.createElement("ul");
  list.className = "rt-list";
  panel.appendChild(heading);
  panel.appendChild(list);
  root.appendChild(button);
  root.appendChild(panel);

  var loaded = false;

  function render() {
    // Until the first answer arrives, show a dash, not a misleading 0.
    count.textContent = loaded ? String(users.length) : "\u2013";
    button.title = "Show who is in chat";
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!users.length) {
      var empty = document.createElement("li");
      empty.className = "rt-empty";
      empty.textContent = "Nobody yet";
      list.appendChild(empty);
      return;
    }
    users.forEach(function (u) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.className = "rt-name";
      name.textContent = u.name; // textContent: names are never treated as HTML
      li.appendChild(name);
      if (u.mod) {
        // Owncast's own moderator shield (MIT licensed, from the Owncast project).
        var badge = document.createElement("img");
        badge.className = "rt-mod";
        badge.src = BASE + "/moderator.svg";
        badge.alt = "Moderator";
        badge.title = "Moderator";
        li.insertBefore(badge, name);
      }
      list.appendChild(li);
    });
  }

  function setUsers(next) {
    if (Array.isArray(next)) {
      users = next;
      loaded = true;
      render();
    }
  }

  function refresh() {
    fetch(BASE + "/api/users", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) setUsers(d.users); })
      .catch(function () {});
  }

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) refresh();
  }

  button.addEventListener("click", function (e) {
    e.stopPropagation();
    setOpen(!open);
  });
  document.addEventListener("click", function (e) {
    if (open && !root.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (open && e.key === "Escape") { setOpen(false); button.focus(); }
  });

  // Sit in the page header, just left of Owncast's own user menu. The element
  // lives in <body> (not inside Owncast's React tree) and is only positioned
  // to line up with the header, so Owncast re-rendering never disturbs it.
  // Owncast only renders the user menu while chat is available, so when it is
  // missing (stream offline, chat disabled) the button is hidden altogether.
  function place() {
    var menu = document.getElementById("user-menu");
    if (!menu) {
      if (open) setOpen(false);
      root.hidden = true;
      return;
    }
    root.hidden = false;
    var header = document.querySelector("header");
    var h = header ? header.getBoundingClientRect() : { top: 0, height: 44 };
    var height = root.offsetHeight || 28;
    var m = menu.getBoundingClientRect();
    root.style.top = Math.max(0, h.top + (h.height - height) / 2) + "px";
    root.style.right = Math.max(8, window.innerWidth - m.left + 8) + "px";
  }

  // ---- Inline image previews -------------------------------------------
  // Owncast turns URLs in chat into plain links. For links that point at an
  // image, add a preview under the link. Nothing is sent to the server and
  // the chat message itself is unchanged.
  var previewsActive = false;
  var settings = { inlineImages: false, imageHosts: [], giphyApiKey: "", giphyRating: "pg-13", allowUploads: false, maxUploadBytes: 0 };
  var IMAGE_EXT = /\.(gif|png|jpe?g|webp|avif)$/i;
  // GIF services whose direct media links have no file extension.
  var MEDIA_HOSTS = /^(media\d*\.giphy\.com|i\.giphy\.com|media\d*\.tenor\.com|c\.tenor\.com)$/i;

  function hostAllowed(host) {
    if (!settings.imageHosts.length) return true;
    host = host.toLowerCase();
    return settings.imageHosts.some(function (h) {
      return host === h || host.endsWith("." + h);
    });
  }

  // GIFs picked from the search and images uploaded here are the plugin's own
  // content: they always get a preview. The inlineImages setting only decides
  // whether links people paste from elsewhere are previewed too.
  function isOwnContent(url) {
    return MEDIA_HOSTS.test(url.hostname) ||
      (url.origin === location.origin && url.pathname.indexOf("/public/plugins/chat-tools/") === 0);
  }

  function imageUrlFor(a) {
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return null; }
    if (isOwnContent(url)) return url.href;
    if (!settings.inlineImages) return null;
    var sameSite = url.origin === location.origin;
    if (url.protocol !== "https:" && !sameSite) return null;
    if (!sameSite && !hostAllowed(url.hostname)) return null;
    if (IMAGE_EXT.test(url.pathname)) return url.href;
    return null;
  }

  function addPreview(a) {
    if (a.getAttribute("data-rt-seen")) return;
    a.setAttribute("data-rt-seen", "1");
    var src = imageUrlFor(a);
    if (!src) return;
    var wrap = document.createElement("a");
    wrap.className = "rt-preview";
    wrap.href = src;
    wrap.rel = "noopener noreferrer";
    wrap.setAttribute("data-rt-seen", "1");
    wrap.setAttribute("aria-label", "View image larger");
    wrap.addEventListener("click", function (e) {
      // Plain click opens the overlay; ctrl/cmd/middle click still opens a tab.
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      openLightbox(src);
    });
    var img = document.createElement("img");
    img.alt = "Image posted in chat";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function () { wrap.remove(); });
    // An image only gets its height once it loads, which would leave the chat
    // scrolled short of the end. If the reader was at the bottom, stay there.
    var scroller = a.closest("[data-virtuoso-scroller], [data-testid='virtuoso-scroller']");
    var wasAtBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    img.addEventListener("load", function () {
      // Uploads past their retention period are replaced by a 1x1 placeholder.
      if (img.naturalWidth <= 1 && img.naturalHeight <= 1) {
        var gone = document.createElement("span");
        gone.className = "rt-expired";
        gone.textContent = "Image expired";
        wrap.replaceWith(gone);
        return;
      }
      if (scroller && wasAtBottom) scroller.scrollTop = scroller.scrollHeight;
    });
    img.src = src;
    wrap.appendChild(img);
    a.insertAdjacentElement("afterend", wrap);
    // GIF-picker and upload links are long and meaningless to read, so the
    // preview stands in for them. Other links stay visible above their preview.
    try {
      var u = new URL(src);
      if (isOwnContent(u)) {
        a.classList.add("rt-link-hidden");
        img.addEventListener("error", function () { a.classList.remove("rt-link-hidden"); });
      }
    } catch (err) {}
  }

  // ---- Full-size overlay ------------------------------------------------
  var lightbox = null;
  var lightboxReturnFocus = null;

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.remove();
    lightbox = null;
    if (lightboxReturnFocus && lightboxReturnFocus.focus) lightboxReturnFocus.focus();
    lightboxReturnFocus = null;
  }

  function openLightbox(src) {
    closeLightbox();
    lightboxReturnFocus = document.activeElement;
    lightbox = document.createElement("div");
    lightbox.id = "chat-tools-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Image posted in chat");
    var close = document.createElement("button");
    close.type = "button";
    close.className = "rt-close";
    close.textContent = "Close";
    var img = document.createElement("img");
    img.alt = "Image posted in chat";
    img.referrerPolicy = "no-referrer";
    // Small images are enlarged to fill the overlay (up to 4x, beyond which
    // they just look blurry); large ones are shrunk to fit.
    var fit = function () {
      if (!lightbox || !img.naturalWidth) return;
      var box = lightbox.getBoundingClientRect();
      var cs = getComputedStyle(lightbox);
      var w = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var h = box.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var scale = Math.min(w / img.naturalWidth, h / img.naturalHeight, 4);
      img.style.width = Math.max(1, Math.floor(img.naturalWidth * scale)) + "px";
      img.style.height = "auto";
    };
    img.addEventListener("load", fit);
    window.addEventListener("resize", fit);
    img.src = src;
    lightbox.appendChild(close);
    lightbox.appendChild(img);
    // Clicking the backdrop or the button closes; clicking the image does not.
    lightbox.addEventListener("click", function (e) {
      if (e.target !== img) closeLightbox();
    });
    document.body.appendChild(lightbox);
    close.focus();
  }

  document.addEventListener("keydown", function (e) {
    if (lightbox && e.key === "Escape") closeLightbox();
  });

  function scanChat(scope) {
    if (!previewsActive) return;
    var chat = document.getElementById("chat-container");
    if (!chat) return;
    var links = (scope && scope.querySelectorAll ? scope : chat).querySelectorAll("a[href]:not([data-rt-seen])");
    for (var i = 0; i < links.length; i++) {
      if (chat.contains(links[i])) addPreview(links[i]);
    }
  }

  // ---- Sending into chat ------------------------------------------------
  // Puts text into Owncast's own chat box and presses Enter, so the message
  // is sent by the viewer exactly as if they had typed it.
  function sendToChat(text) {
    var box = document.getElementById("chat-input-content-editable");
    if (!box) return false;
    box.focus();
    var sel = window.getSelection();
    if (sel) { sel.selectAllChildren(box); sel.collapseToEnd(); }
    var existing = (box.textContent || "").trim();
    document.execCommand("insertText", false, (existing ? " " : "") + text);
    if (!existing) {
      var opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
      box.dispatchEvent(new KeyboardEvent("keydown", opts));
      box.dispatchEvent(new KeyboardEvent("keyup", opts));
    }
    return true;
  }

  function token() {
    try { return JSON.parse(localStorage.getItem("accessToken")) || ""; }
    catch (err) { return localStorage.getItem("accessToken") || ""; }
  }

  // ---- Buttons inside the chat box ---------------------------------------
  // The GIF and image buttons sit beside Owncast's own emoji and send buttons
  // and borrow the emoji button's styling so they match. The search panel
  // and status line float just above the chat box.
  var floater = document.createElement("div");
  floater.id = "chat-tools-float";
  var status = document.createElement("div");
  status.className = "rt-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  floater.appendChild(status);
  var gifButton = null;
  var uploadButton = null;
  var picker = null;
  var statusTimer = null;
  var SVG_NS = "http://www.w3.org/2000/svg";

  function setStatus(text, isError) {
    clearTimeout(statusTimer);
    status.textContent = text || "";
    status.hidden = !text;
    status.classList.toggle("rt-error", !!isError);
    if (text && isError) statusTimer = setTimeout(function () { setStatus(""); }, 8000);
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function icon(kind) {
    var svg = svgEl("svg", { viewBox: "0 0 24 24", width: "1em", height: "1em", fill: "none",
      stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round",
      "aria-hidden": "true", focusable: "false" });
    svg.appendChild(svgEl("rect", { x: "2.5", y: "4.5", width: "19", height: "15", rx: "3" }));
    if (kind === "gif") {
      var t = svgEl("text", { x: "12", y: "15.2", "text-anchor": "middle", "font-size": "8", "font-weight": "700",
        "font-family": "system-ui, sans-serif", fill: "currentColor", stroke: "none" });
      t.textContent = "GIF";
      svg.appendChild(t);
    } else {
      svg.appendChild(svgEl("circle", { cx: "8.5", cy: "10", r: "1.6" }));
      svg.appendChild(svgEl("path", { d: "M3.5 17.5l5-4.5 3.5 3 3.5-4 5 5.5" }));
    }
    return svg;
  }

  function makeBarButton(kind, label) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.setAttribute("data-rt-button", kind);
    b.appendChild(icon(kind));
    return b;
  }

  function placeToolbar() {
    var input = document.getElementById("chat-input");
    var emoji = document.getElementById("owncast-emoji-picker-button");
    var send = document.getElementById("owncast-send-message-button");
    var row = send && send.parentNode;
    if (!input || !row) {
      closePicker();
      floater.hidden = true;
      return;
    }
    // Match whatever classes Owncast gives its own emoji button.
    var cls = ((emoji && emoji.className) || "") + " rt-icon-button";
    [uploadButton, gifButton].forEach(function (b) {
      if (!b) return;
      if (b.className !== cls) b.className = cls;
      if (b.parentNode !== row) row.insertBefore(b, row.firstChild);
    });
    var r = input.getBoundingClientRect();
    floater.hidden = false;
    floater.style.left = r.left + "px";
    floater.style.width = r.width + "px";
    floater.style.bottom = Math.max(0, window.innerHeight - r.top + 6) + "px";
  }

  // ---- GIF picker ----------------------------------------------------------
  var gifTimer = null;
  var gifRequest = 0;

  function closePicker() {
    if (!picker) return;
    picker.remove();
    picker = null;
    if (gifButton) gifButton.setAttribute("aria-expanded", "false");
  }

  function loadGifs(query, grid) {
    var mine = ++gifRequest;
    var url = "https://api.giphy.com/v1/gifs/" + (query ? "search" : "trending") +
      "?api_key=" + encodeURIComponent(settings.giphyApiKey) +
      "&limit=24&rating=" + encodeURIComponent(settings.giphyRating) +
      (query ? "&q=" + encodeURIComponent(query.slice(0, 50)) : "");
    fetch(url)
      .then(function (r) {
        if (r.status === 429) throw new Error("GIF search is busy. Try again in a few minutes.");
        if (!r.ok) throw new Error("GIF search is unavailable right now.");
        return r.json();
      })
      .then(function (d) {
        if (mine !== gifRequest || !picker) return;
        while (grid.firstChild) grid.removeChild(grid.firstChild);
        var items = (d && d.data) || [];
        if (!items.length) {
          var none = document.createElement("div");
          none.className = "rt-gif-empty";
          none.textContent = "No GIFs found.";
          grid.appendChild(none);
          return;
        }
        items.forEach(function (g) {
          var im = g.images || {};
          var thumb = (im.fixed_height_small || im.fixed_height || im.downsized || {}).url;
          var full = (im.downsized || im.original || im.fixed_height || {}).url;
          if (!thumb || !full) return;
          var b = document.createElement("button");
          b.type = "button";
          b.className = "rt-gif";
          var img = document.createElement("img");
          img.src = thumb;
          img.alt = g.title || "GIF";
          img.loading = "lazy";
          b.appendChild(img);
          b.addEventListener("click", function () {
            closePicker();
            if (!sendToChat(full)) setStatus("Chat is not available.", true);
          });
          grid.appendChild(b);
        });
      })
      .catch(function (err) {
        if (mine !== gifRequest || !picker) return;
        while (grid.firstChild) grid.removeChild(grid.firstChild);
        var fail = document.createElement("div");
        fail.className = "rt-gif-empty";
        fail.textContent = (err && err.message) || "GIF search is unavailable right now.";
        grid.appendChild(fail);
      });
  }

  function openPicker() {
    closePicker();
    picker = document.createElement("div");
    picker.id = "chat-tools-gifs";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "GIF search");
    var search = document.createElement("input");
    search.type = "search";
    search.className = "rt-gif-search";
    search.placeholder = "Search GIPHY";
    search.setAttribute("aria-label", "Search GIPHY");
    var grid = document.createElement("div");
    grid.className = "rt-gif-grid";
    var credit = document.createElement("div");
    credit.className = "rt-gif-credit";
    credit.textContent = "Powered By GIPHY";
    picker.appendChild(search);
    picker.appendChild(grid);
    picker.appendChild(credit);
    search.addEventListener("input", function () {
      clearTimeout(gifTimer);
      gifTimer = setTimeout(function () { loadGifs(search.value.trim(), grid); }, 400);
    });
    picker.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closePicker(); gifButton.focus(); }
    });
    floater.appendChild(picker);
    gifButton.setAttribute("aria-expanded", "true");
    search.focus();
    loadGifs("", grid);
  }

  document.addEventListener("click", function (e) {
    if (picker && !floater.contains(e.target) && !(gifButton && gifButton.contains(e.target))) closePicker();
  });

  // ---- Upload --------------------------------------------------------------
  var uploading = false;

  function api(path, body, type) {
    var sep = path.indexOf("?") === -1 ? "?" : "&";
    return fetch(BASE + path + sep + "accessToken=" + encodeURIComponent(token()), {
      method: "POST",
      headers: { "Content-Type": type || "application/json" },
      body: body,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "Upload failed. Please try again.");
        return d;
      });
    });
  }

  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var parts = [];
    for (var i = 0; i < bytes.length; i += 0x8000) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    }
    return btoa(parts.join(""));
  }

  function uploadFile(file) {
    if (uploading) return;
    if (!/^image\/(gif|png|jpeg|webp)$/.test(file.type)) {
      setStatus("Only GIF, PNG, JPEG and WebP images can be uploaded.", true);
      return;
    }
    if (file.size > settings.maxUploadBytes) {
      setStatus("That file is too large. The limit is " + Math.round(settings.maxUploadBytes / 1048576) + " MB.", true);
      return;
    }
    uploading = true;
    uploadButton.disabled = true;
    setStatus("Uploading 0%");
    api("/api/upload/start", JSON.stringify({ size: file.size }))
      .then(function (start) {
        var i = 0;
        function next() {
          if (i >= start.chunks) return api("/api/upload/finish?id=" + start.id, "");
          var slice = file.slice(i * start.chunkBytes, (i + 1) * start.chunkBytes);
          return slice.arrayBuffer().then(function (buf) {
            return api("/api/upload/chunk?id=" + start.id + "&i=" + i, toBase64(buf), "text/plain");
          }).then(function () {
            i++;
            setStatus("Uploading " + Math.round((i / start.chunks) * 100) + "%");
            return next();
          });
        }
        return next();
      })
      .then(function (done) {
        setStatus("");
        var link = new URL(done.url, location.origin).href;
        if (!sendToChat(link)) setStatus("Uploaded, but chat is not available.", true);
      })
      .catch(function (err) {
        setStatus((err && err.message) || "Upload failed. Please try again.", true);
      })
      .then(function () {
        uploading = false;
        uploadButton.disabled = false;
      });
  }

  function buildToolbar() {
    if (settings.giphyApiKey) {
      gifButton = makeBarButton("gif", "Search for a GIF");
      gifButton.setAttribute("aria-expanded", "false");
      gifButton.addEventListener("click", function (e) {
        e.stopPropagation();
        if (picker) closePicker(); else openPicker();
      });
    }
    if (settings.allowUploads) {
      var chooser = document.createElement("input");
      chooser.type = "file";
      chooser.accept = "image/gif,image/png,image/jpeg,image/webp";
      chooser.hidden = true;
      chooser.addEventListener("change", function () {
        if (chooser.files && chooser.files[0]) uploadFile(chooser.files[0]);
        chooser.value = "";
      });
      floater.appendChild(chooser);
      uploadButton = makeBarButton("image", "Upload an image or GIF");
      uploadButton.addEventListener("click", function () { setStatus(""); chooser.click(); });
    }
    if (!gifButton && !uploadButton) return;
    document.body.appendChild(floater);
    placeToolbar();
    window.addEventListener("resize", placeToolbar);
    setInterval(placeToolbar, 500); // Owncast rebuilds the chat column as chat comes and goes
  }

  function startExtras() {
    fetch(BASE + "/api/settings", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        settings = {
          inlineImages: !!d.inlineImages,
          imageHosts: d.imageHosts || [],
          giphyApiKey: d.giphyApiKey || "",
          giphyRating: d.giphyRating || "pg-13",
          allowUploads: !!d.allowUploads,
          maxUploadBytes: d.maxUploadBytes || 0,
        };
        buildToolbar();
        previewsActive = settings.inlineImages || !!settings.giphyApiKey || settings.allowUploads;
        if (!previewsActive) return;
        scanChat();
        // The chat column is created, destroyed and recycled by Owncast as
        // people scroll and as chat comes and goes, so watch the whole page.
        new MutationObserver(function () { scanChat(); })
          .observe(document.body, { childList: true, subtree: true });
      })
      .catch(function () {});
  }

  function mount() {
    if (!document.body) return setTimeout(mount, 200);
    document.body.appendChild(root);
    render();
    place();
    refresh();
    startExtras();
    window.addEventListener("resize", place);
    setInterval(place, 1000); // the header changes as chat/login state changes
    // This viewer's own chat connection is made a moment after the page loads,
    // so the first answer can miss them. Ask again a few times early on, and
    // whenever chat becomes available.
    [1000, 2500, 5000, 10000].forEach(function (ms) { setTimeout(refresh, ms); });
    var hadMenu = false;
    setInterval(function () {
      var has = !!document.getElementById("user-menu");
      if (has && !hadMenu) { refresh(); setTimeout(refresh, 1500); }
      hadMenu = has;
    }, 1000);
    try {
      var es = new EventSource(BASE + "/_sse/room");
      es.addEventListener("open", refresh);
      es.addEventListener("users", function (e) {
        try { setUsers(JSON.parse(e.data).users); } catch (err) {}
      });
    } catch (err) {}
    // Fallback in case live updates are unavailable (e.g. connection cap reached).
    setInterval(refresh, 30000);
  }
  mount();
})();
