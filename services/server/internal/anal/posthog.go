package anal

import (
	"github.com/MelloB1989/karma/config"
	"github.com/posthog/posthog-go"
)

type PackageEvents interface {
	SendEvent(event Events)
	SendError(fail_type Events, err error)
	SetProperty(property Properties, value any)
}

func CreatePostHogClient() (posthog.Client, error) {
	client, err := posthog.NewWithConfig(config.GetEnvRaw("POSTHOG_KEY"), posthog.Config{Endpoint: config.GetEnvRaw("POSTHOG_ENDPOINT")})
	if err != nil {
		return nil, err
	}

	return client, nil
}
