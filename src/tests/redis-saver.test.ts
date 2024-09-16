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
});
