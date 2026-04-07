package handlers

import (
	"encoding/json"
	"knockout/internal/models/entities"
	"knockout/internal/physics"
	"knockout/internal/repository"
	"knockout/internal/server/middlewares"
	"log"
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

func WSHandler(c *websocket.Conn) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[ws] panic recovered: %v", r)
			c.Close()
		}
	}()
	playerId, playerSecret, gameId := middlewares.GetPlayerIdWS(c), middlewares.GetPlayerSecretWS(c), c.Params("gameId")

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

	done := make(chan struct{})
	defer close(done)

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
						c.Close()
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
		for {
			event, err := sub.ReceiveEvent()
			if err != nil {
				return // Close the connection
			}

			var data any
			if event.GameState != nil && (event.Type == repository.GameState || event.Type == repository.PlayersPositionUpdate) {
				data = maskGameStateForPlayer(event.GameState, playerId)
			} else if len(event.Data) > 0 {
				data = event.Data
			}

			if err := writeJSON(outgoing{
				Event: event.Type,
				Data:  data,
			}); err != nil {
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
			c.Close()
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

		game, err = repository.LoadGame(gameId)
		if err != nil || game.GameState == nil {
			writeJSON(outgoing{
				Event: repository.ErrorEvent,
				Error: "failed to load game",
			})
			continue
		}

		if msg.Event != registerPlayer {
			player, ok := game.GameState.Players[playerId]
			if !ok || player.PlayerSecret != playerSecret {
				writeJSON(outgoing{
					Event: repository.ErrorEvent,
					Error: "unauthorized",
				})
				continue
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
				continue
			}
			if playerId != "" {
				player.Id = playerId
			}
			if existing, ok := game.GameState.Players[player.Id]; ok && existing.PlayerSecret != "" && existing.PlayerSecret != playerSecret {
				writeJSON(outgoing{
					Event: repository.ErrorEvent,
					Error: "unauthorized",
				})
				continue
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

			if game.GameState.HostId == "" {
				game.GameState.HostId = player.Id
			}

			done, err := game.RegisterPlayer(player)
			if err != nil {
				writeJSON(outgoing{
					Event: repository.ErrorEvent,
					Error: err.Error(),
				})
				continue
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
				continue
			}
			done, err := game.RegisterPlayerMove(playerId, playerMove)
			if err != nil {
				writeJSON(outgoing{
					Event: repository.ErrorEvent,
					Error: err.Error(),
				})
				continue
			}
			if done {
				writeJSON(outgoing{
					Event: repository.PlayerMoveAck,
					Data: moveAckPayload{
						PlayerId: playerId,
					},
				})
			}
		case startGame:
			if game.GameState.HostId != "" && game.GameState.HostId != playerId {
				writeJSON(outgoing{
					Event: repository.ErrorEvent,
					Error: "only host can start the game",
				})
				continue
			}
			if game.GameState.HostId == "" {
				game.GameState.HostId = playerId
				if _, err := game.UpdateGame(); err != nil {
					writeJSON(outgoing{
						Event: repository.ErrorEvent,
						Error: err.Error(),
					})
					continue
				}
			}
			if game.GameState.Started {
				writeJSON(outgoing{
					Event: repository.ErrorEvent,
					Error: "game already started",
				})
				continue
			}
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
			game, err := repository.LoadGame(gameId)
			if err != nil || game.GameState == nil {
				return
			}

			if !game.GameState.Started {
				game.GameState.Started = true
				if game.GameState.CurrentRound <= 0 {
					game.GameState.CurrentRound = 1
				}
				if game.GameState.WaitTime == 0 {
					game.GameState.WaitTime = 8 * time.Second
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
				return
			}

			round := game.GameState.CurrentRound
			emitCountdown(game, round, game.GameState.WaitTime)

			game, err = repository.LoadGame(gameId)
			if err != nil || game.GameState == nil {
				return
			}

			round = game.GameState.CurrentRound
			movesSnapshot := copyMoves(game.GameState.CurrentMoves)

			// Stream position updates during simulation at ~20fps
			// SimulateTick is pure math (no real-time delay), so we add a small
			// sleep to spread updates over time for smooth frontend animation.
			const posPublishInterval = 50 * time.Millisecond
			game.GameState.PlayMovesWithCallback(func(players map[string]entities.Penguin) {
				_ = game.PublishEvent(repository.PlayersPositionUpdate, nil, game.GameState)
				time.Sleep(posPublishInterval)
			})

			if _, err := game.UpdateGame(); err != nil {
				return
			}

			_ = game.PublishEvent(repository.PlayerMadeMove, roundMovesPayload{
				Round: round,
				Moves: movesSnapshot,
			}, nil)

			for _, player := range eliminatedPlayers(game.GameState, round) {
				_ = game.PublishEvent(repository.PlayerEliminated, struct {
					PlayerId string `json:"player_id"`
					Round    int    `json:"round"`
				}{
					PlayerId: player.Id,
					Round:    player.Eliminated,
				}, nil)
			}

			_ = game.PublishEvent(repository.GameState, nil, game.GameState)
		}
	}()
}
