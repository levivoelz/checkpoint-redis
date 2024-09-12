# Langchain langgraph Redis Checkpoint Saver

A TypeScript implementation of a Redis-based checkpoint saver for [langgraph](https://github.com/langchain-ai/langgraphjs). Based on [How to create a custom checkpoint saver](https://langchain-ai.github.io/langgraph/how-tos/persistence_redis/) (python).

## Usage

```ts
import { RedisSaver } from "@levivoelz/checkpoint-redis";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL);
const checkpoint = new RedisSaver(redis);
```

## License

MIT
