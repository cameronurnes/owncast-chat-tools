const { definePlugin, owncast } = require("@owncast/plugin-sdk");

// ---- Who is in chat --------------------------------------------------------

// One entry per display name, however many tabs or devices that person has open.
// Only the name and moderator flag are exposed: no IP
// addresses, user agents or ids leave the server.
function currentUsers() {
  const seen = new Set();
  const users = [];
  for (const client of owncast.chat.clients()) {
    const name = (client.displayName || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    let mod = false;
    if (client.userId) {
      try {
        const u = owncast.users.get(client.userId);
        mod = !!u && Array.isArray(u.scopes) && u.scopes.includes("MODERATOR");
      } catch (err) {
        // A failed lookup just means no marker for this person.
      }
    }
    users.push({ name, mod });
  }
  users.sort(
    (a, b) =>
      Number(b.mod) - Number(a.mod) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  return users;
}

function broadcast() {
  owncast.sse.send("room", "users", { users: currentUsers() });
}

// ---- Helpers ---------------------------------------------------------------

function json(status, data) {
  return {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data),
  };
}

function numberSetting(key, fallback, min, max) {
  const n = Number(owncast.config.get(key, fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

// Decodes standard base64. Returns null on any character outside the alphabet.
function decodeBase64(text) {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 61) end--; // strip "="
  const out = new Uint8Array(Math.floor((end * 3) / 4));
  const T = B64_LOOKUP;
  const whole = end - (end % 4);
  let o = 0;
  let bad = 0;
  for (let i = 0; i < whole; i += 4) {
    const a = T[text.charCodeAt(i) & 127];
    const b = T[text.charCodeAt(i + 1) & 127];
    const c = T[text.charCodeAt(i + 2) & 127];
    const d = T[text.charCodeAt(i + 3) & 127];
    bad |= a | b | c | d; // any -1 sets the sign bit
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (n >> 16) & 0xff;
    out[o++] = (n >> 8) & 0xff;
    out[o++] = n & 0xff;
  }
  const rest = end - whole;
  if (rest === 1) return null;
  if (rest >= 2) {
    const a = T[text.charCodeAt(whole) & 127];
    const b = T[text.charCodeAt(whole + 1) & 127];
    bad |= a | b;
    out[o++] = ((a << 2) | (b >> 4)) & 0xff;
    if (rest === 3) {
      const c = T[text.charCodeAt(whole + 2) & 127];
      bad |= c;
      out[o++] = ((b << 4) | (c >> 2)) & 0xff;
    }
  }
  if (bad < 0) return null;
  for (let i = 0; i < end; i += 4096) if (text.charCodeAt(i) > 127) return null; // cheap non-ASCII guard
  return out;
}

// Identify the file from its first bytes; the browser's claimed type is ignored.
function sniffImage(b) {
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "webp";
  return null;
}

// Math.random alone repeats after a plugin reload, so mix in the clock and a
// counter to keep ids (and uploaded file names) unique.
let idCounter = 0;
function randomId() {
  let s = Date.now().toString(36) + (idCounter++).toString(36);
  for (let i = 0; i < 12; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)];
  return s;
}

// ---- Uploads ---------------------------------------------------------------
// Owncast caps a plugin request at 1 MB, so the browser sends a file in
// chunks. Chunks are kept in the plugin's private storage until the last one
// arrives, then joined and published.

// Kept small on purpose: the plugin handles one thing at a time, and a big
// chunk would hold up chat events (and the user list) while it is decoded.
const CHUNK_BYTES = 128 * 1024;
const UPLOAD_TTL_MS = 10 * 60 * 1000;
const uploads = new Map(); // id -> { userId, size, chunks, received, startedAt }
const recentByUser = new Map(); // userId -> [timestamps of finished uploads]

function dropUpload(id) {
  const u = uploads.get(id);
  if (!u) return;
  for (let i = 0; i < u.received; i++) owncast.fs.delete("uploads/" + id + "/" + i);
  if (u.received > 0) owncast.fs.delete("uploads/" + id);
  uploads.delete(id);
}

function expireUploads() {
  const now = Date.now();
  for (const [id, u] of uploads) if (now - u.startedAt > UPLOAD_TTL_MS) dropUpload(id);
}

function uploadsLeft(userId) {
  const limit = numberSetting("uploadsPerHour", 20, 1, 1000);
  const cutoff = Date.now() - 3600 * 1000;
  const recent = (recentByUser.get(userId) || []).filter((t) => t > cutoff);
  recentByUser.set(userId, recent);
  return limit - recent.length;
}

// ---- Upload retention --------------------------------------------------------
// Owncast gives plugins no way to delete a published file, so an expired upload
// is overwritten with a 1x1 transparent GIF instead. That frees the space, and
// the viewer page shows "Image expired" where the picture used to be.

const INDEX_FILE = "uploads-index.json";
const EXPIRED_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function readIndex() {
  try {
    if (!owncast.fs.exists(INDEX_FILE)) return [];
    const list = JSON.parse(owncast.fs.readText(INDEX_FILE) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function writeIndex(list) {
  owncast.fs.write(INDEX_FILE, JSON.stringify(list));
}

function recordUpload(name) {
  const list = readIndex();
  list.push({ name, at: Date.now() });
  writeIndex(list);
}

// Expires at most a handful per pass so a big backlog never holds up chat.
function expireOldUploads() {
  const days = numberSetting("uploadRetentionDays", 30, 0, 3650);
  if (days <= 0) return;
  const cutoff = Date.now() - days * 86400 * 1000;
  const list = readIndex();
  const keep = [];
  let expired = 0;
  for (const entry of list) {
    if (entry && entry.at < cutoff && expired < 25) {
      const r = owncast.storage.upload(entry.name, EXPIRED_GIF);
      if (r && r.url) { expired++; continue; }
    }
    keep.push(entry);
  }
  if (expired) {
    writeIndex(keep);
    owncast.log.info("expired " + expired + " uploaded image(s) older than " + days + " day(s)");
  }
}

let lastExpiryCheck = 0;
function maybeExpire() {
  if (Date.now() - lastExpiryCheck < 3600 * 1000) return;
  lastExpiryCheck = Date.now();
  try { expireOldUploads(); } catch (err) { owncast.log.error("upload expiry failed: " + err); }
}

function handleUpload(req) {
  if (owncast.config.get("allowUploads", true) === false) return json(403, { error: "Uploads are turned off." });
  if (!req.user || !req.user.id) return json(401, { error: "Join chat before uploading." });
  const userId = req.user.id;
  const maxBytes = Math.floor(numberSetting("maxUploadMB", 10, 0.1, 50) * 1024 * 1024);
  expireUploads();

  if (req.path === "/api/upload/start") {
    let body;
    try { body = JSON.parse(req.body || "{}"); } catch (err) { return json(400, { error: "Bad request." }); }
    const size = Number(body.size);
    if (!Number.isInteger(size) || size <= 0) return json(400, { error: "Bad request." });
    if (size > maxBytes) return json(413, { error: "That file is too large. The limit is " + Math.round(maxBytes / 1048576) + " MB." });
    if (uploadsLeft(userId) <= 0) return json(429, { error: "Upload limit reached. Try again later." });
    for (const [id, u] of uploads) if (u.userId === userId) dropUpload(id); // one at a time per person
    const id = randomId();
    uploads.set(id, { userId, size, chunks: Math.ceil(size / CHUNK_BYTES), received: 0, startedAt: Date.now() });
    return json(200, { id, chunkBytes: CHUNK_BYTES, chunks: Math.ceil(size / CHUNK_BYTES) });
  }

  const u = uploads.get(req.query.id || "");
  if (!u || u.userId !== userId) return json(404, { error: "Upload expired. Please try again." });

  if (req.path === "/api/upload/chunk") {
    const index = Number(req.query.i);
    if (index !== u.received) return json(409, { error: "Upload out of order. Please try again." });
    const bytes = decodeBase64(req.body || "");
    const expected = index === u.chunks - 1 ? u.size - CHUNK_BYTES * (u.chunks - 1) : CHUNK_BYTES;
    if (!bytes || bytes.length !== expected) return json(400, { error: "Upload was corrupted. Please try again." });
    if (index === 0 && !sniffImage(bytes)) {
      dropUpload(req.query.id);
      return json(415, { error: "Only GIF, PNG, JPEG and WebP images can be uploaded." });
    }
    const w = owncast.fs.write("uploads/" + req.query.id + "/" + index, bytes);
    if (w && w.error) return json(500, { error: "The server could not store the upload." });
    u.received++;
    return json(200, { received: u.received });
  }

  if (req.path === "/api/upload/finish") {
    if (u.received !== u.chunks) return json(409, { error: "Upload incomplete. Please try again." });
    const all = new Uint8Array(u.size);
    let offset = 0;
    for (let i = 0; i < u.chunks; i++) {
      const part = owncast.fs.read("uploads/" + req.query.id + "/" + i);
      if (!part) { dropUpload(req.query.id); return json(500, { error: "The server lost part of the upload." }); }
      all.set(part, offset);
      offset += part.length;
    }
    const ext = sniffImage(all);
    dropUpload(req.query.id);
    if (!ext || offset !== all.length) return json(400, { error: "Upload was corrupted. Please try again." });
    const fileName = "chat-tools-" + randomId() + "." + ext;
    const result = owncast.storage.upload(fileName, all);
    if (!result || !result.url) return json(500, { error: "The server could not publish the image." });
    recordUpload(fileName);
    recentByUser.get(userId).push(Date.now());
    return json(200, { url: result.url });
  }

  return json(404, { error: "Not found." });
}

// ---- Plugin ----------------------------------------------------------------

module.exports = definePlugin({
  // Fires about once a second; the check itself only does work once an hour.
  onTick() {
    maybeExpire();
  },
  onChatUserJoined() {
    broadcast();
  },
  onChatUserParted() {
    broadcast();
  },
  onChatUserRenamed() {
    broadcast();
  },

  onHttpRequest(req) {
    if (req.method === "GET" && req.path === "/api/users") {
      return json(200, { users: currentUsers() });
    }
    if (req.method === "GET" && req.path === "/api/settings") {
      const hosts = String(owncast.config.get("imageHosts", "") || "")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
      const rating = String(owncast.config.get("giphyRating", "pg-13") || "pg-13").toLowerCase();
      return json(200, {
        inlineImages: owncast.config.get("inlineImages", true) !== false,
        imageHosts: hosts,
        giphyApiKey:
          owncast.config.get("gifSearch", true) === false
            ? ""
            : String(owncast.config.get("giphyApiKey", "") || "").trim(),
        giphyRating: ["g", "pg", "pg-13", "r"].includes(rating) ? rating : "pg-13",
        allowUploads: owncast.config.get("allowUploads", true) !== false,
        maxUploadBytes: Math.floor(numberSetting("maxUploadMB", 10, 0.1, 50) * 1024 * 1024),
        signedIn: !!(req.user && req.user.id),
      });
    }
    if (req.method === "POST" && req.path.indexOf("/api/upload/") === 0) {
      return handleUpload(req);
    }
    return json(404, { error: "Not found." });
  },
});
