package handlers

import (
	"encoding/json"
	"knockout/internal/models/entities"
	"knockout/internal/physics"
	"knockout/internal/repository"
	"knockout/internal/server/middlewares"
	"log"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/websocket/v2"
)

const (
	pingInterval   = 30 * time.Second
	pongWait       = 90 * time.Second
	writeWait      = 30 * time.Second
	maxPingRetries = 3
)

type events string

const (
	registerPlayer events = "register_player"
	registerMove   events = "register_move"
	updatePosition events = "update_position"
	getState       events = "get_state"
	errorEvent     events = "error"
	startGame      events = "start_game"
)

type outgoing struct {
	Event repository.GameEvents `json:"event"`
	Data  any                   `json:"data,omitempty"`
	Error string                `json:"error,omitempty"`
}

type incomingMessage struct {
	Event events          `json:"event"`
	Data  json.RawMessage `json:"data,omitempty"`
}

type lobbyPositionPayload struct {
	Position  *entities.Position `json:"position,omitempty"`
	X         *float64           `json:"x,omitempty"`
	Z         *float64           `json:"z,omitempty"`
	Direction *float64           `json:"direction,omitempty"`
}

type countdownPayload struct {
	Round            int `json:"round"`
	SecondsRemaining int `json:"seconds_remaining"`
	TotalSeconds     int `json:"total_seconds"`
}

type roundMovesPayload struct {
	Round int                             `json:"round"`
	Moves map[string]entities.PenguinMove `json:"moves"`
}

type playerMovePayload struct {
	PlayerId   string               `json:"player_id"`
	PlayerMove entities.PenguinMove `json:"move"`
}

type moveAckPayload struct {
	PlayerId string `json:"player_id"`
}

var runningGames sync.Map
var gameLocks sync.Map
var localPositionSubscribers sync.Map
var redisPositionPublishers sync.Map

type positionSubscriberSet struct {
	mu   sync.RWMutex
	subs map[chan *physics.GameState]struct{}
}

type positionPublishWorker struct {
	mu      sync.Mutex
	running bool
	latest  *physics.GameState
}

func gameLock(gameId string) *sync.Mutex {
	lock, _ := gameLocks.LoadOrStore(gameId, &sync.Mutex{})
	return lock.(*sync.Mutex)
}

func localPositionSet(gameId string) *positionSubscriberSet {
	set, _ := localPositionSubscribers.LoadOrStore(gameId, &positionSubscriberSet{
		subs: make(map[chan *physics.GameState]struct{}),
	})
	return set.(*positionSubscriberSet)
}

func subscribeLocalPositions(gameId string) (chan *physics.GameState, func()) {
	set := localPositionSet(gameId)
	ch := make(chan *physics.GameState, 1)

	set.mu.Lock()
	set.subs[ch] = struct{}{}
	set.mu.Unlock()

	return ch, func() {
		set.mu.Lock()
		delete(set.subs, ch)
		empty := len(set.subs) == 0
		set.mu.Unlock()
		if empty {
			localPositionSubscribers.Delete(gameId)
		}
	}
}

func publishLocalPositions(gameId string, snapshot *physics.GameState) {
	if snapshot == nil {
		return
	}

	setValue, ok := localPositionSubscribers.Load(gameId)
	if !ok {
		return
	}

	set := setValue.(*positionSubscriberSet)
	set.mu.RLock()
	defer set.mu.RUnlock()

	for ch := range set.subs {
		select {
		case ch <- snapshot:
		default:
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- snapshot:
			default:
			}
		}
	}
}

func redisPositionWorker(gameId string) *positionPublishWorker {
	worker, _ := redisPositionPublishers.LoadOrStore(gameId, &positionPublishWorker{})
	return worker.(*positionPublishWorker)
}

func queueRedisPositionPublish(game *repository.Game, snapshot *physics.GameState) {
	if game == nil || snapshot == nil {
		return
	}

	worker := redisPositionWorker(game.Id)
	worker.mu.Lock()
	worker.latest = snapshot
	if worker.running {
		worker.mu.Unlock()
		return
	}
	worker.running = true
	worker.mu.Unlock()

	go func() {
		for {
			worker.mu.Lock()
			next := worker.latest
			if next == nil {
				worker.running = false
				worker.mu.Unlock()
				return
			}
			worker.latest = nil
			worker.mu.Unlock()

			_ = game.PublishEvent(repository.PlayersPositionUpdate, nil, next)
		}
	}()
}

