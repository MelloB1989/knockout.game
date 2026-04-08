package handlers

import (
	"knockout/internal/repository"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

func GetLatestGamesHandler(c *fiber.Ctx) error {
	limitStr := c.Query("limit", "12")
	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 12
	}

	games, err := repository.GetLatestGames(limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to load latest games",
		})
	}

	return c.JSON(games)
}
