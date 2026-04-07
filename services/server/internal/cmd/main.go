package cmd

import (
	"knockout/internal/server"
	"log"
)

func StartServer() {
	fiber := server.GetRoutes()
	log.Println("Server started")
	fiber.Listen(":9000")
}