func publishPlayersPositionUpdate(game *repository.Game) error {
	if game == nil || game.GameState == nil {
		return nil
	}
	game.GameState.ServerFrame++
	game.GameState.ServerTimeMs = time.Now().UnixMilli()
	snapshot := cloneGameState(game.GameState)
	publishLocalPositions(game.Id, snapshot)
	queueRedisPositionPublish(game, snapshot)
	return nil
}

func WSHandler(c *websocket.Conn) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[ws] panic recovered: %v", r)
			c.Close()
		}
	}()
	playerId, playerSecret, gameId := middlewares.GetPlayerIdWS(c), middlewares.GetPlayerSecretWS(c), c.Params("gameId")
	done := make(chan struct{})
	var closeOnce sync.Once
	closeConn := func() {
		closeOnce.Do(func() {
			close(done)
			_ = c.Close()
		})
	}
	defer closeConn()

	var writeMu sync.Mutex
	writeJSON := func(v any) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		c.SetWriteDeadline(time.Now().Add(writeWait))
		err := c.WriteJSON(v)
		c.SetWriteDeadline(time.Time{}) // Clear deadline after write
		return err
	}

	c.SetPongHandler(func(string) error {
		c.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	c.SetPingHandler(func(appData string) error {
		c.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	game, err := repository.LoadGame(gameId)
	if err != nil {
		log.Printf("[%s] failed to load game: %v", gameId, err)
		c.Close()
		return
	}

	sub := game.Subscribe()
	defer sub.Close()
	localPositions, unsubscribeLocalPositions := subscribeLocalPositions(gameId)
	defer unsubscribeLocalPositions()

	outbound := make(chan outgoing, 32)
	positionUpdates := make(chan outgoing, 1)
	var lastPositionFrameMu sync.Mutex
	lastPositionFrame := int64(-1)

	shouldQueuePositionFrame := func(gs *physics.GameState) bool {
		if gs == nil {
			return true
		}
		frame := gs.ServerFrame
		if frame <= 0 {
			return true
		}

		lastPositionFrameMu.Lock()
		defer lastPositionFrameMu.Unlock()
		if frame <= lastPositionFrame {
			return false
		}
		lastPositionFrame = frame
		return true
	}

	queueOutgoing := func(msg outgoing) bool {
		select {
		case <-done:
			return false
		default:
		}

		if msg.Event == repository.PlayersPositionUpdate {
			select {
			case <-positionUpdates:
			default:
			}

			select {
			case positionUpdates <- msg:
				return true
			case <-done:
				return false
			}
		}

		select {
		case outbound <- msg:
			return true
		case <-done:
			return false
		}
	}

	go func() {
		ticker := time.NewTicker(pingInterval)
		defer ticker.Stop()
		pingFailures := 0
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				writeMu.Lock()
				c.SetWriteDeadline(time.Now().Add(writeWait))
				err := c.WriteMessage(websocket.PingMessage, nil)
				// Clear write deadline after write attempt
				c.SetWriteDeadline(time.Time{})
				writeMu.Unlock()
				if err != nil {
					pingFailures++
					log.Printf("[%s] ping failed (attempt %d/%d): %v", gameId, pingFailures, maxPingRetries, err)
					if pingFailures >= maxPingRetries {
						log.Printf("[%s] max ping failures reached, closing connection", gameId)
						closeConn()
						return
					}
					// Continue and try again on next tick
					continue
				}
				// Reset failure count on successful ping
				pingFailures = 0
			}
		}
	}()

	go func() {
		writeOutgoing := func(msg outgoing) bool {
			if err := writeJSON(msg); err != nil {
				closeConn()
				return false
			}
			return true
		}

		for {
			select {
			case <-done:
				return
			default:
			}

			select {
			case msg := <-outbound:
				if !writeOutgoing(msg) {
					return
				}
				continue
			default:
			}

			select {
			case <-done:
				return
			case msg := <-outbound:
				if !writeOutgoing(msg) {
					return
				}
			case msg := <-positionUpdates:
				if !writeOutgoing(msg) {
					return
				}
			}
		}
	}()

	go func() {
		for {
			select {
			case <-done:
				return
			case gs, ok := <-localPositions:
				if !ok {
					return
				}
				if !shouldQueuePositionFrame(gs) {
					continue
				}
				if !queueOutgoing(outgoing{
					Event: repository.PlayersPositionUpdate,
					Data:  maskGameStateForPlayer(gs, playerId),
				}) {
					return
				}
			}
		}
	}()

	go func() {
		for {
			event, err := sub.ReceiveEvent()
			if err != nil {
				closeConn()
				return
			}

			if event.Type == repository.PlayersPositionUpdate && !shouldQueuePositionFrame(event.GameState) {
				continue
			}

			var data any
			if event.GameState != nil && (event.Type == repository.GameState || event.Type == repository.PlayersPositionUpdate) {
				data = maskGameStateForPlayer(event.GameState, playerId)
			} else if len(event.Data) > 0 {
				data = event.Data
			}

			if !queueOutgoing(outgoing{
				Event: event.Type,
				Data:  data,
			}) {
				return
			}
		}
	}()

	log.Printf("[%s] Setting initial read deadline: %v", gameId, pongWait)
	c.SetReadDeadline(time.Now().Add(pongWait))

	for {
		_, msgBytes, err := c.ReadMessage()
		if err != nil {
			log.Printf("[%s] connection closed: %v", gameId, err)
			closeConn()
			return
		}
		c.SetReadDeadline(time.Now().Add(pongWait))
		var msg incomingMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			writeJSON(outgoing{
				Event: repository.ErrorEvent,
				Error: err.Error(),
			})
			continue
		}

		func() {
			lock := gameLock(gameId)
			lock.Lock()
			defer lock.Unlock()

			game, err := repository.LoadGame(gameId)
			if err != nil || game.GameState == nil {
				writeJSON(outgoing{
					Event: repository.ErrorEvent,
					Error: "failed to load game",
				})
				return
			}

			if msg.Event != registerPlayer {
				player, ok := game.GameState.Players[playerId]
				if !ok || player.PlayerSecret != playerSecret {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: "unauthorized",
					})
					return
				}
			}

			switch msg.Event {
			case registerPlayer:
				var player entities.Penguin
				if err := json.Unmarshal(msg.Data, &player); err != nil {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: err.Error(),
					})
					return
				}
				if playerId != "" {
					player.Id = playerId
				}
				if existing, ok := game.GameState.Players[player.Id]; ok && existing.PlayerSecret != "" && existing.PlayerSecret != playerSecret {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: "unauthorized",
					})
					return
				}
				if existing, ok := game.GameState.Players[player.Id]; ok {
					existing.PlayerSecret = playerSecret
					if player.Skin != "" && !game.GameState.Started {
						existing.Skin = player.Skin
					}
					game.GameState.Players[player.Id] = existing
					if _, err := game.UpdateGame(); err != nil {
						writeJSON(outgoing{
							Event: repository.ErrorEvent,
							Error: err.Error(),
						})
					}
					return
				}

				player.PlayerSecret = playerSecret
				player.Mass = physics.NormalMass
				if strings.HasPrefix(player.Id, "anonymous") {
					player.Type = entities.AnonymousPlayer
				} else {
					player.Type = entities.RegisteredPlayer
				}
				player.Accel = 0
				player.Velocity = 0
				player.Direction = 0
				player.Eliminated = 0

				// Assign random spawn position within map bounds (with 15% margin)
				marginX := float64(game.GameState.Map.Length) * 0.15
				marginZ := float64(game.GameState.Map.Width) * 0.15
				player.Position.X = marginX + rand.Float64()*(float64(game.GameState.Map.Length)-2*marginX)
				player.Position.Z = marginZ + rand.Float64()*(float64(game.GameState.Map.Width)-2*marginZ)

				if game.GameState.HostId == "" {
					game.GameState.HostId = player.Id
				}

				done, err := game.RegisterPlayer(player)
				if err != nil {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: err.Error(),
					})
					return
				}

				safePlayer := sanitizePlayer(player)
				if done {
					_ = game.PublishEvent(repository.PlayerJoined, safePlayer, nil)
				}
			case registerMove:
				var playerMove entities.PenguinMove
				if err := json.Unmarshal(msg.Data, &playerMove); err != nil {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: err.Error(),
					})
					return
				}
				player := game.GameState.Players[playerId]
				if player.Eliminated > 0 {
					return
				}
				if game.GameState.Started && !game.GameState.AcceptingMoves {
					return
				}

				player.Direction = playerMove.Direction
				game.GameState.Players[playerId] = player

				game.GameState.CurrentMoves[playerId] = playerMove
				writeJSON(outgoing{
					Event: repository.PlayerMoveAck,
					Data: moveAckPayload{
						PlayerId: playerId,
					},
				})
				if err := publishPlayersPositionUpdate(game); err != nil {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: err.Error(),
					})
				}
			case updatePosition:
				// Accept lobby/eliminated position updates and broadcast
				pos, direction, err := parseLobbyPositionPayload(msg.Data)
				if err != nil {
					return
				}
				player, ok := game.GameState.Players[playerId]
				if !ok {
					return
				}
				if game.GameState.Started && player.Eliminated == 0 {
					return
				}
				player.Position = pos
				if direction != nil {
					player.Direction = *direction
				}
				game.GameState.Players[playerId] = player
				if err := publishPlayersPositionUpdate(game); err != nil {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: err.Error(),
					})
				}
			case startGame:
				if game.GameState.HostId != "" && game.GameState.HostId != playerId {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: "only host can start the game",
					})
					return
				}
				if game.GameState.HostId == "" {
					game.GameState.HostId = playerId
					if _, err := game.UpdateGame(); err != nil {
						writeJSON(outgoing{
							Event: repository.ErrorEvent,
							Error: err.Error(),
						})
						return
					}
				}
				if game.GameState.Started {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: "game already started",
					})
					return
				}

				game.GameState.Started = true
				game.GameState.AcceptingMoves = true
				if game.GameState.CurrentRound <= 0 {
					game.GameState.CurrentRound = 1
				}
				if game.GameState.WaitTime == 0 {
					game.GameState.WaitTime = 2 * time.Second
				}
				if _, err := game.UpdateGame(); err != nil {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: err.Error(),
					})
					return
				}
				_ = game.PublishEvent(repository.GameState, nil, game.GameState)

				startGameLoop(gameId)
				writeJSON(outgoing{
					Event: repository.GameState,
					Data:  maskGameStateForPlayer(game.GameState, playerId),
				})
			case getState:
				writeJSON(outgoing{
					Event: repository.GameState,
					Data:  maskGameStateForPlayer(game.GameState, playerId),
				})
			}
		}()
	}
}

