import http from "node:http";
import { URL } from "node:url";
import { RawData, WebSocket, WebSocketServer } from "ws";
import { createEnvelope, PeerRole, RelayEnvelope } from "./protocol";

type Peer = {
  id: string;
  pairingCode: string;
  role: PeerRole;
  deviceName: string;
  connectedAt: number;
  isAlive: boolean;
  socket: WebSocket;
};

const port = Number(process.env.PORT ?? process.env.REMOTELAB_RELAY_PORT ?? 8787);
const sharedSecret = process.env.REMOTELAB_RELAY_SHARED_SECRET;
const rooms = new Map<string, Map<string, Peer>>();

const server = http.createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: false, error: "not_found" }));
});

const wss = new WebSocketServer({ server, path: "/relay" });

wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/relay", `http://${request.headers.host ?? "wss://192.168.1.125:8787/relay"}`);
  const role = url.searchParams.get("role") as PeerRole | null;
  const pairingCode = url.searchParams.get("pairingCode")?.trim();
  const deviceName = url.searchParams.get("deviceName")?.trim() || "Unknown device";
  const providedSecret = request.headers["x-remotelab-relay-secret"] ?? url.searchParams.get("secret");

  if (sharedSecret && providedSecret !== sharedSecret) {
    socket.close(1008, "Invalid relay secret");
    return;
  }

  if ((role !== "extension" && role !== "mobile") || !pairingCode) {
    socket.close(1008, "Missing role or pairing code");
    return;
  }

  const peer: Peer = {
    id: `${role}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    pairingCode,
    role,
    deviceName,
    connectedAt: Date.now(),
    isAlive: true,
    socket
  };

  const room = getRoom(pairingCode);
  room.set(peer.id, peer);

  send(peer, createEnvelope("relay.ready", { peerId: peer.id, role, pairingCode }, { target: role }));
  broadcastPeerState(pairingCode, `${deviceName} connected`);

  socket.on("message", (raw) => {
    const envelope = parseEnvelope(raw);
    if (!envelope) {
      send(peer, createEnvelope("relay.error", { message: "Invalid JSON envelope" }, { target: peer.role }));
      return;
    }

    routeEnvelope(peer, envelope);
  });

  socket.on("pong", () => {
    peer.isAlive = true;
  });

  socket.on("close", () => {
    room.delete(peer.id);
    if (room.size === 0) {
      rooms.delete(pairingCode);
    } else {
      broadcastPeerState(pairingCode, `${deviceName} disconnected`);
    }
  });
});

server.listen(port, () => {
  console.log(`RemoteLab relay listening on :${port}`);
});

const heartbeat = setInterval(() => {
  for (const [pairingCode, room] of rooms.entries()) {
    for (const peer of room.values()) {
      if (!peer.isAlive) {
        peer.socket.terminate();
        room.delete(peer.id);
        continue;
      }

      peer.isAlive = false;
      peer.socket.ping();
    }

    if (room.size === 0) {
      rooms.delete(pairingCode);
    }
  }
}, 30000);

wss.on("close", () => {
  clearInterval(heartbeat);
});

function getRoom(pairingCode: string): Map<string, Peer> {
  let room = rooms.get(pairingCode);
  if (!room) {
    room = new Map();
    rooms.set(pairingCode, room);
  }
  return room;
}

function routeEnvelope(sender: Peer, envelope: RelayEnvelope): void {
  const room = rooms.get(sender.pairingCode);
  if (!room) {
    return;
  }

  const target = envelope.target ?? (sender.role === "mobile" ? "extension" : "mobile");
  const outgoing: RelayEnvelope = {
    ...envelope,
    source: sender.role,
    sentAt: envelope.sentAt ?? new Date().toISOString()
  };

  for (const peer of room.values()) {
    if (peer.id === sender.id) {
      continue;
    }

    if (target === "all" || target === peer.role) {
      send(peer, outgoing);
    }
  }
}

function broadcastPeerState(pairingCode: string, reason: string): void {
  const room = rooms.get(pairingCode);
  if (!room) {
    return;
  }

  const peers = Array.from(room.values());
  for (const peer of peers) {
    send(
      peer,
      createEnvelope(
        "relay.peerState",
        {
          reason,
          peers: peers.map((item) => ({
            role: item.role,
            deviceName: item.deviceName,
            connectedAt: item.connectedAt
          }))
        },
        { target: peer.role }
      )
    );
  }
}

function send(peer: Peer, envelope: RelayEnvelope): void {
  if (peer.socket.readyState === WebSocket.OPEN) {
    peer.socket.send(JSON.stringify(envelope));
  }
}

function parseEnvelope(raw: RawData): RelayEnvelope | undefined {
  try {
    const text = Array.isArray(raw) ? Buffer.concat(raw).toString("utf8") : raw.toString();
    return JSON.parse(text) as RelayEnvelope;
  } catch {
    return undefined;
  }
}
