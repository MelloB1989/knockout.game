package main

import (
	"fmt"
	"math"
	"math/rand"
	"sort"
	"time"

	"knockout/internal/entities"
	"knockout/internal/physics"
)

const (
	dt         = 0.12
	frameDelay = 40 * time.Millisecond
)

func main() {
	rand.Seed(time.Now().UnixNano())

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
	gs := physics.CreateGame("demo", 40, 20)
	gs.Map.Friction = 0.25

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

	animateGame("Test Game 1: head-on collision", gs)
}

func runTestGame2() {
	gs := physics.CreateGame("demo", 30, 15)
	gs.Map.Friction = 0.3

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

	animateGame("Test Game 2: mixed masses + elimination", gs)
}

func runTestGame3() {
	gs := physics.CreateGame("demo", 50, 20)
	gs.Map.Friction = 0.22

	registerRandomPlayers(gs, "R", 8, 10)
	registerRandomMoves(gs, 5)

	animateGame("Test Game 3: random swarm", gs)
}

func runTestGame4() {
	gs := physics.CreateGame("demo", 60, 25)
	gs.Map.Friction = 0.3

	registerRandomPlayers(gs, "S", 12, 9)
	registerRandomMoves(gs, 4)

	animateGame("Test Game 4: crowded random collision", gs)
}

func runTournamentGame1() {
	gs := physics.CreateGame("tournament", 50, 20)
	gs.Map.Friction = 0.25

	registerRandomPlayers(gs, "T", 10, 10)

	animateTournament("Tournament 1: random rounds", gs, 4)
}

func runTournamentGame2() {
	gs := physics.CreateGame("tournament", 70, 28)
	gs.Map.Friction = 0.28

	registerRandomPlayers(gs, "U", 14, 9)

	animateTournament("Tournament 2: crowded rounds", gs, 4)
}

func registerRandomPlayers(gs *physics.GameState, prefix string, count int, accel float64) {
	for i := 0; i < count; i++ {
		id := fmt.Sprintf("%s%d", prefix, i+1)
		x := float64(rand.Intn(gs.Map.Length-2) + 1)
		z := float64(rand.Intn(gs.Map.Width-2) + 1)
		gs.RegisterPlayer(entities.Penguin{
			Id:       id,
			Type:     "random",
			Position: entities.Position{X: x, Z: z},
			Mass:     1,
			Accel:    accel,
		})
	}
}

func registerRandomMoves(gs *physics.GameState, power int) {
	for id, player := range gs.Players {
		if player.Eliminated {
			continue
		}
		dir := rand.Float64() * 360
		gs.RegisterPlayerMove(id, entities.PenguinMove{Direction: dir, Power: power})
	}
}

func aliveCount(gs *physics.GameState) int {
	count := 0
	for _, player := range gs.Players {
		if !player.Eliminated {
			count++
		}
	}
	return count
}

func animateTournament(title string, gs *physics.GameState, power int) {
	round := 1
	playerOrder := sortedPlayers(gs)
	symbols := buildSymbols(playerOrder)
	for aliveCount(gs) > 1 {
		registerRandomMoves(gs, power)
		gs.ApplyMoves()

		frame := 0
		for {
			renderFrame(fmt.Sprintf("%s | round %d", title, round), frame, gs, playerOrder, symbols)
			stopped := gs.SimulateTick(dt)
			if stopped {
				renderFrame(fmt.Sprintf("%s | round %d", title, round), frame+1, gs, playerOrder, symbols)
				break
			}
			frame++
			time.Sleep(frameDelay)
		}
		gs.EndRound()
		round++
	}
}

func animateGame(title string, gs *physics.GameState) {
	gs.ApplyMoves()

	playerOrder := sortedPlayers(gs)
	symbols := buildSymbols(playerOrder)

	frame := 0
	for {
		renderFrame(title, frame, gs, playerOrder, symbols)
		stopped := gs.SimulateTick(dt)
		if stopped {
			renderFrame(title, frame+1, gs, playerOrder, symbols)
			gs.EndRound()
			break
		}
		frame++
		time.Sleep(frameDelay)
	}
}

func sortedPlayers(gs *physics.GameState) []string {
	playerOrder := make([]string, 0, len(gs.Players))
	for id := range gs.Players {
		playerOrder = append(playerOrder, id)
	}
	sort.Strings(playerOrder)
	return playerOrder
}

func buildSymbols(order []string) map[string]rune {
	symbols := make(map[string]rune, len(order))
	for i, id := range order {
		if i < 26 {
			symbols[id] = rune('A' + i)
		} else {
			symbols[id] = rune('0' + (i-26)%10)
		}
	}
	return symbols
}

func renderFrame(title string, frame int, gs *physics.GameState, order []string, symbols map[string]rune) {
	fmt.Print("\033[H\033[2J")
	fmt.Printf("%s | frame %d\n", title, frame)

	length := gs.Map.Length
	width := gs.Map.Width

	grid := make([][]rune, width+1)
	for z := 0; z <= width; z++ {
		row := make([]rune, length+1)
		for x := 0; x <= length; x++ {
			if z == 0 || z == width || x == 0 || x == length {
				row[x] = '#'
			} else {
				row[x] = '.'
			}
		}
		grid[z] = row
	}

	for _, id := range order {
		p := gs.Players[id]
		if p.Eliminated {
			continue
		}
		x := int(math.Round(p.Position.X))
		z := int(math.Round(p.Position.Z))
		if x < 0 || x > length || z < 0 || z > width {
			continue
		}
		grid[z][x] = symbols[id]
	}

	for z := 0; z <= width; z++ {
		fmt.Println(string(grid[z]))
	}

	fmt.Println("Players:")
	for _, id := range order {
		p := gs.Players[id]
		status := "alive"
		if p.Eliminated {
			status = "eliminated"
		}
		fmt.Printf(" %c %s pos(%.2f,%.2f) vel=%.3f dir=%.1f %s\n",
			symbols[id],
			id,
			p.Position.X,
			p.Position.Z,
			p.Velocity,
			p.Direction,
			status,
		)
	}
}