func maskGameStateForPlayer(gs *physics.GameState, viewerId string) *physics.GameState {
	if gs == nil {
		return nil
	}
	masked := *gs
	masked.Players = make(map[string]entities.Penguin, len(gs.Players))
	for id, player := range gs.Players {
		player.PlayerSecret = ""
		masked.Players[id] = player
	}

	masked.CurrentMoves = make(map[string]entities.PenguinMove, len(gs.CurrentMoves))
	viewer, ok := gs.Players[viewerId]
	if ok && viewer.Eliminated == 0 {
		if move, ok := gs.CurrentMoves[viewerId]; ok {
			masked.CurrentMoves[viewerId] = move
		}
	} else {
		for id, move := range gs.CurrentMoves {
			masked.CurrentMoves[id] = move
		}
	}

	return &masked
}

func cloneGameState(gs *physics.GameState) *physics.GameState {
	if gs == nil {
		return nil
	}

	cloned := *gs
	cloned.Players = make(map[string]entities.Penguin, len(gs.Players))
	for id, player := range gs.Players {
		cloned.Players[id] = player
	}
	cloned.CurrentMoves = copyMoves(gs.CurrentMoves)
	if gs.LastHitBy != nil {
		cloned.LastHitBy = make(map[string]string, len(gs.LastHitBy))
		for id, hitter := range gs.LastHitBy {
			cloned.LastHitBy[id] = hitter
		}
	}
	return &cloned
}

