package entities

type Position struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
}

type Penguin struct {
	Id         string   `json:"id"`
	Type       string   `json:"type"`
	Position   Position `json:"position"`
	Mass       float64  `json:"mass"`
	Accel      float64  `json:"accel"`     //Latest acceleration
	Velocity   float64  `json:"velocity"`  //Latest velocity
	Direction  float64  `json:"direction"` //in degrees (0-360)
	Eliminated bool     `json:"eliminated"`
}

type PenguinMove struct {
	Direction float64 `json:"direction"` //in degrees (0-360)
	Power     int     `json:"power"`     // Levels of power (2,4,6,8,10)
}
