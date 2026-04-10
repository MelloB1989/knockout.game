package handlers

import (
	"knockout/internal/repository"

	"github.com/gofiber/fiber/v2"
)

func GetLiveGamesHandler(c *fiber.Ctx) error {
	games := repository.ListLiveGames()
	return c.JSON(games)
}
