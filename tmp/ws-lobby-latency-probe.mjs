const baseUrl = process.env.PROBE_BASE_URL || "http://127.0.0.1:9000";
const sendIntervalMs = 100;
const totalUpdates = 20;
const probeTimeoutMs = 20000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeSecret() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function nowMs() {
  return Date.now();
}

function positionKey(pos) {
  return `${pos.x.toFixed(2)},${pos.z.toFixed(2)}`;
}

async function guestAuth(username) {
  const playerSecret = makeSecret();
  const res = await fetch(`${baseUrl}/v1/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_secret: playerSecret,
      username,
      pfp: "",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`guest auth failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return { ...data, playerSecret };
}

async function createGame(hostToken) {
  const res = await fetch(`${baseUrl}/v1/game/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hostToken}`,
    },
    body: JSON.stringify({
      map_type: "tundra_ring",
      skin: "default",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`create failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

function connectClient({ token, gameId, playerId, playerSecret, onEvent }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${baseUrl.replace(/^http/, "ws")}/v1/game/ws/${gameId}?token=${encodeURIComponent(token)}`,
    );

    const timeout = setTimeout(() => {
      reject(new Error("websocket open timeout"));
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      ws.send(
        JSON.stringify({
          event: "register_player",
          data: {
            id: playerId,
            skin: "default",
            player_secret: playerSecret,
            position: { x: 0, z: 0 },
          },
        }),
      );
      ws.send(JSON.stringify({ event: "get_state" }));
      resolve(ws);
    };

    ws.onerror = (event) => {
      reject(new Error(`websocket error: ${event.message ?? "unknown"}`));
    };

    ws.onmessage = (event) => {
      onEvent(JSON.parse(event.data), nowMs(), ws);
    };
  });
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const idx = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * p)),
  );
  return sortedValues[idx];
}

async function main() {
  const host = await guestAuth(`lobby_host_${Date.now()}`);
  const joiner = await guestAuth(`lobby_join_${Date.now()}`);
  const created = await createGame(host.token);

  const playerCounts = { host: 0, joiner: 0 };
  const sentAtByPosition = new Map();
  const arrivalSamples = [];
  const seenPositions = new Set();

  const hostWs = await connectClient({
    token: host.token,
    gameId: created.game_id,
    playerId: host.player_id,
    playerSecret: host.playerSecret,
    onEvent: (msg, at, ws) => {
      if (msg.event === "game_state" && msg.data) {
        playerCounts.host = Object.keys(msg.data.players ?? {}).length;
      }
      if (msg.event === "player_joined") {
        ws.send(JSON.stringify({ event: "get_state" }));
      }
    },
  });

  const joinerWs = await connectClient({
    token: joiner.token,
    gameId: created.game_id,
    playerId: joiner.player_id,
    playerSecret: joiner.playerSecret,
    onEvent: (msg, at, ws) => {
      if (msg.event === "game_state" && msg.data) {
        playerCounts.joiner = Object.keys(msg.data.players ?? {}).length;
      }
      if (msg.event === "player_joined") {
        ws.send(JSON.stringify({ event: "get_state" }));
      }
      if (msg.event === "players_position_update" && msg.data) {
        const gs = msg.data;
        const hostPlayer = gs.players?.[host.player_id];
        if (!hostPlayer) return;

        const key = positionKey(hostPlayer.position);
        const sentAt = sentAtByPosition.get(key);
        if (!sentAt || seenPositions.has(key)) return;

        seenPositions.add(key);
        arrivalSamples.push({
          position: key,
          endToEndMs: at - sentAt,
          serverToJoinerMs:
            typeof gs.server_time_ms === "number" ? at - gs.server_time_ms : null,
        });
      }
    },
  });

  const rosterDeadline = nowMs() + 8000;
  while (
    (playerCounts.host < 2 || playerCounts.joiner < 2) &&
    nowMs() < rosterDeadline
  ) {
    hostWs.send(JSON.stringify({ event: "get_state" }));
    joinerWs.send(JSON.stringify({ event: "get_state" }));
    await sleep(150);
  }

  if (playerCounts.host < 2 || playerCounts.joiner < 2) {
    throw new Error(
      `timed out waiting for full roster host=${playerCounts.host} joiner=${playerCounts.joiner}`,
    );
  }

  for (let i = 0; i < totalUpdates; i++) {
    const pos = { x: 8 + i * 0.75, z: 10 + (i % 2) * 0.5 };
    sentAtByPosition.set(positionKey(pos), nowMs());
    hostWs.send(JSON.stringify({ event: "update_position", data: pos }));
    await sleep(sendIntervalMs);
  }

  const waitDeadline = nowMs() + probeTimeoutMs;
  while (arrivalSamples.length < totalUpdates && nowMs() < waitDeadline) {
    await sleep(25);
  }

  hostWs.close();
  joinerWs.close();

  const endToEnd = arrivalSamples
    .map((sample) => sample.endToEndMs)
    .sort((a, b) => a - b);
  const serverToJoiner = arrivalSamples
    .map((sample) => sample.serverToJoinerMs)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);

  const summary = {
    gameId: created.game_id,
    sentUpdates: totalUpdates,
    receivedUpdates: arrivalSamples.length,
    endToEndMs: {
      min: endToEnd[0] ?? null,
      p50: percentile(endToEnd, 0.5),
      p95: percentile(endToEnd, 0.95),
      max: endToEnd[endToEnd.length - 1] ?? null,
    },
    serverToJoinerMs: {
      min: serverToJoiner[0] ?? null,
      p50: percentile(serverToJoiner, 0.5),
      p95: percentile(serverToJoiner, 0.95),
      max: serverToJoiner[serverToJoiner.length - 1] ?? null,
    },
    samples: arrivalSamples.slice(0, 10),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
