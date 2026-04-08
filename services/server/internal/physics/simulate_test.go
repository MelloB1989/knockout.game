package physics

import (
	"math"
	"testing"

	"knockout/internal/models/entities"
)

func TestResolvePlayerCollisionsSeparatesOverlap(t *testing.T) {
	gs := &GameState{
		Players: map[string]entities.Penguin{
			"p1": {
				Id:       "p1",
				Mass:     NormalMass,
				Position: entities.Position{X: 10, Z: 10},
			},
			"p2": {
				Id:       "p2",
				Mass:     NormalMass,
				Position: entities.Position{X: 10.7, Z: 10},
			},
		},
	}

	velocities := map[string]velocityVector{
		"p1": {},
		"p2": {},
	}

	startDist := distance(gs.Players["p1"].Position, gs.Players["p2"].Position)
	for i := 0; i < collisionPasses*4; i++ {
		gs.resolvePlayerCollisions(velocities)
	}
	endDist := distance(gs.Players["p1"].Position, gs.Players["p2"].Position)

	if endDist <= startDist {
		t.Fatalf("expected players to separate, start=%f end=%f", startDist, endDist)
	}
	_, _, overlap, collided := colliderContactNormal(
		penguinColliderFromPenguin(gs.Players["p1"]),
		penguinColliderFromPenguin(gs.Players["p2"]),
	)
	if collided && overlap > collisionSlop+0.02 {
		t.Fatalf("expected overlap to be almost resolved, got distance=%f overlap=%f", endDist, overlap)
	}
}

func TestResolvePenguinCollisionDeflectsGlancingHit(t *testing.T) {
	p1 := entities.Penguin{
		Id:       "p1",
		Mass:     NormalMass,
		Position: entities.Position{X: 5, Z: 5},
	}
	p2 := entities.Penguin{
		Id:        "p2",
		Mass:      NormalMass,
		Position:  entities.Position{X: 5.8, Z: 5.35},
		Direction: 35,
	}

	v1 := velocityVector{X: 4, Z: 0}
	v2 := velocityVector{}

	collided, impacted := resolvePenguinCollision(&p1, &p2, &v1, &v2)
	if !collided || !impacted {
		t.Fatalf("expected glancing hit to resolve with an impulse")
	}

	totalMomentumX := v1.X + v2.X
	totalMomentumZ := v1.Z + v2.Z
	if math.Abs(totalMomentumX-4) > 1e-9 {
		t.Fatalf("expected x momentum to be conserved, got %f", totalMomentumX)
	}
	if math.Abs(totalMomentumZ) > 1e-9 {
		t.Fatalf("expected z momentum to be conserved, got %f", totalMomentumZ)
	}

	if v1.X <= 0.5 {
		t.Fatalf("expected incoming player to keep a tangential glide, got v1=%+v", v1)
	}
	if v1.Z >= -0.5 {
		t.Fatalf("expected incoming player to deflect downward, got v1=%+v", v1)
	}
	if v2.X <= 0.5 || v2.Z <= 0.5 {
		t.Fatalf("expected struck player to pick up diagonal motion, got v2=%+v", v2)
	}
}

func distance(a, b entities.Position) float64 {
	return math.Hypot(a.X-b.X, a.Z-b.Z)
}

func TestIsOutOfBoundsUsesPenguinFootprint(t *testing.T) {
	gs := &GameState{
		Map: entities.Map{
			Length: 20,
			Width:  20,
		},
	}

	if !gs.isOutOfBounds(entities.Position{X: 0.3, Z: 10}, 180) {
		t.Fatalf("expected backward-facing penguin near left edge to be out of bounds")
	}

	if gs.isOutOfBounds(entities.Position{X: 1.5, Z: 10}, 0) {
		t.Fatalf("expected centered penguin to remain inside bounds")
	}
}
