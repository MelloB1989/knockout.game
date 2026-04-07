package constants

import "os"

func GetAllowedOrigins() []string {
	origins := []string{
		"https://knockout.mellob.in",
	}

	// Only include local/private IPs in dev mode
	if os.Getenv("ENV") == "DEV" {
		origins = append(origins,
			"http://localhost:3000",
			"http://localhost:9000",
		)
	}

	return origins
}
