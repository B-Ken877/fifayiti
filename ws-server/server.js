/**
 * FIFAYITI Live Broadcast WebSocket Server (HD MJPEG Binary)
 * ==========================================================
 *
 * Runs on port 4070. Handles:
 *   - 3 cameramen (slot 1, 2, 3) — capture webcam → canvas → JPEG → binary WS
 *   - 1 operator — receives all 3 feeds, picks one for broadcast
 *   - N viewers — receive only the selected feed
 *
 * Protocol:
 *   - TEXT frames = JSON control messages (register, select, state, welcome, ping/pong)
 *   - BINARY frames = video data: [1 byte slot number] + [JPEG bytes]
 *
 * Binary vs JSON+base64:
 *   - Binary saves 33% bandwidth (no base64 expansion)
 *   - No JSON parsing overhead on every frame
 *   - 720p JPEG at quality 0.6 ≈ 30-50 KB/frame → 30 FPS ≈ 1-1.5 MB/s
 */
const http = require("http");
const WebSocket = require("ws");

const PORT = 4070;

const state = {
  cameramen: { 1: null, 2: null, 3: null },
  operator: null,
  viewers: new Set(),
  selectedSlot: 1,
  // Match data set by the operator (scorebug overlay info)
  matchData: null, // { homeName, homeShort, homeColor, homeLogo, awayName, awayShort, awayColor, awayLogo, homeScore, awayScore, clock, half, competition }
};

// Last frame per slot — for late joiners
const lastFrames = { 1: null, 2: null, 3: null };

function broadcastState() {
  const msg = JSON.stringify({
    type: "state",
    activeSlots: Object.keys(state.cameramen).filter((s) => state.cameramen[s] !== null).map(Number),
    selectedSlot: state.selectedSlot,
    viewerCount: state.viewers.size,
    operatorOnline: state.operator !== null,
    matchData: state.matchData,
  });
  if (state.operator && state.operator.readyState === WebSocket.OPEN) state.operator.send(msg);
  for (const v of state.viewers) { if (v.readyState === WebSocket.OPEN) v.send(msg); }
  for (const slot of [1, 2, 3]) {
    const cm = state.cameramen[slot];
    if (cm && cm.readyState === WebSocket.OPEN) cm.send(msg);
  }
}

