package server

import (
	"knockout/internal/server/handlers"
	"knockout/internal/server/middlewares"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/websocket/v2"
)

func Serve() {
	app := fiber.New(fiber.Config{
		BodyLimit:             8000 * 1024 * 1024,
		DisableStartupMessage: true,
	})
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, X-Karma-Admin-Auth",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))
	v1 := app.Group("/v1")
	gameserviceRoutes := v1.Group("/game")
	gameserviceRoutes.Get("/maps", handlers.GetMapsHandler)
	gameserviceRoutes.Get("/skins", handlers.GetSkinsHandler)
	gameserviceRoutes.Post("/create", middlewares.IsPlayerVerified, handlers.CreateGameHandler)
	gameserviceRoutes.Get("/ws/:gameId", middlewares.IsPlayerVerified, websocket.New(handlers.WSHandler))
}
