const baseUrl = process.env.PROBE_BASE_URL || "http://127.0.0.1:9000";
const moveDelayMs = 150;
const probeTimeoutMs = 40000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeSecret() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function nowMs() {
  return Date.now();
}

function summarizePlayers(gs) {
  const players = Object.entries(gs.players)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, player]) => ({
      id,
      x: Number(player.position.x.toFixed(4)),
      z: Number(player.position.z.toFixed(4)),
      direction: Number(player.direction.toFixed(4)),
      velocity: Number(player.velocity.toFixed(4)),
      eliminated: player.eliminated,
      score: player.score,
    }));

  return JSON.stringify({
    round: gs.current_round,
    started: gs.started,
    accepting_moves: gs.accepting_moves,
    players,
  });
}

async function guestAuth(username) {
  const playerSecret = makeSecret();
  const startedAt = nowMs();
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

  return {
    ...data,
    playerSecret,
    latencyMs: nowMs() - startedAt,
  };
}

async function createGame(hostToken) {
  const startedAt = nowMs();
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

  return {
    ...data,
    latencyMs: nowMs() - startedAt,
  };
}

function connectClient({
  label,
  token,
  gameId,
  playerId,
  playerSecret,
  onEvent,
}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${baseUrl.replace(/^http/, "ws")}/v1/game/ws/${gameId}?token=${encodeURIComponent(token)}`,
    );

    const timeout = setTimeout(() => {
      reject(new Error(`${label} websocket open timeout`));
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
      reject(new Error(`${label} websocket error: ${event.message ?? "unknown"}`));
    };

    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      onEvent(parsed, nowMs(), ws);
    };
  });
}

async function main() {
  const metrics = {
    auth: {},
    create: null,
    startSentAt: null,
    startStateAt: {},
    firstCountdownAt: {},
    firstDirectionBroadcastAt: null,
  };

  const host = await guestAuth(`probe_host_${Date.now()}`);
  const joiner = await guestAuth(`probe_join_${Date.now()}`);
  metrics.auth.host = host.latencyMs;
  metrics.auth.joiner = joiner.latencyMs;

  const created = await createGame(host.token);
  metrics.create = created.latencyMs;

  const gameId = created.game_id;
  const stateEvents = {
    host: [],
    joiner: [],
  };
  const rawEvents = {
    host: [],
    joiner: [],
  };
  const playerCounts = {
    host: 0,
    joiner: 0,
  };
  const sawJoinEvent = {
    host: false,
    joiner: false,
  };

  let done = false;
  let resolveDone;
  const completion = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const maybeFinish = () => {
    if (done) return;
    const hostFrames = stateEvents.host.filter((event) => event.type === "players_position_update");
    const joinerFrames = stateEvents.joiner.filter((event) => event.type === "players_position_update");
    if (hostFrames.length >= 18 && joinerFrames.length >= 18) {
      done = true;
      resolveDone();
    }
  };

  const hostWs = await connectClient({
    label: "host",
    token: host.token,
    gameId,
    playerId: host.player_id,
    playerSecret: host.playerSecret,
    onEvent: (msg, at, ws) => {
      rawEvents.host.push({ at, event: msg.event });

      if (msg.event === "game_state" && msg.data) {
        const gs = msg.data;
        playerCounts.host = Object.keys(gs.players ?? {}).length;
        stateEvents.host.push({
          at,
          type: "game_state",
          key: summarizePlayers(gs),
          gs,
        });

        if (gs.started && !metrics.startStateAt.host) {
          metrics.startStateAt.host = at;
        }
      }

      if (msg.event === "player_joined" && msg.data) {
        if (msg.data.id === joiner.player_id) {
          sawJoinEvent.host = true;
        }
        ws.send(JSON.stringify({ event: "get_state" }));
      }

      if (msg.event === "round_start_countdown" && msg.data) {
        if (!metrics.firstCountdownAt.host) {
          metrics.firstCountdownAt.host = at;
        }
      }

      if (msg.event === "players_position_update" && msg.data) {
        const gs = msg.data;
        stateEvents.host.push({
          at,
          type: "players_position_update",
          key: summarizePlayers(gs),
          gs,
        });

        if (
          !metrics.firstDirectionBroadcastAt &&
          gs.players[joiner.player_id] &&
          Number(gs.players[joiner.player_id].direction) === 180
        ) {
          metrics.firstDirectionBroadcastAt = at;
        }
        maybeFinish();
      }
    },
  });

  const joinerWs = await connectClient({
    label: "joiner",
    token: joiner.token,
    gameId,
    playerId: joiner.player_id,
    playerSecret: joiner.playerSecret,
    onEvent: (msg, at, ws) => {
      rawEvents.joiner.push({ at, event: msg.event });

      if (msg.event === "game_state" && msg.data) {
        const gs = msg.data;
        playerCounts.joiner = Object.keys(gs.players ?? {}).length;
        stateEvents.joiner.push({
          at,
          type: "game_state",
          key: summarizePlayers(gs),
          gs,
        });

        if (gs.started && !metrics.startStateAt.joiner) {
          metrics.startStateAt.joiner = at;
        }
      }

      if (msg.event === "player_joined" && msg.data) {
        if (msg.data.id === joiner.player_id) {
          sawJoinEvent.joiner = true;
        }
        ws.send(JSON.stringify({ event: "get_state" }));
      }

      if (msg.event === "round_start_countdown" && msg.data) {
        if (!metrics.firstCountdownAt.joiner) {
          metrics.firstCountdownAt.joiner = at;
        }
      }

      if (msg.event === "players_position_update" && msg.data) {
        const gs = msg.data;
        stateEvents.joiner.push({
          at,
          type: "players_position_update",
          key: summarizePlayers(gs),
          gs,
        });
        maybeFinish();
      }
    },
  });

  const rosterDeadline = nowMs() + probeTimeoutMs;
  while (
    (playerCounts.host < 2 || playerCounts.joiner < 2) &&
    nowMs() < rosterDeadline
  ) {
    hostWs.send(JSON.stringify({ event: "get_state" }));
    joinerWs.send(JSON.stringify({ event: "get_state" }));
    await sleep(200);
  }

  if (playerCounts.host < 2 || playerCounts.joiner < 2) {
    throw new Error(
      `timed out waiting for full roster host=${playerCounts.host} joiner=${playerCounts.joiner} joinSeen=${JSON.stringify(
        sawJoinEvent,
      )}`,
    );
  }

  metrics.startSentAt = nowMs();
  hostWs.send(JSON.stringify({ event: "start_game" }));

  while (!metrics.firstCountdownAt.host || !metrics.firstCountdownAt.joiner) {
    if (nowMs() - (metrics.startSentAt ?? nowMs()) > probeTimeoutMs) {
      console.error(
        JSON.stringify(
          {
            lastHostEvents: rawEvents.host.slice(-12),
            lastJoinerEvents: rawEvents.joiner.slice(-12),
            hostPlayerCount: playerCounts.host,
            joinerPlayerCount: playerCounts.joiner,
            sawJoinEvent,
            startStateAt: metrics.startStateAt,
            countdownAt: metrics.firstCountdownAt,
          },
          null,
          2,
        ),
      );
      throw new Error("timed out waiting for countdown");
    }
    await sleep(25);
  }

  setTimeout(() => {
    hostWs.send(JSON.stringify({ event: "register_move", data: { direction: 0, power: 10 } }));
    joinerWs.send(JSON.stringify({ event: "register_move", data: { direction: 180, power: 10 } }));
  }, moveDelayMs);

  await Promise.race([completion, sleep(probeTimeoutMs)]);

  hostWs.close();
  joinerWs.close();

  const hostFrames = stateEvents.host.filter((event) => event.type === "players_position_update");
  const joinerFrames = stateEvents.joiner.filter((event) => event.type === "players_position_update");

  let matchedFrames = 0;
  let maxArrivalDeltaMs = 0;
  const unmatchedHost = [];
  for (const frame of hostFrames) {
    const peer = joinerFrames.find((candidate) => candidate.key === frame.key);
    if (peer) {
      matchedFrames++;
      maxArrivalDeltaMs = Math.max(maxArrivalDeltaMs, Math.abs(peer.at - frame.at));
    } else {
      unmatchedHost.push(frame);
    }
  }

  const preview = (frameList) =>
    frameList.slice(0, 6).map((frame) => ({
      tFromStartMs: metrics.startSentAt ? frame.at - metrics.startSentAt : null,
      players: Object.fromEntries(
        Object.entries(frame.gs.players).map(([id, player]) => [
          id,
          {
            x: Number(player.position.x.toFixed(2)),
            z: Number(player.position.z.toFixed(2)),
            direction: Number(player.direction.toFixed(1)),
            velocity: Number(player.velocity.toFixed(2)),
          },
        ]),
      ),
    }));

  const summary = {
    gameId,
    authLatencyMs: metrics.auth,
    createLatencyMs: metrics.create,
    startToStartedStateMs: {
      host:
        metrics.startSentAt && metrics.startStateAt.host
          ? metrics.startStateAt.host - metrics.startSentAt
          : null,
      joiner:
        metrics.startSentAt && metrics.startStateAt.joiner
          ? metrics.startStateAt.joiner - metrics.startSentAt
          : null,
    },
    startToCountdownMs: {
      host:
        metrics.startSentAt && metrics.firstCountdownAt.host
          ? metrics.firstCountdownAt.host - metrics.startSentAt
          : null,
      joiner:
        metrics.startSentAt && metrics.firstCountdownAt.joiner
          ? metrics.firstCountdownAt.joiner - metrics.startSentAt
          : null,
    },
    directionBroadcastDelayMs:
      metrics.startSentAt && metrics.firstDirectionBroadcastAt
        ? metrics.firstDirectionBroadcastAt - metrics.startSentAt
        : null,
    positionFrameCounts: {
      host: hostFrames.length,
      joiner: joinerFrames.length,
    },
    matchedAuthoritativeFrames: matchedFrames,
    maxFrameArrivalDeltaMs: maxArrivalDeltaMs,
    unmatchedHostFrames: unmatchedHost.length,
    hostFramePreview: preview(hostFrames),
    joinerFramePreview: preview(joinerFrames),
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