function sendFrame(slot, data, isBinary) {
  // data is a Buffer (binary) — forward as-is
  lastFrames[slot] = { data, isBinary: true };

  // Helper: send with backpressure check.
  // If the client's WebSocket buffer is > 1 frame behind, DROP the frame
  // instead of queuing it. This prevents old frames from piling up and
  // causing delay / out-of-order display on the viewer side.
  // `ws.bufferedAmount` tells us how many bytes are waiting to be flushed.
  function sendIfReady(ws) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    // If more than 100 KB is queued, the client is behind — drop this frame.
    // At ~40 KB/frame, 100 KB ≈ 2-3 frames behind. Dropping keeps latency low.
    if (ws.bufferedAmount > 100 * 1024) {
      return false; // drop
    }
    try {
      ws.send(data, { binary: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Forward to operator (all 3 slots)
  sendIfReady(state.operator);

  // Forward to viewers ONLY IF this slot is selected
  if (state.selectedSlot === slot) {
    for (const v of state.viewers) {
      sendIfReady(v);
    }
  }
}

function sendSelected(slot) {
  state.selectedSlot = slot;
  const msg = JSON.stringify({ type: "selected", slot });
  for (const v of state.viewers) {
    if (v.readyState === WebSocket.OPEN) {
      v.send(msg);
      // Send the last frame for the new slot immediately
      if (lastFrames[slot]) {
        v.send(lastFrames[slot].data, { binary: true });
      }
    }
  }
  for (const s of [1, 2, 3]) {
    const cm = state.cameramen[s];
    if (cm && cm.readyState === WebSocket.OPEN) cm.send(msg);
  }
  if (state.operator && state.operator.readyState === WebSocket.OPEN) state.operator.send(msg);
  broadcastState();
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      activeSlots: Object.keys(state.cameramen).filter((s) => state.cameramen[s] !== null).map(Number),
      selectedSlot: state.selectedSlot,
      viewerCount: state.viewers.size,
      operatorOnline: state.operator !== null,
      uptime: process.uptime(),
    }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocket.Server({ server, path: "/ws", maxPayload: 10 * 1024 * 1024 });

wss.on("connection", (ws) => {
  let role = null;
  let slot = null;
  ws.binaryType = "arraybuffer"; // not strictly needed on server side

  ws.on("message", (raw, isBinary) => {
    // ─── BINARY frame = video data ───
    if (isBinary) {
      if (role !== "cameraman" || ![1, 2, 3].includes(slot)) return;
      // First byte = slot number (redundant with `slot` var, but good for debugging)
      // The rest = JPEG bytes
      sendFrame(slot, raw, true);
      return;
    }

    // ─── TEXT frame = JSON control message ───
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

    switch (msg.type) {
      case "register": {
        role = msg.role;
        slot = msg.slot;
        if (role === "cameraman" && [1, 2, 3].includes(slot)) {
          if (state.cameramen[slot] && state.cameramen[slot] !== ws) {
            try { state.cameramen[slot].close(); } catch (e) {}
          }
          state.cameramen[slot] = ws;
          lastFrames[slot] = null;
          console.log(`[camera] slot ${slot} connected`);
        } else if (role === "operator") {
          state.operator = ws;
          console.log("[operator] connected");
        } else if (role === "viewer") {
          state.viewers.add(ws);
          console.log(`[viewer] connected (total ${state.viewers.size})`);
        }
        ws.send(JSON.stringify({
          type: "welcome", role, slot,
          activeSlots: Object.keys(state.cameramen).filter((s) => state.cameramen[s] !== null).map(Number),
          selectedSlot: state.selectedSlot,
          matchData: state.matchData,
        }));
        // Send last frames so new clients see video immediately
        if (role === "operator") {
          for (const s of [1, 2, 3]) {
            if (lastFrames[s]) ws.send(lastFrames[s].data, { binary: true });
          }
        } else if (role === "viewer") {
          const sel = state.selectedSlot;
          if (lastFrames[sel]) ws.send(lastFrames[sel].data, { binary: true });
        }
        broadcastState();
        break;
      }
      case "select": {
        if (role !== "operator") return;
        if (![1, 2, 3].includes(msg.slot)) return;
        console.log(`[operator] selected slot ${msg.slot}`);
        sendSelected(msg.slot);
        break;
      }
      case "setMatch": {
        // Operator sets/clears the live match data for the scorebug overlay
        if (role !== "operator") return;
        state.matchData = msg.matchData || null;
        console.log(`[operator] match data ${msg.matchData ? "set" : "cleared"}`);
        // Broadcast to all viewers + operator
        broadcastState();
        break;
      }
      case "ping": { ws.send(JSON.stringify({ type: "pong" })); break; }
    }
  });

  ws.on("close", () => {
    if (role === "cameraman" && [1, 2, 3].includes(slot)) {
      if (state.cameramen[slot] === ws) {
        state.cameramen[slot] = null;
        lastFrames[slot] = null;
        console.log(`[camera] slot ${slot} disconnected`);
      }
    } else if (role === "operator") {
      if (state.operator === ws) { state.operator = null; console.log("[operator] disconnected"); }
    } else if (role === "viewer") {
      state.viewers.delete(ws);
      console.log(`[viewer] disconnected (total ${state.viewers.size})`);
    }
    broadcastState();
  });

  ws.on("error", (e) => { console.error("[ws] error:", e.message); });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`FIFAYITI broadcast WS server (HD MJPEG Binary) listening on 127.0.0.1:${PORT}`);
  console.log(`  WebSocket path: /ws`);
  console.log(`  Health check:   http://127.0.0.1:${PORT}/health`);
});

setInterval(() => {
  for (const ws of wss.clients) { if (ws.readyState === WebSocket.OPEN) ws.ping(); }
}, 30000);
