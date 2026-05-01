/**
 * Room relay + lobby for Shadow Arena online co-op (host-driven sim on a client).
 * Deploy separately (Railway/Render/Fly). Set ALLOWED_ORIGINS for production CORS.
 */
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT || 8787);
const ALLOWED = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(
  cors({
    origin: ALLOWED.length ? ALLOWED : true,
    credentials: true,
  })
);
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "shadow-arena-online",
    hint: "This host is Socket.IO relay only — open /health ; game uses MULTIPLAYER_SERVER_URL without a path.",
  });
});
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED.length ? ALLOWED : true,
    methods: ["GET", "POST"],
  },
  // Large JSON snapshots — bundle-level compression spikes CPU/jank on weaker clients decoding every tick.
  perMessageDeflate: false,
});

// Fixed-rate snapshot relay (host-driven sim).
// Clients interpolate/predict; server should broadcast at a stable cadence.
const SERVER_TICK_RATE = 20;
const SERVER_TICK_MS = Math.round(1000 / SERVER_TICK_RATE);

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRoomCode() {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function sanitizeDisplayName(raw) {
  let s = String(raw ?? "").trim().replace(/\s+/g, " ");
  s = s.replace(/[\x00-\x1f\x7f]/g, "");
  if (s.length > 20) s = s.slice(0, 20);
  if (!s) s = "Player";
  return s;
}

/** @type {Map<string, { code: string, hostId: string, members: Map<string, { seat: number, characterId: string, ready: boolean, displayName: string }>, started: boolean, latestSnap?: any, latestSnapAt?: number }>} */
const rooms = new Map();

function lobbyPayload(room) {
  const list = [];
  for (const [sid, m] of room.members) {
    list.push({
      socketId: sid,
      seat: m.seat,
      characterId: m.characterId,
      ready: m.ready,
      displayName: m.displayName || "Player",
      isHost: sid === room.hostId,
    });
  }
  list.sort((a, b) => a.seat - b.seat);
  return { code: room.code, started: room.started, players: list };
}

function nextFreeSeat(room) {
  const taken = new Set([...room.members.values()].map((m) => m.seat));
  for (let s = 0; s < 4; s++) if (!taken.has(s)) return s;
  return -1;
}

io.on("connection", (socket) => {
  socket.data.roomCode = null;

  socket.on("room:create", (a, b) => {
    /** Back-compat: `emit("room:create", ack)` or `emit("room:create", { displayName }, ack)` */
    let payload = {};
    let ack = b;
    if (typeof a === "function") {
      ack = a;
    } else if (typeof a === "object" && a !== null) {
      payload = a;
      ack = typeof b === "function" ? b : () => {};
    }
    if (typeof ack !== "function") return;
    let code = randomRoomCode();
    while (rooms.has(code)) code = randomRoomCode();
    const dn = sanitizeDisplayName(payload.displayName ?? payload.name);
    const room = {
      code,
      hostId: socket.id,
      members: new Map(),
      started: false,
    };
    room.members.set(socket.id, { seat: 0, characterId: "mage", ready: false, displayName: dn });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    ack({ ok: true, ...lobbyPayload(room) });
    io.to(code).emit("room:lobby", lobbyPayload(room));
  });

  socket.on("room:join", (payload, ack) => {
    if (typeof ack !== "function") return;
    const code = String(payload?.code || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    const room = rooms.get(code);
    if (!room || room.started) {
      ack({ ok: false, error: "Room not found or game already started." });
      return;
    }
    if (room.members.size >= 4) {
      ack({ ok: false, error: "Room is full." });
      return;
    }
    const seat = nextFreeSeat(room);
    if (seat < 0) {
      ack({ ok: false, error: "Room is full." });
      return;
    }
    const dnJoin = sanitizeDisplayName(payload?.displayName ?? payload?.name);
    room.members.set(socket.id, {
      seat,
      characterId: "mage",
      ready: false,
      displayName: dnJoin,
    });
    socket.join(code);
    socket.data.roomCode = code;
    ack({ ok: true, ...lobbyPayload(room), yourSeat: seat });
    io.to(code).emit("room:lobby", lobbyPayload(room));
  });

  socket.on("room:leave", () => {
    leaveRoom(socket, false);
  });

  socket.on("lobby:setDisplayName", (payload) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room || room.started) return;
    const m = room.members.get(socket.id);
    if (!m) return;
    m.displayName = sanitizeDisplayName(payload?.displayName ?? payload?.name);
    io.to(code).emit("room:lobby", lobbyPayload(room));
  });

  socket.on("lobby:setCharacter", (payload) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room || room.started) return;
    const m = room.members.get(socket.id);
    if (!m) return;
    const cid = typeof payload?.characterId === "string" ? payload.characterId : "mage";
    m.characterId = cid.slice(0, 24);
    io.to(code).emit("room:lobby", lobbyPayload(room));
  });

  socket.on("lobby:setReady", (payload) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room || room.started) return;
    const m = room.members.get(socket.id);
    if (!m) return;
    m.ready = !!payload?.ready;
    io.to(code).emit("room:lobby", lobbyPayload(room));
  });

  socket.on("room:start", (_payload, ack) => {
    if (typeof ack !== "function") return;
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room || room.started) {
      ack({ ok: false, error: "Cannot start." });
      return;
    }
    if (socket.id !== room.hostId) {
      ack({ ok: false, error: "Only the host can start." });
      return;
    }
    if (room.members.size < 1) {
      ack({ ok: false, error: "Need at least one player." });
      return;
    }
    for (const m of room.members.values()) {
      if (!m.ready) {
        ack({ ok: false, error: "All players must ready up." });
        return;
      }
    }
    room.started = true;
    const roster = [...room.members.entries()]
      .map(([_socketId, m]) => ({
        seat: m.seat,
        characterId: m.characterId,
        displayName: m.displayName || "Player",
      }))
      .sort((a, b) => a.seat - b.seat);
    ack({ ok: true, roster });
    io.to(code).emit("game:start", { roster });
  });

  /** Host broadcasts world state */
  socket.on("game:snapshot", (snap) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room || !room.started || socket.id !== room.hostId) return;
    // Store only; broadcast happens on fixed tick below.
    room.latestSnap = snap;
    room.latestSnapAt = Date.now();
  });

  /** Non-host movement / intent */
  socket.on("game:input", (payload) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room || !room.started || socket.id === room.hostId) return;
    const m = room.members.get(socket.id);
    if (!m) return;
    const seqRaw = payload?.seq;
    const seq =
      typeof seqRaw === "number" && Number.isFinite(seqRaw) ? Math.floor(seqRaw) : undefined;
    io.to(room.hostId).emit("game:inputRelay", {
      seat: m.seat,
      ax: Number(payload?.ax) || 0,
      ay: Number(payload?.ay) || 0,
      ...(seq !== undefined ? { seq } : {}),
    });
  });

  socket.on("game:upgradePick", (payload) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room || !room.started || socket.id === room.hostId) return;
    io.to(room.hostId).emit("game:upgradePickRelay", {
      seat: room.members.get(socket.id)?.seat ?? 0,
      upgradeId: String(payload?.upgradeId || ""),
    });
  });

  socket.on("disconnect", () => {
    leaveRoom(socket, true);
  });
});

