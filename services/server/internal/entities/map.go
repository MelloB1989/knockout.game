package entities

type Map struct {
	Id       string  `json:"id"`
	Type     string  `json:"type"`
	Length   int     `json:"length"`
	Width    int     `json:"width"`
	Friction float64 `json:"friction"`
}
