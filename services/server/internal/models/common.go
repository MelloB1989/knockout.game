package models

import "github.com/dgrijalva/jwt-go"

type Claims struct {
	PlayerId     string `json:"player_id"`
	Username     string `json:"username"`
	PlayerSecret string `json:"player_secret"`
	Pfp          string `json:"pfp"`
	jwt.StandardClaims
}
