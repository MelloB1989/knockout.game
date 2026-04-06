package repository

import (
	"encoding/json"
	"fmt"
	"knockout/internal/physics"
	"time"

	"github.com/redis/go-redis/v9"
)

type Subscription struct {
	pubsub  *redis.PubSub
	channel <-chan *redis.Message
	gameId  string
}

type GameEvents string

const (
	GameCreated           GameEvents = "game_created"
	PlayerJoined          GameEvents = "player_joined"
	PlayerLeft            GameEvents = "player_left"
	PlayerEliminated      GameEvents = "player_eliminated"
	GameEnded             GameEvents = "game_ended"
	PlayerMadeMove        GameEvents = "player_made_move"        //When a player registers a move
	PlayersPositionUpdate GameEvents = "players_position_update" //When position of players (all) changes
	RoundStartCountdown   GameEvents = "round_start_countdown"
	ErrorEvent            GameEvents = "error"
)

type PubSubEvent struct {
	Type      GameEvents         `json:"type"`
	GameState *physics.GameState `json:"game_state,omitempty"`
	Data      json.RawMessage    `json:"data,omitempty"`
}

func (g *Game) Subscribe() *Subscription {
	g.ensureRedis()
	pubsub := g.rc.Subscribe(ctx, gamePubKey(g.Id))

	channel := pubsub.Channel(
		redis.WithChannelHealthCheckInterval(30*time.Second),
		redis.WithChannelSendTimeout(10*time.Second),
	)

	return &Subscription{
		pubsub:  pubsub,
		channel: channel,
		gameId:  g.Id,
	}
}

func (sub *Subscription) Channel() <-chan *redis.Message {
	return sub.channel
}

func (sub *Subscription) ReceiveEvent() (*PubSubEvent, error) {
	msg, ok := <-sub.channel
	if !ok {
		return nil, fmt.Errorf("subscription closed")
	}

	var event PubSubEvent
	if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
		return nil, fmt.Errorf("failed to parse event: %w", err)
	}

	return &event, nil
}

func (sub *Subscription) Close() error {
	return sub.pubsub.Close()
}
