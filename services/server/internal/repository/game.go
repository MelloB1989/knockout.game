package repository

import (
	"time"

	"github.com/MelloB1989/karma/v2/orm"
)

type PlayerScore struct {
	PlayerId        string  `json:"player_id"`
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
