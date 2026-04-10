package repository

import (
	"time"

	"github.com/MelloB1989/karma/v2/orm"
)

type PlayerScore struct {
	PlayerId        string  `json:"player_id"`
	Username        string  `json:"username,omitempty"`
	Score           float64 `json:"score"`
	EliminatedRound int     `json:"eliminated_round"`
}

type Games struct {
	TableName    string        `json:"-" karma_table:"games"`
	Id           string        `json:"id" karma:"primary"`
	PlayerScores []PlayerScore `json:"player_scores" db:"player_scores"`
	Rounds       int           `json:"rounds"`
	PlayedAt     time.Time     `json:"played_at"`
}

func SaveGame(game Games) error {
	gamesORM := orm.Load(&Games{})
	defer gamesORM.Close()

	return gamesORM.Insert(&game)
}

func GetLatestGames(limit int) ([]Games, error) {
	gamesORM := orm.Load(&Games{})
	defer gamesORM.Close()

	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	games := make([]Games, 0)
	query := "SELECT * FROM games ORDER BY played_at DESC LIMIT $1"
	if err := gamesORM.QueryRaw(query, limit).Scan(&games); err != nil {
		return nil, err
	}
	return games, nil
}
