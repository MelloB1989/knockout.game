package entities

type Map struct {
	Id             string  `json:"id"`
	Type           string  `json:"type"`
	Length         int     `json:"length"`
	Width          int     `json:"width"`
	OriginalLength int     `json:"original_length,omitempty"`
	OriginalWidth  int     `json:"original_width,omitempty"`
	Friction       float64 `json:"friction"`
}
