import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  type PendingWrite,
  type CheckpointPendingWrite,
} from "@langchain/langgraph-checkpoint";
/* eslint-disable-next-line import/no-relative-packages */
import { JsonPlusSerializer } from "../../node_modules/@langchain/langgraph-checkpoint/dist/serde/jsonplus.js";

import {
  makeRedisCheckpointKey,
  makeRedisCheckpointWritesKey,
  parseRedisCheckpointKey,
  parseRedisCheckpointWritesKey,
  filterKeys,
  dumpWrites,
  loadWrites,
  parseRedisCheckpointData,
} from "../utils.js";

const serde = new JsonPlusSerializer();

await describe("Redis Checkpoint Utils", async () => {
  await describe("makeRedisCheckpointKey", async () => {
    await it("should create a correct Redis checkpoint key", async () => {
      assert.equal(
        makeRedisCheckpointKey("thread1", "ns1", "id1"),
        "checkpoint:thread1:ns1:id1"
      );
    });

    await it("should handle empty strings", async () => {
      assert.equal(makeRedisCheckpointKey("", "", ""), "checkpoint:::");
    });
  });

  await describe("makeRedisCheckpointWritesKey", async () => {
    await it("should create a correct Redis checkpoint writes key with all parameters", async () => {
      assert.equal(
        makeRedisCheckpointWritesKey("thread1", "ns1", "id1", "task1", 1),
        "writes:thread1:ns1:id1:task1:1"
      );
    });

    await it("should create a correct key without index", async () => {
      assert.equal(
        makeRedisCheckpointWritesKey("thread1", "ns1", "id1", "task1", null),
        "writes:thread1:ns1:id1:task1"
      );
    });

    await it("should handle empty strings", async () => {
      assert.equal(
        makeRedisCheckpointWritesKey("", "", "", "", null),
        "writes::::"
      );
    });
  });

  await describe("parseRedisCheckpointKey", async () => {
    await it("should parse a valid Redis checkpoint key correctly", async () => {
      const result = parseRedisCheckpointKey("checkpoint:thread1:ns1:id1");
      assert.deepEqual(result, {
        thread_id: "thread1",
        checkpoint_ns: "ns1",
        checkpoint_id: "id1",
      });
    });

    await it("should throw an error for invalid key format", async () => {
      assert.throws(() => parseRedisCheckpointKey("invalid:key"), {
        message: "Expected checkpoint key to start with 'checkpoint'",
      });
    });
  });

  await describe("parseRedisCheckpointWritesKey", async () => {
    await it("should parse a valid Redis checkpoint writes key correctly", async () => {
      const result = parseRedisCheckpointWritesKey(
        "writes:thread1:ns1:id1:task1:1"
      );
      assert.deepEqual(result, {
        thread_id: "thread1",
        checkpoint_ns: "ns1",
        checkpoint_id: "id1",
        task_id: "task1",
        idx: "1",
      });
    });

    await it("should handle key without index", async () => {
      const result = parseRedisCheckpointWritesKey(
        "writes:thread1:ns1:id1:task1"
      );
      assert.deepEqual(result, {
        thread_id: "thread1",
        checkpoint_ns: "ns1",
        checkpoint_id: "id1",
        task_id: "task1",
        idx: undefined,
      });
    });

    await it("should throw an error for invalid key format", async () => {
      assert.throws(() => parseRedisCheckpointWritesKey("invalid:key"), {
        message: "Expected checkpoint key to start with 'writes'",
      });
    });
  });

  await describe("filterKeys", async () => {
    const testKeys = [
      "checkpoint:thread1:ns1:id3",
      "checkpoint:thread1:ns1:id1",
      "checkpoint:thread1:ns1:id2",
    ];

    await it("should filter and sort keys correctly", async () => {
      const result = filterKeys(
        testKeys,
        { configurable: { checkpoint_id: "id3" } },
        2
      );
      assert.deepEqual(result, [
        "checkpoint:thread1:ns1:id1",
        "checkpoint:thread1:ns1:id2",
      ]);
    });

    await it("should handle empty before parameter", async () => {
      const result = filterKeys(testKeys, undefined, 2);
      assert.deepEqual(result, [
        "checkpoint:thread1:ns1:id1",
        "checkpoint:thread1:ns1:id2",
      ]);
    });

    await it("should handle no limit", async () => {
      const result = filterKeys(testKeys, {
        configurable: { checkpoint_id: "id4" },
      });
      assert.deepEqual(result, [
        "checkpoint:thread1:ns1:id1",
        "checkpoint:thread1:ns1:id2",
        "checkpoint:thread1:ns1:id3",
      ]);
    });
  });

  await describe("dumpWrites", async () => {
    await it("should correctly serialize writes", async () => {
      const writes: PendingWrite[] = [
        ["channel1", { data: "value1" }],
        ["channel2", { data: "value2" }],
      ];
      const result = dumpWrites(serde, writes);
      assert.equal(result.length, 2);

      // Check first write
      assert.equal(result[0].channel, "channel1");
      assert.equal(result[0].type, "json");
      assert.strictEqual(result[0].value.constructor, Uint8Array);
      const value1 = JSON.parse(new TextDecoder().decode(result[0].value));
      assert.deepEqual(value1, { data: "value1" });

      // Check second write
      assert.equal(result[1].channel, "channel2");
      assert.equal(result[1].type, "json");
      assert.strictEqual(result[1].value.constructor, Uint8Array);
      const value2 = JSON.parse(new TextDecoder().decode(result[1].value));
      assert.deepEqual(value2, { data: "value2" });
    });
  });

  await describe("loadWrites", async () => {
    await it("should correctly deserialize writes", async () => {
      const taskIdToData = {
        task1: {
          channel: "channel1",
          type: "json",
          value: encodeObjectToArrayString({ data: "value1" }),
        },
        task2: {
          channel: "channel2",
          type: "json",
          value: encodeObjectToArrayString({ data: "value2" }),
        },
      };
      const result = await loadWrites(serde, taskIdToData);
      assert.deepEqual(result, [
        ["task1", "channel1", { data: "value1" }],
        ["task2", "channel2", { data: "value2" }],
      ]);
    });
  });

  await describe("parseRedisCheckpointData", async () => {
    await it("should correctly parse Redis checkpoint data", async () => {
      const key = "checkpoint:thread1:ns1:id1";
      const data = {
        type: "json",
        checkpoint: encodeObjectToArrayString({ state: "checkpointState" }),
        metadata_type: "json",
        metadata: encodeObjectToArrayString({ meta: "data" }),
        parent_checkpoint_id: "parentId",
      };
      const pendingWrites: CheckpointPendingWrite[] = [
        ["task1", "channel1", { data: "value1" }],
      ];

      const result = await parseRedisCheckpointData(
        serde,
        key,
        data,
        pendingWrites
      );

      assert.deepEqual(result, {
        config: {
          configurable: {
            thread_id: "thread1",
            checkpoint_ns: "ns1",
            checkpoint_id: "id1",
          },
        },
        checkpoint: { state: "checkpointState" },
        metadata: { meta: "data" },
        parentConfig: {
          configurable: {
            thread_id: "thread1",
            checkpoint_ns: "ns1",
            checkpoint_id: "parentId",
          },
        },
        pendingWrites: [["task1", "channel1", { data: "value1" }]],
      });
    });

    await it("should handle missing parent checkpoint ID", async () => {
      const key = "checkpoint:thread1:ns1:id1";
      const data = {
        type: "json",
        checkpoint: encodeObjectToArrayString({ state: "checkpointState" }),
        metadata_type: "json",
        metadata: encodeObjectToArrayString({ meta: "data" }),
      };

      const result = await parseRedisCheckpointData(serde, key, data);

      assert.equal(result.parentConfig, undefined);
    });
  });
});

function encodeObjectToArrayString(obj: Record<string, string>): string {
  const jsonString = JSON.stringify(obj);
  const uint8Array = new TextEncoder().encode(jsonString);

  return Array.from(uint8Array).join(",");
}
