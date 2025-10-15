# checkpoint-redis

> **The only Redis-based checkpoint saver for LangGraph in TypeScript/JavaScript**

A production-ready, high-performance checkpoint saver for [LangGraph](https://github.com/langchain-ai/langgraphjs) that uses Redis for persistent state storage. Perfect for building resilient, stateful AI applications that can survive restarts and scale horizontally.

## Why checkpoint-redis?

### 🚀 **Fills a Critical Gap**
- **Only Redis checkpoint saver** for LangGraph in TypeScript/JavaScript
- Official LangGraph checkpoint savers are Python-only (SQLite, PostgreSQL)
- Essential for Node.js/TypeScript LangGraph applications

### ⚡ **Production-Ready Performance**
- **Redis-powered**: Sub-millisecond read/write operations
- **Horizontal scaling**: Share state across multiple application instances
- **Memory efficiency**: Redis's optimized data structures
- **High availability**: Redis clustering and replication support

### 🛡️ **Resilient AI Applications**
- **Survive restarts**: Resume interrupted LangGraph executions
- **State persistence**: Never lose conversation or workflow state
- **Debugging support**: Inspect execution history and state
- **Fault tolerance**: Handle failures gracefully with checkpoint recovery

### 🎯 **Perfect For**
- **Long-running conversations** with AI agents
- **Multi-step workflows** that need to persist state
- **Distributed AI systems** with shared state
- **Production applications** requiring reliability

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

const checkpointSaver = new RedisSaver({ connection: redis });
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
new RedisSaver({ connection: Redis }, serde?: SerializerProtocol)
```

#### Methods

- `put(config, checkpoint, metadata)` - Save a checkpoint
- `getTuple(config)` - Retrieve a checkpoint
- `putWrites(config, writes, taskId)` - Save pending writes
- `list(config, options?)` - List checkpoints with optional filtering

## Contributing

Contributions welcome! Please see our [contributing guidelines](CONTRIBUTING.md).

## License

MIT © [Levi Voelz](https://github.com/levivoelz)
