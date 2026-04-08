package repository

import (
	"fmt"
	"time"

	"knockout/internal/redisclient"

	"github.com/MelloB1989/karma/utils"
	"github.com/redis/go-redis/v9"
)

type DistributedLock struct {
	key   string
	token string
	rc    *redis.Client
}

const (
	defaultLockTTL = 6 * time.Second
)

var (
	unlockScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`)
	refreshScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`)
)

func lockKey(gameId, suffix string) string {
	return fmt.Sprintf("knockout:game:%s:%s", gameId, suffix)
}

func AcquireGameLock(gameId string, ttl time.Duration) (*DistributedLock, bool) {
	return acquireLock(lockKey(gameId, "lock"), ttl)
}

func AcquireGameLoopLock(gameId string, ttl time.Duration) (*DistributedLock, bool) {
	return acquireLock(lockKey(gameId, "loop"), ttl)
}

func acquireLock(key string, ttl time.Duration) (*DistributedLock, bool) {
	if ttl <= 0 {
		ttl = defaultLockTTL
	}
	rc := redisclient.Client()
	token := utils.GenerateID(16)

	ok, err := rc.SetNX(ctx, key, token, ttl).Result()
	if err != nil || !ok {
		return nil, false
	}

	return &DistributedLock{
		key:   key,
		token: token,
		rc:    rc,
	}, true
}

func (l *DistributedLock) Refresh(ttl time.Duration) bool {
	if l == nil || l.rc == nil {
		return false
	}
	if ttl <= 0 {
		ttl = defaultLockTTL
	}
	res, err := refreshScript.Run(ctx, l.rc, []string{l.key}, l.token, ttl.Milliseconds()).Int()
	return err == nil && res > 0
}

func (l *DistributedLock) Release() {
	if l == nil || l.rc == nil {
		return
	}
	_, _ = unlockScript.Run(ctx, l.rc, []string{l.key}, l.token).Result()
}
