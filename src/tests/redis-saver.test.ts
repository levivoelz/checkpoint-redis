import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import {
  Checkpoint,
  CheckpointTuple,
  uuid6,
} from "@langchain/langgraph-checkpoint";
import Redis from "ioredis-mock";

import { RedisSaver } from "../redis-saver.js";

const redisClient = new Redis();
const saver = new RedisSaver({ connection: redisClient });
const saverWithTTL = new RedisSaver({ connection: redisClient, ttl: 60 });

const checkpoint1: Checkpoint = {
  v: 1,
  id: uuid6(-1),
  ts: "2024-04-19T17:19:07.952Z",
  channel_values: {
    someKey1: "someValue1",
  },
  channel_versions: {
    someKey2: 1,
  },
  versions_seen: {
    someKey3: {
      someKey4: 1,
    },
  },
  pending_sends: [],
};

const checkpoint2: Checkpoint = {
  v: 1,
  id: uuid6(1),
  ts: "2024-04-20T17:19:07.952Z",
  channel_values: {
    someKey1: "someValue2",
  },
  channel_versions: {
    someKey2: 2,
  },
  versions_seen: {
    someKey3: {
      someKey4: 2,
    },
  },
  pending_sends: [],
};

before(async () => {
  // Clear the Redis database before running tests
  await redisClient.flushall();
});

after(async () => {
  await redisClient.quit();
});

