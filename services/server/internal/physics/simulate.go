package physics

import (
	"math"
	"time"

	"knockout/internal/models/entities"
)

type GameState struct {
	Players         map[string]entities.Penguin     `json:"players"`
	Map             entities.Map                    `json:"map"`
	CurrentMoves    map[string]entities.PenguinMove `json:"current_moves"`
	CurrentRound    int                             `json:"current_round"`
	WaitTime        time.Duration                   `json:"wait_time"` // Time to wait between rounds to allow players to make moves
	HostId          string                          `json:"host_id"`
	Started         bool                            `json:"started"`
	roundEliminated bool
}

func CreateGameState(mapType string, l, w int) *GameState {
	return &GameState{
		Players: make(map[string]entities.Penguin),
		Map: entities.Map{
			Type:   mapType,
			Length: l,
			Width:  w,
		},
		CurrentMoves: make(map[string]entities.PenguinMove),
		CurrentRound: 1,
		WaitTime:     8 * time.Second,
	}
}

// TickCallback is called after each simulation tick with the current player positions.
type TickCallback func(players map[string]entities.Penguin)

func (gs *GameState) PlayMoves() []entities.PenguinMove {
	return gs.PlayMovesWithCallback(nil)
}

func (gs *GameState) PlayMovesWithCallback(onTick TickCallback) []entities.PenguinMove {
	moves := gs.ApplyMoves()
	for {
		if gs.SimulateTick(defaultDT) {
			break
		}
		if onTick != nil {
			onTick(gs.Players)
		}
	}
	gs.EndRound()
	return moves
}

func (gs *GameState) ApplyMoves() []entities.PenguinMove {
	gs.roundEliminated = false
	moves := make([]entities.PenguinMove, 0, len(gs.CurrentMoves))

	// Apply moves to players
	for playerId, move := range gs.CurrentMoves {
		moves = append(moves, move)
		player, ok := gs.Players[playerId]
		if !ok {
			continue
		}
		player.Accel = float64(move.Power) * powerScale
		player.Direction = move.Direction
		gs.Players[playerId] = player
	}

	// Default acceleration for players who didn't move
	for playerId, player := range gs.Players {
		if _, ok := gs.CurrentMoves[playerId]; !ok {
			player.Accel = 0
			gs.Players[playerId] = player
		}
	}

	gs.CurrentMoves = make(map[string]entities.PenguinMove)

	return moves
}

