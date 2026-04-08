package repository

import (
	"encoding/json"
	"fmt"
	"knockout/internal/physics"

	"github.com/redis/go-redis/v9"
)

type Subscription struct {
	pubsub *redis.PubSub
}

type GameEvents string

const (
	GameCreated           GameEvents = "game_created"
	PlayerJoined          GameEvents = "player_joined"
	PlayerLeft            GameEvents = "player_left"
	PlayerEliminated      GameEvents = "player_eliminated"
	GameEnded             GameEvents = "game_ended"
	PlayerMadeMove        GameEvents = "player_made_move"        //When a player registers a move
	PlayerMoveAck         GameEvents = "player_move_ack"         //Acknowledgement that a player submitted a move (no move data)
	PlayersPositionUpdate GameEvents = "players_position_update" //When position of players (all) changes
	RoundStartCountdown   GameEvents = "round_start_countdown"
	RematchCreated        GameEvents = "rematch_created"
	GameState             GameEvents = "game_state"
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

	return &Subscription{
		pubsub: pubsub,
	}
}

func (sub *Subscription) ReceiveEvent() (*PubSubEvent, error) {
	msg, err := sub.pubsub.ReceiveMessage(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to receive event: %w", err)
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
