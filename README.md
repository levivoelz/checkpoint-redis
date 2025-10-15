# checkpoint-redis

> **The only Redis-based checkpoint saver for LangGraph in TypeScript/JavaScript**

A Redis checkpoint saver for [LangGraph](https://github.com/langchain-ai/langgraphjs) that persists your app state across restarts and scales with your application.

## Why checkpoint-redis?

### **Fills a Gap**
- **Only Redis checkpoint saver** for LangGraph in TypeScript/JavaScript
- Official LangGraph checkpoint savers are Python-only (SQLite, PostgreSQL)
- Essential for Node.js/TypeScript LangGraph applications

### **Fast & Reliable**
- **Redis-powered**: Fast read/write operations
- **Scales easily**: Share state across multiple app instances
- **Memory efficient**: Redis handles the heavy lifting
- **TTL support**: Automatic cleanup of old checkpoints
- **High availability**: Redis clustering and replication support

### **Keeps Your App Running**
- **Survive restarts**: Resume where you left off
- **Persistent state**: Conversations and workflows persist
- **Easy debugging**: Check execution history and state
- **Fault tolerance**: Graceful recovery with checkpoints

### **Perfect For**
- **Long conversations** with AI agents
- **Multi-step workflows** that need state persistence
- **Distributed systems** with shared state
- **Applications** requiring reliability

## Install

```bash
npm install checkpoint-redis
```

## Quick Start

```ts
import { RedisSaver } from "checkpoint-redis";
import { Redis } from "ioredis";
import { StateGraph } from "@langchain/langgraph";

// Create Redis connection
const redis = new Redis(process.env.REDIS_URL);

// Create checkpoint saver
const checkpointSaver = new RedisSaver({ connection: redis });

// Use with LangGraph
const workflow = new StateGraph({
  // ... your graph definition
}).compile({
  checkpointer: checkpointSaver
});

// Your workflow now persists state to Redis!
const result = await workflow.invoke(
  { input: "Hello" },
  { configurable: { thread_id: "conversation-123" } }
);
```

## Advanced Usage

### Custom Configuration

```ts
import { RedisSaver } from "checkpoint-redis";
import { Redis } from "ioredis";

// Redis with custom configuration
const redis = new Redis({
  host: "localhost",
  port: 6379,
  password: "your-password",
  db: 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

// Basic checkpoint saver
const checkpointSaver = new RedisSaver({ connection: redis });

// With TTL (checkpoints expire after 1 hour)
const checkpointSaverWithTTL = new RedisSaver({ 
  connection: redis, 
  ttl: 3600 // 1 hour in seconds
});
```

### Multiple Threads

```ts
// Each conversation gets its own thread
const config1 = { configurable: { thread_id: "user-123" } };
const config2 = { configurable: { thread_id: "user-456" } };

// These run independently with separate state
await workflow.invoke({ input: "Hi" }, config1);
await workflow.invoke({ input: "Hello" }, config2);
```

### Checkpoint Management

```ts
// List all checkpoints for a thread
for await (const checkpoint of checkpointSaver.list({
  configurable: { thread_id: "user-123" }
})) {
  console.log(`Checkpoint: ${checkpoint.checkpoint.id}`);
  console.log(`Timestamp: ${checkpoint.checkpoint.ts}`);
}

// Get specific checkpoint
const specific = await checkpointSaver.getTuple({
  configurable: { 
    thread_id: "user-123",
    checkpoint_id: "specific-checkpoint-id"
  }
});
```

## Comparison with Alternatives

| Solution | Language | Storage | Production Ready | Performance | Setup |
|----------|----------|---------|------------------|-------------|-------|
| **checkpoint-redis** | **TypeScript** | **Redis** | **✅** | **⚡ High** | **Easy** |
| InMemorySaver | TypeScript | Memory | ❌ | ⚡ Fast | Trivial |
| SqliteSaver | Python | SQLite | ⚠️ | 🐌 Slow | Easy |
| PostgresSaver | Python | PostgreSQL | ✅ | 🚀 Fast | Complex |

## Requirements

- Node.js >= 18
- Redis server
- `@langchain/core` >= 0.2.31
- `@langchain/langgraph-checkpoint` ^0.0.6
- `ioredis` >= 5.0.0

## API Reference

### `RedisSaver`

#### Constructor
```ts
new RedisSaver({ connection: Redis, ttl?: number }, serde?: SerializerProtocol)
```

**Parameters:**
- `connection` - Redis connection instance
- `ttl` - Optional TTL in seconds for checkpoint keys (default: no expiration)

#### Methods

- `put(config, checkpoint, metadata)` - Save a checkpoint
- `getTuple(config)` - Retrieve a checkpoint
- `putWrites(config, writes, taskId)` - Save pending writes
- `list(config, options?)` - List checkpoints with optional filtering

## Migration Guide

Upgrading from v0.1.x? See our [migration guide](MIGRATION.md) for details on new features and improvements.

## Contributing

Contributions welcome! Please see our [contributing guidelines](CONTRIBUTING.md).

## Roadmap

Planned improvements for `checkpoint-redis`:

- **Error Handling** - Better validation and error messages
- **Performance** - Batch operations and memory optimization
- **Code Quality** - Fix bugs and improve consistency
- **API Improvements** - More configuration options and better types

See the [detailed roadmap](./ROADMAP.md) for the complete list.

## License

MIT © [Levi Voelz](https://github.com/levivoelz)