func parseLobbyPositionPayload(raw json.RawMessage) (entities.Position, *float64, error) {
	var payload lobbyPositionPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return entities.Position{}, nil, err
	}

	if payload.Position != nil {
		return *payload.Position, payload.Direction, nil
	}

	pos := entities.Position{}
	if payload.X != nil {
		pos.X = *payload.X
	}
	if payload.Z != nil {
		pos.Z = *payload.Z
	}
	return pos, payload.Direction, nil
}

func sanitizePlayer(player entities.Penguin) entities.Penguin {
	player.PlayerSecret = ""
	return player
}

func copyMoves(moves map[string]entities.PenguinMove) map[string]entities.PenguinMove {
	copied := make(map[string]entities.PenguinMove, len(moves))
	for id, move := range moves {
		copied[id] = move
	}
	return copied
}

func eliminatedPlayers(gs *physics.GameState, round int) []entities.Penguin {
	if gs == nil || round <= 0 {
		return nil
	}
	eliminated := make([]entities.Penguin, 0)
	for _, player := range gs.Players {
		if player.Eliminated == round {
			eliminated = append(eliminated, player)
		}
	}
	return eliminated
}

func aliveCount(gs *physics.GameState) int {
	if gs == nil {
		return 0
	}
	count := 0
	for _, player := range gs.Players {
		if player.Eliminated == 0 {
			count++
		}
	}
	return count
}

