import { Redis } from "ioredis";
import type { Logger } from "pino";

const MAX_CACHE_VALUE_BYTES = 512 * 1024;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  increment(key: string): Promise<void>;
  close(): Promise<void>;
}

export class RedisCacheService implements CacheStore {
  private readonly redis: Redis;
  private closed = false;

  constructor(redisUrl: string, private readonly logger: Logger) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(250 * (2 ** Math.min(attempt - 1, 4)), 5_000)
    });
    this.redis.on("error", (error) => {
      this.logger.debug({ err: error }, "Redis cache connection unavailable");
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.isReady()) return undefined;
    try {
      const value = await this.redis.get(assertKey(key));
      if (value === null) return undefined;
      return JSON.parse(value, (_name, item: unknown) => {
        return typeof item === "string" && ISO_DATE.test(item) ? new Date(item) : item;
      }) as T;
    } catch (error) {
      this.logger.debug({ err: error, cacheKey: key }, "Cache read failed open");
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.isReady()) return;
    try {
      const serialized = JSON.stringify(value);
      if (Buffer.byteLength(serialized) > MAX_CACHE_VALUE_BYTES) {
        this.logger.debug({ cacheKey: key }, "Cache value exceeded size limit");
        return;
      }
      await this.redis.set(assertKey(key), serialized, "EX", ttlSeconds);
    } catch (error) {
      this.logger.debug({ err: error, cacheKey: key }, "Cache write failed open");
    }
  }

  async increment(key: string): Promise<void> {
    if (!this.isReady()) return;
    try {
      await this.redis.incr(assertKey(key));
    } catch (error) {
      this.logger.debug({ err: error, cacheKey: key }, "Cache invalidation failed open");
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.redis.status !== "ready") {
      this.redis.disconnect(false);
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect(false);
    }
  }

  private isReady(): boolean {
    if (this.redis.status === "ready") return true;
    if (!this.closed && this.redis.status === "wait") {
      void this.redis.connect().catch((error) => {
        this.logger.debug({ err: error }, "Redis cache initial connection failed");
      });
    }
    return false;
  }
}

function assertKey(key: string): string {
  if (key.length === 0 || key.length > 512) throw new Error("Cache key is invalid");
  return key;
}
