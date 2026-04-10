package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"knockout/internal/physics"
	"knockout/internal/redisclient"
	"sync"
	"time"

	"github.com/MelloB1989/karma/utils"
	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()
var liveGames sync.Map

type Game struct {
	Id            string             `json:"id"`
	GameState     *physics.GameState `json:"game_state"`
	CreatedAt     time.Time          `json:"created_at"`
	RematchGameId string             `json:"rematch_game_id,omitempty"`
	rc            *redis.Client
}

func CreateGame(mapType string, l, w int) (*Game, error) {
	gs := physics.CreateGameState(mapType, l, w)

	redis := redisclient.Client()
	game := &Game{
		Id:        utils.GenerateID(6),
		GameState: gs,
		CreatedAt: time.Now(),
		rc:        redis,
	}
	data, err := json.Marshal(game)
	if err != nil {
		return nil, err
	}
	redis.Set(ctx, game.Id, data, 0)
	rememberLiveGame(game)

	return game, nil
}

func (g *Game) UpdateGame() (bool, error) {
	g.ensureRedis()
	data, err := json.Marshal(g)
	if err != nil {
		return false, err
	}
	_, err = g.rc.Set(ctx, g.Id, data, 0).Result()
	if err != nil {
		return false, err
	}
	rememberLiveGame(g)
	return true, nil
}

func LoadGame(id string) (*Game, error) {
	if cached, ok := liveGames.Load(id); ok {
		game := cached.(*Game)
		game.ensureRedis()
		return game, nil
	}
	redis := redisclient.Client()
	data, err := redis.Get(ctx, id).Result()
	if err != nil {
		return nil, err
	}
	var game Game
	if err := json.Unmarshal([]byte(data), &game); err != nil {
		return nil, err
	}
	game.rc = redis
	rememberLiveGame(&game)
	return &game, nil
}

func LoadGameFresh(id string) (*Game, error) {
	redis := redisclient.Client()
	data, err := redis.Get(ctx, id).Result()
	if err != nil {
		return nil, err
	}
	var game Game
	if err := json.Unmarshal([]byte(data), &game); err != nil {
		return nil, err
	}
	game.rc = redis
	rememberLiveGame(&game)
	return &game, nil
}

func (g *Game) ensureRedis() {
	if g.rc == nil {
		g.rc = redisclient.Client()
	}
}

func rememberLiveGame(game *Game) {
	if game == nil {
		return
	}
	liveGames.Store(game.Id, game)
}

func gamePubKey(gameId string) string { return fmt.Sprintf("knockout:game:%s:pub", gameId) }

type LiveGameSummary struct {
	Id          string `json:"id"`
	PlayerCount int    `json:"player_count"`
	MapType     string `json:"map_type"`
	CurrentRound int   `json:"current_round"`
	Started     bool   `json:"started"`
	CreatedAt   string `json:"created_at"`
}

func ListLiveGames() []LiveGameSummary {
	result := make([]LiveGameSummary, 0)
	liveGames.Range(func(key, value any) bool {
		game, ok := value.(*Game)
		if !ok || game == nil || game.GameState == nil {
			return true
		}
		playerCount := len(game.GameState.Players)
		if playerCount == 0 {
			return true
		}
		result = append(result, LiveGameSummary{
			Id:           game.Id,
			PlayerCount:  playerCount,
			MapType:      game.GameState.Map.Type,
			CurrentRound: game.GameState.CurrentRound,
			Started:      game.GameState.Started,
			CreatedAt:    game.CreatedAt.Format(time.RFC3339),
		})
		return true
	})
	return result
}

func ForgetLiveGame(gameId string) {
	liveGames.Delete(gameId)
}
