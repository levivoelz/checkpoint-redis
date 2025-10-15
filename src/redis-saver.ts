import type { RunnableConfig } from "@langchain/core/runnables";
import type { Redis } from "ioredis";
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointTuple,
  type SerializerProtocol,
  type PendingWrite,
  type CheckpointMetadata,
} from "@langchain/langgraph-checkpoint";

import {
  makeRedisCheckpointKey,
  makeRedisCheckpointWritesKey,
  parseRedisCheckpointWritesKey,
  filterKeys,
  dumpWrites,
  loadWrites,
  parseRedisCheckpointData,
  parseRedisCheckpointKey,
} from "./utils.js";

export type RedisSaverParams = {
  connection: Redis;
  ttl?: number; // TTL in seconds for checkpoint keys
};

export class RedisSaver extends BaseCheckpointSaver {
  connection: Redis;
  ttl?: number;

  constructor({ connection, ttl }: RedisSaverParams, serde?: SerializerProtocol) {
    super(serde);
    
    // Validate required parameters
    if (!connection) {
      throw new Error("RedisSaver requires a valid Redis connection. Got: undefined");
    }
    
    // Validate TTL parameter
    if (ttl !== undefined) {
      if (typeof ttl !== 'number' || !Number.isInteger(ttl) || ttl <= 0) {
        throw new Error(`Invalid TTL value: ${ttl}. TTL must be a positive integer (seconds).`);
      }
    }
    
    this.connection = connection;
    this.ttl = ttl;
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    // Validate required parameters
    if (!config) {
      throw new Error("put() requires a valid RunnableConfig. Got: undefined");
    }
    if (!checkpoint) {
      throw new Error("put() requires a valid Checkpoint. Got: undefined");
    }
    if (!metadata) {
      throw new Error("put() requires valid CheckpointMetadata. Got: undefined");
    }
    if (!checkpoint.id) {
      throw new Error("put() requires checkpoint to have a valid id. Got: undefined");
    }

    const checkpoint_id = checkpoint.id;
    const {
      thread_id,
      checkpoint_ns = "",
      checkpoint_id: parent_checkpoint_id,
    } = config.configurable ?? {};

    // Validate required config fields
    if (!thread_id) {
      throw new Error("put() requires config.configurable.thread_id to be defined. Got: undefined");
    }

    const key = makeRedisCheckpointKey(
      thread_id,
      checkpoint_ns,
      checkpoint_id
    );
    const [checkpointType, serializedCheckpoint] =
      await this.serde.dumpsTyped(checkpoint);
    const [metadataType, serializedMetadata] = await this.serde.dumpsTyped(metadata);

    if (checkpointType !== metadataType) {
      throw new Error(
        `Serialization type mismatch: checkpoint type "${checkpointType}" does not match metadata type "${metadataType}". ` +
        `This usually indicates a serialization configuration issue.`
      );
    }

    const data = {
      checkpoint: serializedCheckpoint,
      type: checkpointType,
      metadata_type: metadataType,
      metadata: serializedMetadata,
      parent_checkpoint_id: parent_checkpoint_id ?? "",
    };

    try {
      await this.connection.hset(key, data);

      // Set TTL if configured
      if (this.ttl) {
        await this.connection.expire(key, this.ttl);
      }
    } catch (error) {
      throw new Error(
        `Failed to save checkpoint to Redis: ${error instanceof Error ? error.message : String(error)}. ` +
        `Key: ${key}, Thread: ${thread_id}, Checkpoint: ${checkpoint_id}`
      );
    }

    return {
      configurable: {
        thread_id,
        checkpoint_ns,
        checkpoint_id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    task_id: string
  ): Promise<void> {
    // Validate required parameters
    if (!config) {
      throw new Error("putWrites() requires a valid RunnableConfig. Got: undefined");
    }
    if (!Array.isArray(writes)) {
      throw new Error(`putWrites() requires writes to be an array. Got: ${typeof writes}`);
    }
    if (!task_id || typeof task_id !== 'string') {
      throw new Error(`putWrites() requires a valid task_id string. Got: ${task_id}`);
    }

    const { thread_id, checkpoint_ns, checkpoint_id } =
      config.configurable ?? {};

    if (
      thread_id === undefined ||
      checkpoint_ns === undefined ||
      checkpoint_id === undefined
    ) {
      throw new Error(
        `putWrites() requires config.configurable to contain "thread_id", "checkpoint_ns" and "checkpoint_id" fields. ` +
        `Got: thread_id=${thread_id}, checkpoint_ns=${checkpoint_ns}, checkpoint_id=${checkpoint_id}`
      );
    }

    try {
      const dumpedWrites = await dumpWrites(this.serde, writes);

      for (const [idx, write] of dumpedWrites.entries()) {
        const key = makeRedisCheckpointWritesKey(
          thread_id,
          checkpoint_ns,
          checkpoint_id,
          task_id,
          idx
        );

        try {
          await this.connection.hset(key, write);

          // Set TTL if configured
          if (this.ttl) {
            await this.connection.expire(key, this.ttl);
          }
        } catch (error) {
          throw new Error(
            `Failed to save write to Redis: ${error instanceof Error ? error.message : String(error)}. ` +
            `Key: ${key}, Thread: ${thread_id}, Checkpoint: ${checkpoint_id}, Task: ${task_id}, Index: ${idx}`
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Failed to save write to Redis:')) {
        throw error; // Re-throw Redis operation errors
      }
      throw new Error(
        `Failed to serialize writes: ${error instanceof Error ? error.message : String(error)}. ` +
        `Thread: ${thread_id}, Checkpoint: ${checkpoint_id}, Task: ${task_id}`
      );
    }
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    // Validate required parameters
    if (!config) {
      throw new Error("getTuple() requires a valid RunnableConfig. Got: undefined");
    }

    const { thread_id, checkpoint_ns = "" } = config.configurable ?? {};
    let { checkpoint_id } = config.configurable ?? {};

    // Validate required config fields
    if (!thread_id) {
      throw new Error("getTuple() requires config.configurable.thread_id to be defined. Got: undefined");
    }

    const checkpointKey = await this._getCheckpointKey(
      thread_id,
      checkpoint_ns,
      checkpoint_id
    );

    if (!checkpointKey) return;

    let checkpointData: Record<string, string>;
    try {
      checkpointData = await this.connection.hgetall(checkpointKey);
    } catch (error) {
      throw new Error(
        `Failed to retrieve checkpoint data from Redis: ${error instanceof Error ? error.message : String(error)}. ` +
        `Key: ${checkpointKey}, Thread: ${thread_id}`
      );
    }

    checkpoint_id =
      checkpoint_id ?? parseRedisCheckpointKey(checkpointKey).checkpoint_id;

    const writesKey = makeRedisCheckpointWritesKey(
      thread_id,
      checkpoint_ns,
      checkpoint_id,
      "*",
      null
    );

    let matchingKeys: string[];
    try {
      matchingKeys = await this.connection.keys(writesKey);
    } catch (error) {
      throw new Error(
        `Failed to retrieve write keys from Redis: ${error instanceof Error ? error.message : String(error)}. ` +
        `Pattern: ${writesKey}, Thread: ${thread_id}, Checkpoint: ${checkpoint_id}`
      );
    }

    const parsedKeys = matchingKeys
      .map((key) => parseRedisCheckpointWritesKey(key))
      .sort((a, b) => Number(a.idx) - Number(b.idx));

    const pendingWrites = await loadWrites(
      this.serde,
      Object.fromEntries(
        await Promise.all(
          parsedKeys.map(async (parsedKey, i) => {
            return [
              `${parsedKey.task_id},${parsedKey.idx}`,
              await this.connection.hgetall(matchingKeys[i]),
            ];
          })
        )
      )
    );

    return parseRedisCheckpointData(
      this.serde,
      checkpointKey,
      checkpointData,
      pendingWrites
    );
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const { limit, before } = options ?? {};
    const { thread_id, checkpoint_ns } = config.configurable ?? {};
    const pattern = makeRedisCheckpointKey(thread_id, checkpoint_ns, "*");
    let keys = await this.connection.keys(pattern);

    keys = filterKeys(keys, before, limit);

    for (const key of keys) {
      const data = await this.connection.hgetall(key);
      if (data && data.checkpoint && data.metadata) {
        yield parseRedisCheckpointData(this.serde, key, data);
      }
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    // Get all checkpoint keys for this thread
    const checkpointPattern = makeRedisCheckpointKey(threadId, "", "*");
    const checkpointKeys = await this.connection.keys(checkpointPattern);

    // Get all write keys for this thread
    const writesPattern = makeRedisCheckpointWritesKey(threadId, "", "*", "*", null);
    const writeKeys = await this.connection.keys(writesPattern);

    // Delete all keys
    const allKeys = [...checkpointKeys, ...writeKeys];
    if (allKeys.length > 0) {
      await this.connection.del(...allKeys);
    }
  }

  private async _getCheckpointKey(
    thread_id: string,
    checkpoint_ns: string,
    checkpoint_id: string | undefined
  ): Promise<string | null> {
    if (checkpoint_id) {
      return makeRedisCheckpointKey(thread_id, checkpoint_ns, checkpoint_id);
    }

    const all_keys = await this.connection.keys(
      makeRedisCheckpointKey(thread_id, checkpoint_ns, "*")
    );

    if (all_keys.length === 0) {
      return null;
    }

    const latest_key = all_keys.reduce((maxKey, currentKey) => {
      const maxKeyData = parseRedisCheckpointKey(maxKey);
      const currentKeyData = parseRedisCheckpointKey(currentKey);
      return maxKeyData.checkpoint_id > currentKeyData.checkpoint_id
        ? maxKey
        : currentKey;
    });

    return latest_key;
  }
}
