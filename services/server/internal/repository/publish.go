package repository

import (
	"encoding/json"

	"knockout/internal/physics"
)

func (g *Game) PublishEvent(eventType GameEvents, data any, gameState *physics.GameState) error {
	g.ensureRedis()

	var raw json.RawMessage
	if data != nil {
		payload, err := json.Marshal(data)
		if err != nil {
			return err
		}
		raw = payload
	}

	event := PubSubEvent{
		Type:      eventType,
		GameState: gameState,
		Data:      raw,
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	return g.rc.Publish(ctx, gamePubKey(g.Id), payload).Err()
}