await describe("RedisSaver", async () => {
  await it("should save and retrieve checkpoints correctly", async () => {
    const undefinedCheckpoint = await saver.getTuple({
      configurable: { thread_id: "1" },
    });

    assert.strictEqual(undefinedCheckpoint, undefined);

    const runnableConfig = await saver.put(
      { configurable: { thread_id: "1" } },
      checkpoint1,
      { source: "update", step: -1, writes: null }
    );

    assert.deepEqual(runnableConfig, {
      configurable: {
        thread_id: "1",
        checkpoint_id: checkpoint1.id,
        checkpoint_ns: "",
      },
    });

    await saver.putWrites(
      {
        configurable: {
          checkpoint_id: checkpoint1.id,
          checkpoint_ns: "",
          thread_id: "1",
        },
      },
      [["bar", "baz"]],
      "foo"
    );

    const firstCheckpointTuple = await saver.getTuple({
      configurable: { thread_id: "1" },
    });

    assert.deepEqual(firstCheckpointTuple?.config, {
      configurable: {
        thread_id: "1",
        checkpoint_ns: "",
        checkpoint_id: checkpoint1.id,
      },
    });
    assert.deepEqual(firstCheckpointTuple?.checkpoint, checkpoint1);
    assert.strictEqual(firstCheckpointTuple?.parentConfig, undefined);
    assert.deepEqual(firstCheckpointTuple?.pendingWrites, [
      ["foo", "bar", "baz"],
    ]);

    // save second checkpoint
    await saver.put(
      {
        configurable: {
          thread_id: "1",
          checkpoint_id: "2024-04-18T17:19:07.952Z",
        },
      },
      checkpoint2,
      { source: "update", step: -1, writes: null }
    );

    const secondCheckpointTuple = await saver.getTuple({
      configurable: {
        thread_id: "1",
        checkpoint_ns: "",
        checkpoint_id: checkpoint2.id,
      },
    });

    assert.deepEqual(secondCheckpointTuple?.checkpoint, checkpoint2);

    const checkpointTupleGenerator = saver.list({
      configurable: { thread_id: "1" },
    });
    const checkpointTuples: CheckpointTuple[] = [];

    for await (const checkpoint of checkpointTupleGenerator) {
      checkpointTuples.push(checkpoint);
    }

    assert.strictEqual(checkpointTuples.length, 2);

    const checkpointTuple1 = checkpointTuples[0];
    const checkpointTuple2 = checkpointTuples[1];

    assert.strictEqual(
      checkpointTuple1.checkpoint.ts,
      "2024-04-19T17:19:07.952Z"
    );
    assert.strictEqual(
      checkpointTuple2.checkpoint.ts,
      "2024-04-20T17:19:07.952Z"
    );
  });

  await it("should set TTL on checkpoint keys when configured", async () => {
    // Clear Redis before test
    await redisClient.flushall();

    const checkpoint: Checkpoint = {
      v: 1,
      id: uuid6(-1),
      ts: "2024-04-19T17:19:07.952Z",
      channel_values: { testKey: "testValue" },
      channel_versions: { testKey: 1 },
      versions_seen: {},
      pending_sends: [],
    };

    // Save checkpoint with TTL
    await saverWithTTL.put(
      { configurable: { thread_id: "ttl-test" } },
      checkpoint,
      { source: "update", step: -1, writes: null }
    );

    // Check that TTL was set
    const key = "checkpoint:ttl-test::" + checkpoint.id;
    const ttl = await redisClient.ttl(key);
    
    // TTL should be set (exact value may vary due to Redis mock behavior)
    assert.ok(ttl > 0, "TTL should be set on checkpoint key");
  });

  await it("should validate constructor parameters", async () => {
    // Test missing connection
    assert.throws(
      () => new RedisSaver({ connection: undefined as any }),
      /RedisSaver requires a valid Redis connection/
    );

    // Test invalid TTL values
    assert.throws(
      () => new RedisSaver({ connection: redisClient, ttl: -1 }),
      /Invalid TTL value: -1/
    );

    assert.throws(
      () => new RedisSaver({ connection: redisClient, ttl: 1.5 }),
      /Invalid TTL value: 1.5/
    );

    assert.throws(
      () => new RedisSaver({ connection: redisClient, ttl: "invalid" as any }),
      /Invalid TTL value: invalid/
    );

    // Test valid TTL
    assert.doesNotThrow(
      () => new RedisSaver({ connection: redisClient, ttl: 3600 })
    );
  });

  await it("should validate put() method parameters", async () => {
    // Test missing config
    await assert.rejects(
      () => saver.put(undefined as any, checkpoint1, { source: "update", step: -1, writes: null }),
      /put\(\) requires a valid RunnableConfig/
    );

    // Test missing checkpoint
    await assert.rejects(
      () => saver.put({ configurable: { thread_id: "test" } }, undefined as any, { source: "update", step: -1, writes: null }),
      /put\(\) requires a valid Checkpoint/
    );

    // Test missing metadata
    await assert.rejects(
      () => saver.put({ configurable: { thread_id: "test" } }, checkpoint1, undefined as any),
      /put\(\) requires valid CheckpointMetadata/
    );

    // Test missing thread_id
    await assert.rejects(
      () => saver.put({ configurable: {} }, checkpoint1, { source: "update", step: -1, writes: null }),
      /put\(\) requires config.configurable.thread_id to be defined/
    );

    // Test checkpoint without id
    const invalidCheckpoint = { ...checkpoint1, id: undefined };
    await assert.rejects(
      () => saver.put({ configurable: { thread_id: "test" } }, invalidCheckpoint as any, { source: "update", step: -1, writes: null }),
      /put\(\) requires checkpoint to have a valid id/
    );
  });

  await it("should validate putWrites() method parameters", async () => {
    // Test missing config
    await assert.rejects(
      () => saver.putWrites(undefined as any, [], "task1"),
      /putWrites\(\) requires a valid RunnableConfig/
    );

    // Test invalid writes
    await assert.rejects(
      () => saver.putWrites({ configurable: { thread_id: "test", checkpoint_ns: "", checkpoint_id: "test" } }, "not-array" as any, "task1"),
      /putWrites\(\) requires writes to be an array/
    );

    // Test invalid task_id
    await assert.rejects(
      () => saver.putWrites({ configurable: { thread_id: "test", checkpoint_ns: "", checkpoint_id: "test" } }, [], undefined as any),
      /putWrites\(\) requires a valid task_id string/
    );

    // Test missing required config fields
    await assert.rejects(
      () => saver.putWrites({ configurable: {} }, [], "task1"),
      /putWrites\(\) requires config.configurable to contain "thread_id", "checkpoint_ns" and "checkpoint_id" fields/
    );
  });

  await it("should validate getTuple() method parameters", async () => {
    // Test missing config
    await assert.rejects(
      () => saver.getTuple(undefined as any),
      /getTuple\(\) requires a valid RunnableConfig/
    );

    // Test missing thread_id
    await assert.rejects(
      () => saver.getTuple({ configurable: {} }),
      /getTuple\(\) requires config.configurable.thread_id to be defined/
    );
  });
});
