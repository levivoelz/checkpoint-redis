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
};

export class RedisSaver extends BaseCheckpointSaver {
  connection: Redis;

  constructor({ connection }: RedisSaverParams, serde?: SerializerProtocol) {
    super(serde);
    this.connection = connection;
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const checkpoint_id = checkpoint.id;
    const {
      thread_id,
      checkpoint_ns = "",
      checkpoint_id: parent_checkpoint_id,
    } = config.configurable ?? {};
    const key = makeRedisCheckpointKey(
      thread_id ?? "",
      checkpoint_ns,
      checkpoint_id
    );
    const [checkpointType, serializedCheckpoint] =
      this.serde.dumpsTyped(checkpoint);
    const [metadataType, serializedMetadata] = this.serde.dumpsTyped(metadata);

    if (checkpointType !== metadataType) {
      throw new Error("Mismatched checkpoint and metadata types.");
    }

    const data = {
      checkpoint: serializedCheckpoint,
      type: checkpointType,
      metadata_type: metadataType,
      metadata: serializedMetadata,
      parent_checkpoint_id: parent_checkpoint_id ?? "",
    };

    await this.connection.hset(key, data);

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
    const { thread_id, checkpoint_ns, checkpoint_id } =
      config.configurable ?? {};

    if (
      thread_id === undefined ||
      checkpoint_ns === undefined ||
      checkpoint_id === undefined
    ) {
      throw new Error(
        `The provided config must contain a configurable field with "thread_id", "checkpoint_ns" and "checkpoint_id" fields.`
      );
    }

    const dumpedWrites = dumpWrites(this.serde, writes);

    for (const [idx, write] of dumpedWrites.entries()) {
      const key = makeRedisCheckpointWritesKey(
        thread_id,
        checkpoint_ns,
        checkpoint_id,
        task_id,
        idx
      );

      void this.connection.hset(key, write);
    }
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { thread_id, checkpoint_ns = "" } = config.configurable ?? {};
    let { checkpoint_id } = config.configurable ?? {};

    if (thread_id === undefined) {
      throw new Error("thread_id is required in config.configurable");
    }

    const checkpointKey = await this._getCheckpointKey(
      thread_id,
      checkpoint_ns,
      checkpoint_id
    );

    if (!checkpointKey) return;

    const checkpointData = await this.connection.hgetall(checkpointKey);

    checkpoint_id =
      checkpoint_id ?? parseRedisCheckpointKey(checkpointKey).checkpoint_id;

    const writesKey = makeRedisCheckpointWritesKey(
      thread_id,
      checkpoint_ns,
      checkpoint_id,
      "*",
      null
    );

    const matchingKeys = await this.connection.keys(writesKey);
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
