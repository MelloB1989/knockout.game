package handlers

import (
	"context"
	"encoding/json"
	"time"

	"knockout/internal/models"
	"knockout/internal/redisclient"

	"github.com/MelloB1989/karma/config"
	"github.com/MelloB1989/karma/utils"
	"github.com/dgrijalva/jwt-go"
	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()

type guestAuthRequest struct {
	PlayerSecret string `json:"player_secret"`
	Username     string `json:"username"`
	Pfp          string `json:"pfp"`
}

type guestAuthResponse struct {
	Token    string `json:"token"`
	PlayerId string `json:"player_id"`
}

type redisPlayerDetails struct {
	PlayerId     string `json:"player_id"`
	PlayerSecret string `json:"player_secret"`
	Username     string `json:"username"`
	Pfp          string `json:"pfp"`
}

func GuestAuthHandler(c *fiber.Ctx) error {
	var req guestAuthRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	if req.PlayerSecret == "" || req.Username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "player_secret and username are required",
		})
	}

	playerId := "anonymous_" + utils.GenerateID(8)

	rc := redisclient.Client()

	playerDetails := redisPlayerDetails{
		PlayerId:     playerId,
		PlayerSecret: req.PlayerSecret,
		Username:     req.Username,
		Pfp:          req.Pfp,
	}
	data, err := json.Marshal(playerDetails)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to store player details",
		})
	}

	if err := rc.Set(ctx, "player:"+playerId, data, 5*time.Minute).Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to store player details",
		})
	}

	claims := models.Claims{
		PlayerId:     playerId,
		Username:     req.Username,
		PlayerSecret: req.PlayerSecret,
		Pfp:          req.Pfp,
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: time.Now().Add(24 * time.Hour).Unix(),
			IssuedAt:  time.Now().Unix(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte(config.DefaultConfig().JWTSecret))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to generate token",
		})
	}

	return c.Status(fiber.StatusOK).JSON(guestAuthResponse{
		Token:    tokenStr,
		PlayerId: playerId,
	})
}

func RefreshGuestHandler(c *fiber.Ctx) error {
	rc := redisclient.Client()

	playerId := c.Locals("pid").(string)
	playerSecret := c.Locals("secret").(string)

	data, err := rc.Get(ctx, "player:"+playerId).Result()
	if err == redis.Nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "player session expired",
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to check player",
		})
	}

	var details redisPlayerDetails
	if err := json.Unmarshal([]byte(data), &details); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "corrupted player data",
		})
	}

	if details.PlayerSecret != playerSecret {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid secret",
		})
	}

	// Extend TTL
	rc.Expire(ctx, "player:"+playerId, 5*time.Minute)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"player_id": playerId,
		"username":  details.Username,
	})
}
