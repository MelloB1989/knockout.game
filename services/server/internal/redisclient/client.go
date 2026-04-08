package redisclient

import (
	"sync"

	"github.com/MelloB1989/karma/utils"
	"github.com/redis/go-redis/v9"
)

var (
	clientOnce sync.Once
	client     *redis.Client
)

func Client() *redis.Client {
	clientOnce.Do(func() {
		client = utils.RedisConnect()
	})
	return client
}
