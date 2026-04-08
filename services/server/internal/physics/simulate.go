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
	AcceptingMoves  bool                            `json:"accepting_moves"`
	ServerFrame     int64                           `json:"server_frame"`
	ServerTimeMs    int64                           `json:"server_time_ms"`
	roundEliminated bool
	LastHitBy       map[string]string `json:"-"` // tracks last collision partner per player (ephemeral)
}

type velocityVector struct {
	X float64
	Z float64
}

type orientedCollider struct {
	center    entities.Position
	right     velocityVector
	forward   velocityVector
	halfWidth float64
	halfDepth float64
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
	gs.LastHitBy = make(map[string]string) // reset collision tracking per round
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

	velocities := make(map[string]velocityVector, len(gs.Players))

	for playerId, player := range gs.Players {
		if player.Eliminated > 0 {
			continue
		}

		if player.Accel != 0 {
			player.Velocity += player.Accel * launchImpulseDT
			player.Accel = 0
		}

		if math.Abs(player.Velocity) < velocityEpsilon {
			player.Velocity = 0
		}

		rad := player.Direction * (math.Pi / 180)
		velocities[playerId] = velocityVector{
			X: player.Velocity * math.Cos(rad),
			Z: player.Velocity * math.Sin(rad),
		}

		gs.Players[playerId] = player
	}

	subDt := dt / float64(collisionSubsteps)
	subDamping := 0.0
	if damping > 0 {
		subDamping = math.Pow(damping, 1/float64(collisionSubsteps))
	}

	for step := 0; step < collisionSubsteps; step++ {
		for playerId, player := range gs.Players {
			if player.Eliminated > 0 {
				continue
			}

			velocity, ok := velocities[playerId]
			if !ok {
				continue
			}

			velocity.X *= subDamping
			velocity.Z *= subDamping
			if math.Hypot(velocity.X, velocity.Z) < velocityEpsilon {
				velocity = velocityVector{}
			}

			player.Position.X += velocity.X * subDt
			player.Position.Z += velocity.Z * subDt

			velocities[playerId] = velocity
			gs.Players[playerId] = player
		}

		gs.eliminateOutOfBoundsPlayers(velocities)

		for pass := 0; pass < collisionPasses; pass++ {
			if !gs.resolvePlayerCollisions(velocities) {
				break
			}
			gs.eliminateOutOfBoundsPlayers(velocities)
		}
	}

	allStopped := true
	for playerId, player := range gs.Players {
		if player.Eliminated > 0 {
			continue
		}
		velocity, ok := velocities[playerId]
		if !ok {
			continue
		}
		speed := math.Hypot(velocity.X, velocity.Z)
		if speed < velocityEpsilon {
			player.Velocity = 0
		} else {
			player.Velocity = speed
			direction := math.Atan2(velocity.Z, velocity.X) * (180 / math.Pi)
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

func (gs *GameState) eliminateOutOfBoundsPlayers(velocities map[string]velocityVector) {
	for playerId, player := range gs.Players {
		if player.Eliminated > 0 || !gs.isOutOfBounds(player.Position, player.Direction) {
			continue
		}
		gs.eliminatePlayer(playerId, player, velocities)
	}
}

func (gs *GameState) eliminatePlayer(playerId string, player entities.Penguin, velocities map[string]velocityVector) {
	player.Eliminated = gs.CurrentRound
	player.Velocity = 0
	player.Accel = 0
	velocities[playerId] = velocityVector{}
	gs.roundEliminated = true
	gs.Players[playerId] = player

	if gs.LastHitBy == nil {
		return
	}

	hitterId, ok := gs.LastHitBy[playerId]
	if !ok {
		return
	}

	hitter, ok := gs.Players[hitterId]
	if !ok || hitter.Eliminated > 0 {
		return
	}

	hitter.Score += 10
	gs.Players[hitterId] = hitter
}

func (gs *GameState) isOutOfBounds(position entities.Position, direction float64) bool {
	collider := makePenguinCollider(position, direction)
	extentX, extentZ := collider.axisAlignedExtents()
	minX := collider.center.X - extentX
	maxX := collider.center.X + extentX
	minZ := collider.center.Z - extentZ
	maxZ := collider.center.Z + extentZ
	return minX < 0 ||
		maxX > float64(gs.Map.Length) ||
		minZ < 0 ||
		maxZ > float64(gs.Map.Width)
}

func (gs *GameState) resolvePlayerCollisions(velocities map[string]velocityVector) bool {
	playerIds := make([]string, 0, len(gs.Players))
	for playerId, player := range gs.Players {
		if player.Eliminated > 0 {
			continue
		}
		playerIds = append(playerIds, playerId)
	}

	resolved := false
	for i := 0; i < len(playerIds); i++ {
		for j := i + 1; j < len(playerIds); j++ {
			id1 := playerIds[i]
			id2 := playerIds[j]
			p1 := gs.Players[id1]
			p2 := gs.Players[id2]
			v1 := velocities[id1]
			v2 := velocities[id2]

			collided, impacted := resolvePenguinCollision(&p1, &p2, &v1, &v2)
			if !collided {
				continue
			}

			gs.Players[id1] = p1
			gs.Players[id2] = p2
			velocities[id1] = v1
			velocities[id2] = v2
			resolved = true

			if impacted {
				if gs.LastHitBy == nil {
					gs.LastHitBy = make(map[string]string)
				}
				gs.LastHitBy[id1] = id2
				gs.LastHitBy[id2] = id1
			}
		}
	}

	return resolved
}

func resolvePenguinCollision(p1, p2 *entities.Penguin, v1, v2 *velocityVector) (bool, bool) {
	c1 := penguinColliderFromPenguin(*p1)
	c2 := penguinColliderFromPenguin(*p2)
	nx, nz, overlap, collided := colliderContactNormal(c1, c2)
	if !collided {
		return false, false
	}

	invMass1 := inverseMass(p1.Mass)
	invMass2 := inverseMass(p2.Mass)
	invMassSum := invMass1 + invMass2
	if invMassSum == 0 {
		return false, false
	}

	if overlap > 0 {
		correction := math.Max(overlap-collisionSlop, 0) * correctionPercent / invMassSum
		if correction > 0 {
			correctionX := nx * correction
			correctionZ := nz * correction
			p1.Position.X -= correctionX * invMass1
			p1.Position.Z -= correctionZ * invMass1
			p2.Position.X += correctionX * invMass2
			p2.Position.Z += correctionZ * invMass2
		}
	}

	relativeX := v2.X - v1.X
	relativeZ := v2.Z - v1.Z
	velocityAlongNormal := relativeX*nx + relativeZ*nz
	if velocityAlongNormal >= 0 {
		return true, false
	}

	impulseMagnitude := -(1 + collisionBounce) * velocityAlongNormal / invMassSum
	impulseX := nx * impulseMagnitude
	impulseZ := nz * impulseMagnitude

	v1.X -= impulseX * invMass1
	v1.Z -= impulseZ * invMass1
	v2.X += impulseX * invMass2
	v2.Z += impulseZ * invMass2

	if collisionFriction <= 0 {
		return true, true
	}

	relativeX = v2.X - v1.X
	relativeZ = v2.Z - v1.Z
	tangentX := relativeX - (relativeX*nx+relativeZ*nz)*nx
	tangentZ := relativeZ - (relativeX*nx+relativeZ*nz)*nz
	tangentMag := math.Hypot(tangentX, tangentZ)
	if tangentMag <= zeroDistanceEps {
		return true, true
	}

	tangentX /= tangentMag
	tangentZ /= tangentMag

	frictionImpulseMagnitude := -(relativeX*tangentX + relativeZ*tangentZ) / invMassSum
	maxFrictionImpulse := impulseMagnitude * collisionFriction
	if frictionImpulseMagnitude > maxFrictionImpulse {
		frictionImpulseMagnitude = maxFrictionImpulse
	}
	if frictionImpulseMagnitude < -maxFrictionImpulse {
		frictionImpulseMagnitude = -maxFrictionImpulse
	}

	frictionImpulseX := tangentX * frictionImpulseMagnitude
	frictionImpulseZ := tangentZ * frictionImpulseMagnitude
	v1.X -= frictionImpulseX * invMass1
	v1.Z -= frictionImpulseZ * invMass1
	v2.X += frictionImpulseX * invMass2
	v2.Z += frictionImpulseZ * invMass2

	return true, true
}

func penguinColliderFromPenguin(player entities.Penguin) orientedCollider {
	return makePenguinCollider(player.Position, player.Direction)
}

func makePenguinCollider(position entities.Position, direction float64) orientedCollider {
	rad := direction * (math.Pi / 180)
	forward := velocityVector{
		X: math.Cos(rad),
		Z: math.Sin(rad),
	}
	right := velocityVector{
		X: -forward.Z,
		Z: forward.X,
	}
	return orientedCollider{
		center: entities.Position{
			X: position.X + forward.X*penguinColliderForwardOffset,
			Z: position.Z + forward.Z*penguinColliderForwardOffset,
		},
		right:     right,
		forward:   forward,
		halfWidth: penguinColliderHalfWidth,
		halfDepth: penguinColliderHalfDepth,
	}
}

func (c orientedCollider) axisAlignedExtents() (float64, float64) {
	extentX := math.Abs(c.right.X)*c.halfWidth + math.Abs(c.forward.X)*c.halfDepth
	extentZ := math.Abs(c.right.Z)*c.halfWidth + math.Abs(c.forward.Z)*c.halfDepth
	return extentX, extentZ
}

func colliderContactNormal(a, b orientedCollider) (float64, float64, float64, bool) {
	axes := [...]velocityVector{
		a.right,
		a.forward,
		b.right,
		b.forward,
	}
	centerDelta := velocityVector{
		X: b.center.X - a.center.X,
		Z: b.center.Z - a.center.Z,
	}

	bestOverlap := math.Inf(1)
	bestAxis := velocityVector{}
	for _, axis := range axes {
		overlap := projectionOverlap(a, b, centerDelta, axis)
		if overlap <= 0 {
			return 0, 0, 0, false
		}
		if overlap < bestOverlap {
			bestOverlap = overlap
			bestAxis = axis
		}
	}

	if dot(centerDelta, bestAxis) < 0 {
		bestAxis.X = -bestAxis.X
		bestAxis.Z = -bestAxis.Z
	}

	return bestAxis.X, bestAxis.Z, bestOverlap, true
}

func projectionOverlap(a, b orientedCollider, centerDelta, axis velocityVector) float64 {
	distance := math.Abs(dot(centerDelta, axis))
	reach := projectionRadius(a, axis) + projectionRadius(b, axis)
	return reach - distance
}

func projectionRadius(c orientedCollider, axis velocityVector) float64 {
	return c.halfWidth*math.Abs(dot(c.right, axis)) +
		c.halfDepth*math.Abs(dot(c.forward, axis))
}

func dot(a, b velocityVector) float64 {
	return a.X*b.X + a.Z*b.Z
}

func inverseMass(mass float64) float64 {
	if mass <= 0 {
		return 0
	}
	return 1 / mass
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