// Fixed tick broadcast loop (20 Hz). Keeps network + client decode stable.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.started) continue;
    const snap = room.latestSnap;
    if (!snap) continue;

    // Stamp server time so clients can jitter-buffer without relying on host clocks.
    try {
      snap.__srvMs = now;
    } catch {
      //
    }

    // Broadcast to everyone except host (host already simulates locally).
    try {
      io.to(room.code).except(room.hostId).emit("game:snapshot", snap);
    } catch {
      // Older socket.io builds may not support `.except`; fall back to room emit.
      io.to(room.code).emit("game:snapshot", snap);
    }
  }
}, SERVER_TICK_MS);

function leaveRoom(socket, isDisconnect) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  const wasHost = socket.id === room.hostId;
  room.members.delete(socket.id);
  socket.leave(code);
  socket.data.roomCode = null;

  if (wasHost) {
    io.to(code).emit("room:hostDisconnected", {});
    rooms.delete(code);
    return;
  }
  if (room.members.size === 0) {
    rooms.delete(code);
    return;
  }
  if (!room.started) {
    io.to(code).emit("room:lobby", lobbyPayload(room));
  } else {
    io.to(code).emit("room:peerLeft", { remaining: room.members.size });
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[online] listening on ${PORT}  (health: http://127.0.0.1:${PORT}/health)`);
});