func findWinnerId(gs *physics.GameState) string {
	if gs == nil {
		return ""
	}
	for id, player := range gs.Players {
		if player.Eliminated == 0 {
			return id
		}
	}
	return ""
}

func emitCountdown(game *repository.Game, round int, wait time.Duration) {
	seconds := int(wait.Seconds())
	if seconds <= 0 {
		return
	}
	for i := seconds; i > 0; i-- {
		_ = game.PublishEvent(repository.RoundStartCountdown, countdownPayload{
			Round:            round,
			SecondsRemaining: i,
			TotalSeconds:     seconds,
		}, nil)
		time.Sleep(1 * time.Second)
	}
}

func startGameLoop(gameId string) {
	if _, loaded := runningGames.LoadOrStore(gameId, struct{}{}); loaded {
		return
	}

	go func() {
		defer runningGames.Delete(gameId)
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[%s] game loop panic recovered: %v", gameId, r)
			}
		}()
		for {
			lock := gameLock(gameId)
			lock.Lock()
			game, err := repository.LoadGame(gameId)
			if err != nil || game.GameState == nil {
				lock.Unlock()
				return
			}

			if !game.GameState.Started {
				game.GameState.Started = true
				if game.GameState.CurrentRound <= 0 {
					game.GameState.CurrentRound = 1
				}
				if game.GameState.WaitTime == 0 {
					game.GameState.WaitTime = 2 * time.Second
				}
				if _, err := game.UpdateGame(); err == nil {
					_ = game.PublishEvent(repository.GameState, nil, game.GameState)
				}
			}

			if aliveCount(game.GameState) <= 1 {
				winnerId := findWinnerId(game.GameState)
				_ = game.PublishEvent(repository.GameEnded, struct {
					WinnerId string `json:"winner_id,omitempty"`
				}{WinnerId: winnerId}, game.GameState)
				lock.Unlock()
				return
			}

			if !game.GameState.AcceptingMoves {
				game.GameState.AcceptingMoves = true
				if _, err := game.UpdateGame(); err != nil {
					lock.Unlock()
					return
				}
			}

			round := game.GameState.CurrentRound
			waitTime := game.GameState.WaitTime
			lock.Unlock()

			emitCountdown(game, round, waitTime)

			lock.Lock()
			game, err = repository.LoadGame(gameId)
			if err != nil || game.GameState == nil {
				lock.Unlock()
				return
			}

			if game.GameState.AcceptingMoves {
				game.GameState.AcceptingMoves = false
				if _, err := game.UpdateGame(); err != nil {
					lock.Unlock()
					return
				}
			}

			round = game.GameState.CurrentRound
			movesSnapshot := copyMoves(game.GameState.CurrentMoves)

			_ = game.PublishEvent(repository.PlayerMadeMove, roundMovesPayload{
				Round: round,
				Moves: movesSnapshot,
			}, nil)

			// Stream authoritative positions during simulation at ~20fps.
			// SimulateTick is pure math (no real-time delay), so we add a small
			// sleep to spread updates over time for smooth frontend animation.
			const posPublishInterval = 50 * time.Millisecond
			game.GameState.PlayMovesWithCallback(func(players map[string]entities.Penguin) {
				_ = publishPlayersPositionUpdate(game)
				time.Sleep(posPublishInterval)
			})

			if _, err := game.UpdateGame(); err != nil {
				lock.Unlock()
				return
			}

			for _, player := range eliminatedPlayers(game.GameState, round) {
				eliminatedBy := ""
				if game.GameState.LastHitBy != nil {
					if hitter, ok := game.GameState.LastHitBy[player.Id]; ok {
						eliminatedBy = hitter
					}
				}
				_ = game.PublishEvent(repository.PlayerEliminated, struct {
					PlayerId     string `json:"player_id"`
					Round        int    `json:"round"`
					EliminatedBy string `json:"eliminated_by,omitempty"`
				}{
					PlayerId:     player.Id,
					Round:        player.Eliminated,
					EliminatedBy: eliminatedBy,
				}, nil)
			}

			_ = game.PublishEvent(repository.GameState, nil, game.GameState)
			lock.Unlock()
		}
	}()
}
