package handlers

import (
	"strings"
	"time"

	"knockout/internal/models/entities"
	"knockout/internal/physics"
	"knockout/internal/repository"
	"knockout/internal/server/middlewares"

	"github.com/gofiber/fiber/v2"
)

type createGameRequest struct {
	MapType         string             `json:"map_type"`
	WaitTimeSeconds *int               `json:"wait_time_seconds"`
	Skin            string             `json:"skin"`
	Position        *entities.Position `json:"position"`
}

type createGameResponse struct {
	GameId    string             `json:"game_id"`
	HostId    string             `json:"host_id"`
	GameState *physics.GameState `json:"game_state"`
}

func CreateGameHandler(c *fiber.Ctx) error {
	var req createGameRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	mapType := req.MapType
	if mapType == "" {
		mapType = "tundra_ring"
	}
	cfg, ok := GetMapConfig(mapType)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid map_type",
			"maps":  ListMapConfigs(),
		})
	}
	length := cfg.Length
	width := cfg.Width

	hostId := middlewares.GetPlayerId(c)
	hostSecret := middlewares.GetPlayerSecret(c)
	if hostId == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}

	game, err := repository.CreateGame(mapType, length, width)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	game.GameState.Map.Friction = cfg.Friction
	if req.WaitTimeSeconds != nil {
		game.GameState.WaitTime = time.Duration(*req.WaitTimeSeconds) * time.Second
	}

	pos := entities.Position{
		X: float64(length) / 2,
		Z: float64(width) / 2,
	}
	if req.Position != nil {
		pos = *req.Position
	}
	if pos.X < 0 {
		pos.X = 0
	}
	if pos.X > float64(length) {
		pos.X = float64(length)
	}
	if pos.Z < 0 {
		pos.Z = 0
	}
	if pos.Z > float64(width) {
		pos.Z = float64(width)
	}

	skin := req.Skin
	if skin == "" {
		skin = string(entities.SkinDefault)
	}
	if !IsValidSkin(skin) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid skin",
			"skins": ListSkins(),
		})
	}

	playerType := entities.RegisteredPlayer
	if strings.HasPrefix(hostId, "anonymous") {
		playerType = entities.AnonymousPlayer
	}

	hostPlayer := entities.Penguin{
		Id:              hostId,
		PlayerSecret:    hostSecret,
		Type:            playerType,
		Skin:            skin,
		Position:        pos,
		StagePosition:   entities.Position{},
		Zone:            entities.PenguinZoneStage,
		Mass:            physics.NormalMass,
		Accel:           0,
		Velocity:        0,
		Direction:       0,
		PublicDirection: 0,
		Eliminated:      0,
	}
	hostPlayer.StagePosition = defaultStagePositionForIndex(0)

	game.GameState.HostId = hostId

	if _, err := game.RegisterPlayer(hostPlayer); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	if _, err := game.UpdateGame(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	_ = game.PublishEvent(repository.GameCreated, nil, game.GameState)
	_ = game.PublishEvent(repository.PlayerJoined, sanitizePlayer(hostPlayer), nil)

	return c.Status(fiber.StatusCreated).JSON(createGameResponse{
		GameId:    game.Id,
		HostId:    hostId,
		GameState: maskGameStateForPlayer(game.GameState, hostId),
	})
}
