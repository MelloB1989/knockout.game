package server

import (
	"knockout/internal/constants"
	"knockout/internal/server/handlers"
	"knockout/internal/server/middlewares"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/websocket/v2"
)

func GetRoutes() *fiber.App {
	app := fiber.New(fiber.Config{
		BodyLimit:             8000 * 1024 * 1024,
		DisableStartupMessage: true,
	})
	setupGlobalMiddleware(app)
	v1 := app.Group("/v1")

	authRoutes := v1.Group("/auth")
	authRoutes.Post("/guest", handlers.GuestAuthHandler)

	gameserviceRoutes := v1.Group("/game")
	gameserviceRoutes.Get("/maps", handlers.GetMapsHandler)
	gameserviceRoutes.Get("/skins", handlers.GetSkinsHandler)
	gameserviceRoutes.Get("/latest", handlers.GetLatestGamesHandler)
	gameserviceRoutes.Post("/create", middlewares.IsPlayerVerified, handlers.CreateGameHandler)
	gameserviceRoutes.Get("/ws/:gameId", middlewares.IsPlayerVerified, websocket.New(handlers.WSHandler))

	return app
}

func setupGlobalMiddleware(app *fiber.App) {
	app.Use(logger.New())
	app.Use(recover.New())

	allowedOrigins := constants.GetAllowedOrigins()
	allowedOriginSet := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		allowedOriginSet[origin] = struct{}{}
	}

	app.Use(cors.New(cors.Config{
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, authorization",
		AllowMethods:     "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		AllowCredentials: true,
		AllowOriginsFunc: func(origin string) bool {
			if _, ok := allowedOriginSet[origin]; ok {
				return true
			}
			env := os.Getenv("ENV")
			if env != "DEV" && env != "" {
				return false
			}
			return strings.HasPrefix(origin, "http://localhost:") ||
				strings.HasPrefix(origin, "http://127.0.0.1:") ||
				strings.HasPrefix(origin, "http://[::1]:")
		},
	}))
	app.Use(securityHeaders())
	app.Use(limiter.New(limiter.Config{
		Max:               100,
		Expiration:        60 * time.Second,
		LimiterMiddleware: limiter.SlidingWindow{},
	}))
}

func securityHeaders() fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("X-XSS-Protection", "0")
		c.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		return c.Next()
	}
}