func (gs *GameState) SimulateTick(dt float64) bool {
	friction := gs.Map.Friction
	damping := 1 - friction*dt
	if damping < 0 {
		damping = 0
	}

	velocitiesX := make(map[string]float64, len(gs.Players))
	velocitiesZ := make(map[string]float64, len(gs.Players))

	for playerId, player := range gs.Players {
		if player.Eliminated > 0 {
			continue
		}

		if player.Accel != 0 {
			player.Velocity += player.Accel * dt
			player.Accel = 0
		}

		player.Velocity *= damping

		if math.Abs(player.Velocity) < velocityEpsilon {
			player.Velocity = 0
		}

		rad := player.Direction * (math.Pi / 180)
		velocitiesX[playerId] = player.Velocity * math.Cos(rad)
		velocitiesZ[playerId] = player.Velocity * math.Sin(rad)

		gs.Players[playerId] = player
	}

	for playerId, player := range gs.Players {
		if player.Eliminated > 0 {
			continue
		}
		vx, ok := velocitiesX[playerId]
		if !ok {
			continue
		}
		vz := velocitiesZ[playerId]
		if vx == 0 && vz == 0 {
			continue
		}

		player.Position.X += vx * dt
		player.Position.Z += vz * dt

		if player.Position.X < 0 ||
			player.Position.X > float64(gs.Map.Length) ||
			player.Position.Z < 0 ||
			player.Position.Z > float64(gs.Map.Width) {
			player.Eliminated = gs.CurrentRound
			player.Velocity = 0
			player.Accel = 0
			velocitiesX[playerId] = 0
			velocitiesZ[playerId] = 0
			gs.roundEliminated = true
		}

		gs.Players[playerId] = player
	}

	playerIds := make([]string, 0, len(gs.Players))
	for playerId, player := range gs.Players {
		if player.Eliminated > 0 {
			continue
		}
		playerIds = append(playerIds, playerId)
	}

	for i := 0; i < len(playerIds); i++ {
		for j := i + 1; j < len(playerIds); j++ {
			id1 := playerIds[i]
			id2 := playerIds[j]
			p1 := gs.Players[id1]
			p2 := gs.Players[id2]

			dx := p1.Position.X - p2.Position.X
			dz := p1.Position.Z - p2.Position.Z
			distSq := dx*dx + dz*dz
			if distSq == 0 || distSq > collisionDistance*collisionDistance {
				continue
			}

			v1x := velocitiesX[id1]
			v1z := velocitiesZ[id1]
			v2x := velocitiesX[id2]
			v2z := velocitiesZ[id2]

			dvx := v1x - v2x
			dvz := v1z - v2z
			dot := dvx*dx + dvz*dz
			if dot >= 0 {
				continue
			}

			m1 := p1.Mass
			m2 := p2.Mass
			if m1+m2 == 0 {
				continue
			}

			factor1 := (2 * m2 / (m1 + m2)) * (dot / distSq)
			v1x -= factor1 * dx
			v1z -= factor1 * dz

			factor2 := (2 * m1 / (m1 + m2)) * (dot / distSq)
			v2x += factor2 * dx
			v2z += factor2 * dz

			velocitiesX[id1] = v1x
			velocitiesZ[id1] = v1z
			velocitiesX[id2] = v2x
			velocitiesZ[id2] = v2z
		}
	}

	allStopped := true
	for playerId, player := range gs.Players {
		if player.Eliminated > 0 {
			continue
		}
		vx, ok := velocitiesX[playerId]
		if !ok {
			continue
		}
		vz := velocitiesZ[playerId]
		speed := math.Hypot(vx, vz)
		if speed < velocityEpsilon {
			player.Velocity = 0
		} else {
			player.Velocity = speed
			direction := math.Atan2(vz, vx) * (180 / math.Pi)
			if direction < 0 {
				direction += 360
			}
			player.Direction = direction
			allStopped = false
		}
		gs.Players[playerId] = player
	}

	return allStopped
}

func (gs *GameState) shrinkMap() {
	oldLength := gs.Map.Length
	oldWidth := gs.Map.Width
	if oldLength <= 1 || oldWidth <= 1 {
		return
	}

	newLength := int(math.Floor(float64(oldLength) * 0.9))
	newWidth := int(math.Floor(float64(oldWidth) * 0.9))
	if newLength < 1 {
		newLength = 1
	}
	if newWidth < 1 {
		newWidth = 1
	}

	if newLength == oldLength && newWidth == oldWidth {
		return
	}

	scaleX := float64(newLength) / float64(oldLength)
	scaleZ := float64(newWidth) / float64(oldWidth)

	gs.Map.Length = newLength
	gs.Map.Width = newWidth

	for playerId, player := range gs.Players {
		if player.Eliminated > 0 {
			continue
		}
		player.Position.X *= scaleX
		player.Position.Z *= scaleZ

		if player.Position.X < 0 {
			player.Position.X = 0
		}
		if player.Position.X > float64(newLength) {
			player.Position.X = float64(newLength)
		}
		if player.Position.Z < 0 {
			player.Position.Z = 0
		}
		if player.Position.Z > float64(newWidth) {
			player.Position.Z = float64(newWidth)
		}

		gs.Players[playerId] = player
	}
}

func (gs *GameState) EndRound() {
	if gs.roundEliminated {
		gs.shrinkMap()
		gs.roundEliminated = false
	}
	gs.CurrentRound++
}

func (gs *GameState) getAccel(playerId string) float64 {
	player, ok := gs.Players[playerId]
	if !ok {
		return 0
	}
	return player.Accel
}

func (gs *GameState) calcAccel(playerId string) float64 {
	_, ok := gs.Players[playerId]
	if !ok {
		return 0
	}

	playerMove, ok := gs.CurrentMoves[playerId]
	if !ok {
		return 0
	}

	power := playerMove.Power // int (1–5)

	return float64(power) * powerScale
}
