package physics

const (
	defaultDT         = 0.05
	launchImpulseDT   = 0.3
	velocityEpsilon   = 0.3
	collisionSubsteps = 4
	collisionPasses   = 3
	collisionSlop     = 0.01
	correctionPercent = 0.85
	collisionBounce   = 0.92
	collisionFriction = 0.03
	zeroDistanceEps   = 1e-9
	powerScale        = 2.5
)

// Collider dimensions are derived from the visible penguin GLB footprint after
// the client-side 1.2x model scale is applied. We keep one shared body collider
// across skins so cosmetics don't affect gameplay fairness.
const (
	penguinColliderHalfWidth     = 0.527796
	penguinColliderHalfDepth     = 0.48
	penguinColliderForwardOffset = 0.12
)

// Player constants
const (
	NormalMass = 1.0
)
