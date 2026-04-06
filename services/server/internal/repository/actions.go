package repository

import (
	"errors"
	"knockout/internal/models/entities"
)

func (g *Game) RegisterPlayer(p entities.Penguin) (bool, error) {
	if g.GameState == nil {
		return false, nil
	}
	g.GameState.Players[p.Id] = p
	return g.UpdateGame()
}

func (g *Game) RegisterPlayerMove(playerId string, move entities.PenguinMove) (bool, error) {
	if g.GameState == nil {
		return false, nil
	}
	if _, ok := g.GameState.Players[playerId]; !ok {
		return false, errors.New("player not found")
	}

	g.GameState.CurrentMoves[playerId] = move

	return g.UpdateGame()
}
