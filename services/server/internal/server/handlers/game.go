package handlers

import (
	"encoding/json"
	"knockout/internal/repository"
	"knockout/internal/server/middlewares"
	"log"
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
)

type outgoing struct {
	Event repository.GameEvents `json:"event"`
	Data  any                   `json:"data,omitempty"`
	Error string                `json:"error,omitempty"`
}

var incoming struct {
	Event events `json:"event"`
	Data  any    `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
}

func WSHandler(c *websocket.Conn) {
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
			switch event.Type {

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
		if err := json.Unmarshal(msgBytes, &incoming); err != nil {
			writeJSON(outgoing{
				Event: repository.ErrorEvent,
				Error: err.Error(),
			})
			continue
		}

		switch incoming.Event {

		}
	}
}
