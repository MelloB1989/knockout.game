package tests

import (
	"knockout/internal/models/entities"
	"knockout/internal/repository"
	"knockout/internal/term"
	"time"
)

func RunTestGames() {
	runTestGame1()
	time.Sleep(400 * time.Millisecond)
	runTestGame2()
	time.Sleep(400 * time.Millisecond)
	runTestGame3()
	time.Sleep(400 * time.Millisecond)
	runTestGame4()
	time.Sleep(400 * time.Millisecond)
	runTournamentGame1()
	time.Sleep(400 * time.Millisecond)
	runTournamentGame2()
}

func runTestGame1() {
	gs, err := repository.CreateGame("demo", 40, 20)
	if err != nil {
		return
	}
	gs.GameState.Map.Friction = 0.25

	gs.RegisterPlayer(entities.Penguin{
		Id:       "P1",
		Type:     "blue",
		Position: entities.Position{X: 12, Z: 10},
		Mass:     1,
		Accel:    12,
	})
	gs.RegisterPlayer(entities.Penguin{
		Id:       "P2",
		Type:     "red",
		Position: entities.Position{X: 28, Z: 10},
		Mass:     1,
		Accel:    12,
	})

	gs.RegisterPlayerMove("P1", entities.PenguinMove{Direction: 0, Power: 5})
	gs.RegisterPlayerMove("P2", entities.PenguinMove{Direction: 180, Power: 5})

	term.AnimateGame("Test Game 1: head-on collision", gs)
}

func runTestGame2() {
	gs, err := repository.CreateGame("demo", 30, 15)
	if err != nil {
		return
	}
	gs.GameState.Map.Friction = 0.3

	gs.RegisterPlayer(entities.Penguin{
		Id:       "A",
		Type:     "green",
		Position: entities.Position{X: 4, Z: 6},
		Mass:     1,
		Accel:    10,
	})
	gs.RegisterPlayer(entities.Penguin{
		Id:        "B",
		Type:      "purple",
		Position:  entities.Position{X: 12, Z: 6},
		Mass:      2,
		Accel:     8,
		Velocity:  -2.5,
		Direction: 0,
	})
	gs.RegisterPlayer(entities.Penguin{
		Id:       "C",
		Type:     "yellow",
		Position: entities.Position{X: 26, Z: 2},
		Mass:     1,
		Accel:    12,
	})

	gs.RegisterPlayerMove("A", entities.PenguinMove{Direction: 0, Power: 5})
	gs.RegisterPlayerMove("B", entities.PenguinMove{Direction: 180, Power: 4})
	gs.RegisterPlayerMove("C", entities.PenguinMove{Direction: 0, Power: 5})

	term.AnimateGame("Test Game 2: mixed masses + elimination", gs)
}

func runTestGame3() {
	gs, err := repository.CreateGame("demo", 50, 20)
	if err != nil {
		return
	}
	gs.GameState.Map.Friction = 0.22

	term.RegisterRandomPlayers(gs, "R", 8, 10)
	term.RegisterRandomMoves(gs, 5)

	term.AnimateGame("Test Game 3: random swarm", gs)
}

func runTestGame4() {
	gs, err := repository.CreateGame("demo", 60, 25)
	if err != nil {
		return
	}
	gs.GameState.Map.Friction = 0.3

	term.RegisterRandomPlayers(gs, "S", 12, 9)
	term.RegisterRandomMoves(gs, 4)

	term.AnimateGame("Test Game 4: crowded random collision", gs)
}

func runTournamentGame1() {
	gs, err := repository.CreateGame("tournament", 50, 20)
	if err != nil {
		return
	}
	gs.GameState.Map.Friction = 0.25

	term.RegisterRandomPlayers(gs, "T", 10, 10)

	term.AnimateTournament("Tournament 1: random rounds", gs, 4)
}

func runTournamentGame2() {
	gs, err := repository.CreateGame("tournament", 70, 28)
	if err != nil {
		return
	}
	gs.GameState.Map.Friction = 0.28

	term.RegisterRandomPlayers(gs, "U", 14, 9)

	term.AnimateTournament("Tournament 2: crowded rounds", gs, 4)
}
