package term

import (
	"fmt"
	"knockout/internal/entities"
	"knockout/internal/physics"
	"math"
	"math/rand"
	"sort"
	"time"
)

const (
	dt         = 0.12
	frameDelay = 40 * time.Millisecond
)

func RegisterRandomPlayers(gs *physics.GameState, prefix string, count int, accel float64) {
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

func RegisterRandomMoves(gs *physics.GameState, power int) {
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

func AnimateTournament(title string, gs *physics.GameState, power int) {
	round := 1
	playerOrder := sortedPlayers(gs)
	symbols := buildSymbols(playerOrder)
	for aliveCount(gs) > 1 {
		RegisterRandomMoves(gs, power)
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

func AnimateGame(title string, gs *physics.GameState) {
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
