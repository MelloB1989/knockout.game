package middlewares

import (
	"errors"
	"knockout/internal/anal"
	"knockout/internal/models"
	"strings"
	"time"

	"github.com/MelloB1989/karma/config"
	"github.com/dgrijalva/jwt-go"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

func IsPlayerVerified(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	var tokenStr string

	if authHeader != "" {
		trimmed := strings.TrimSpace(authHeader)
		if strings.HasPrefix(strings.ToLower(trimmed), "bearer ") {
			tokenStr = strings.TrimSpace(trimmed[7:])
		} else {
			tokenStr = trimmed
		}
	}

	if tokenStr == "" {
		qToken := strings.TrimSpace(c.Query("token", ""))
		if qToken != "" {
			if strings.HasPrefix(strings.ToLower(qToken), "bearer ") {
				tokenStr = strings.TrimSpace(qToken[7:])
			} else {
				tokenStr = qToken
			}
		}
	}

	if tokenStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "Unauthorized1",
			"error":   errors.New("You are unauthorized for this."),
		})
	}

	token, err := jwt.ParseWithClaims(
		tokenStr,
		&models.Claims{},
		func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.NewError(fiber.StatusUnauthorized, "Unexpected signing method")
			}
			return []byte(config.DefaultConfig().JWTSecret), nil
		},
	)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "Unauthorized3",
			"error":   errors.New("You are unauthorized for this."),
		})
	}

	if claims, ok := token.Claims.(*models.Claims); ok && token.Valid {
		c.Locals("pid", claims.PlayerId)
		c.Locals("exp", time.Unix(claims.ExpiresAt, 0))
		c.Locals("secret", claims.PlayerSecret)
		c.Locals("pfp", claims.Pfp)

		analyticsClient := anal.CreateAnalytics(claims.Username)
		analyticsClient.SetProperty(anal.USER_ID, claims.PlayerId)
		analyticsClient.SetProperty(anal.USER_PFP, claims.Pfp)
		analyticsClient.SetProperty(anal.USER_IP, c.IP())

		c.Locals("analytics", analyticsClient)

		return c.Next()
	}

	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"message": "Unauthorized4",
		"error":   errors.New("You are unauthorized for this."),
	})
}

func GetPlayerId(c *fiber.Ctx) string {
	pid, ok := c.Locals("pid").(string)
	if !ok {
		return ""
	}
	return pid
}

func GetPlayerIdWS(c *websocket.Conn) string {
	pid, ok := c.Locals("pid").(string)
	if !ok {
		return ""
	}
	return pid
}

func GetPlayerSecret(c *fiber.Ctx) string {
	secret, ok := c.Locals("secret").(string)
	if !ok {
		return ""
	}
	return secret
}

func GetPlayerSecretWS(c *websocket.Conn) string {
	secret, ok := c.Locals("secret").(string)
	if !ok {
		return ""
	}
	return secret
}

func GetPlayerPfp(c *fiber.Ctx) string {
	pfp, ok := c.Locals("pfp").(string)
	if !ok {
		return ""
	}
	return pfp
}

func GetPlayerUsername(c *fiber.Ctx) string {
	username, ok := c.Locals("username").(string)
	if !ok {
		return ""
	}
	return username
}

func GetPlayerAnalytics(c *fiber.Ctx) *anal.AnalyticsEngine {
	ae, ok := c.Locals("analytics").(*anal.AnalyticsEngine)
	if !ok {
		return nil
	}
	return ae
}
