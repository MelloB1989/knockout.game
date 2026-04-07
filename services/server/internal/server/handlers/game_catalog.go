package handlers

import (
	"knockout/internal/models/entities"

	"github.com/gofiber/fiber/v2"
)

type MapConfig struct {
	Id       string  `json:"id"`
	Name     string  `json:"name"`
	Length   int     `json:"length"`
	Width    int     `json:"width"`
	Friction float64 `json:"friction"`
}

var mapCatalog = []MapConfig{
	{
		Id:       "frozen_lake",
		Name:     "Frozen Lake",
		Length:   50,
		Width:    25,
		Friction: 0.18,
	},
	{
		Id:       "tundra_ring",
		Name:     "Tundra Ring",
		Length:   40,
		Width:    20,
		Friction: 0.25,
	},
	{
		Id:       "glacier_pass",
		Name:     "Glacier Pass",
		Length:   60,
		Width:    22,
		Friction: 0.22,
	},
	{
		Id:       "volcano_rim",
		Name:     "Volcano Rim",
		Length:   36,
		Width:    18,
		Friction: 0.32,
	},
	{
		Id:       "neon_arena",
		Name:     "Neon Arena",
		Length:   55,
		Width:    30,
		Friction: 0.28,
	},
}

var skinCatalog = []entities.PlayerSkins{
	entities.SkinDefault,
	entities.SkinIcy,
	entities.SkinLava,
	entities.SkinForest,
	entities.SkinNeon,
	entities.SkinShadow,
	entities.SkinPink,
	entities.SkinShark,
	entities.SkinTuxedo,
	entities.SkinGoldKing,
}

func ListMapConfigs() []MapConfig {
	out := make([]MapConfig, len(mapCatalog))
	copy(out, mapCatalog)
	return out
}

func GetMapConfig(id string) (MapConfig, bool) {
	for _, cfg := range mapCatalog {
		if cfg.Id == id {
			return cfg, true
		}
	}
	return MapConfig{}, false
}

func ListSkins() []entities.PlayerSkins {
	out := make([]entities.PlayerSkins, len(skinCatalog))
	copy(out, skinCatalog)
	return out
}

func IsValidSkin(skin string) bool {
	for _, s := range skinCatalog {
		if string(s) == skin {
			return true
		}
	}
	return false
}

func GetMapsHandler(c *fiber.Ctx) error {
	return c.JSON(mapCatalog)
}

func GetSkinsHandler(c *fiber.Ctx) error {
	return c.JSON(skinCatalog)
}
