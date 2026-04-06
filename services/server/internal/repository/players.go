package repository

import (
	"time"

	"github.com/MelloB1989/karma/v2/orm"
)

type Players struct {
	TableName  string    `json:"-" karma_table:"players"`
	Username   string    `json:"username" karma:"primary"`
	Pfp        string    `json:"pfp"`
	Email      string    `json:"email"`
	Points     int       `json:"points"`
	Level      int       `json:"level"`
	LastPlayed time.Time `json:"last_played"`
	JoinedAt   time.Time `json:"joined_at"`
}

func CreatePlayer(username, email, pfp string) (*Players, error) {
	playerORM := orm.Load(&Players{})
	defer playerORM.Close()

	p := &Players{
		Username:   username,
		Email:      email,
		Pfp:        pfp,
		Points:     0,
		Level:      1,
		JoinedAt:   time.Now(),
		LastPlayed: time.Now(),
	}
	if err := playerORM.Insert(p); err != nil {
		return nil, err
	}
	return p, nil
}

func GetPlayerByUsername(username string) (*Players, error) {
	playerORM := orm.Load(&Players{})
	defer playerORM.Close()

	var p []Players
	if err := playerORM.GetByFieldEquals("Username", username).Scan(&p); err != nil {
		return nil, err
	}
	if len(p) == 0 {
		return nil, nil
	}
	return &p[0], nil
}

func UpdatePlayerStats(username string, points, level int) error {
	playerORM := orm.Load(&Players{})
	defer playerORM.Close()

	p, err := GetPlayerByUsername(username)
	if err != nil {
		return err
	}
	p.Points = points
	p.Level = level
	if err := playerORM.Update(p, p.Username); err != nil {
		return err
	}
	return nil
}

func UpdatePlayerPfp(username, pfp string) error {
	playerORM := orm.Load(&Players{})
	defer playerORM.Close()

	p, err := GetPlayerByUsername(username)
	if err != nil {
		return err
	}
	p.Pfp = pfp
	if err := playerORM.Update(p, p.Username); err != nil {
		return err
	}
	return nil
}

func UpdatePlayerLastPlayed(username string) error {
	playerORM := orm.Load(&Players{})
	defer playerORM.Close()

	p, err := GetPlayerByUsername(username)
	if err != nil {
		return err
	}
	p.LastPlayed = time.Now()
	if err := playerORM.Update(p, p.Username); err != nil {
		return err
	}
	return nil
}
