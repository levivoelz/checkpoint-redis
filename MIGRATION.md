# Migration Guide: v0.1.x to v0.3.x

This guide helps you upgrade from `checkpoint-redis` v0.1.x to v0.3.x.

## Overview

Version 0.3.0 introduces several improvements including TTL support, better error handling, and API enhancements. Most changes are backward compatible, but there are some important updates to be aware of.

## Breaking Changes

### 1. Async Serialization Methods

The `serde.dumpsTyped()` method is now async in the underlying LangGraph library. This affects internal usage but **does not break the public API**.

**What changed:**
- Internal calls to `serde.dumpsTyped()` now use `await`
- The `dumpWrites()` utility function is now async

**Impact:**
- ✅ **Public API unchanged** - all method signatures remain the same
- ✅ **Existing code works** - no changes needed to your application code
- ⚠️ **Internal only** - only affects the library's internal implementation

### 2. New Required Method

The `deleteThread()` method was added to comply with the `BaseCheckpointSaver` interface.

**What changed:**
- Added `deleteThread(threadId: string): Promise<void>` method
- This was required by the updated LangGraph interface

**Impact:**
- ✅ **Additive only** - doesn't break existing code
- ✅ **Optional usage** - only needed if you use thread deletion

### 3. Dependency Updates

Major dependency updates were included to ensure compatibility with the latest LangGraph ecosystem.

**What changed:**
- `@langchain/core` updated to 0.3.78
- `@langchain/langgraph-checkpoint` updated to 0.1.1
- TypeScript updated to 5.9.3
- Various development dependencies updated

**Impact:**
- ✅ **Better compatibility** with latest LangGraph features
- ✅ **Security updates** and bug fixes
- ⚠️ **Peer dependency requirements** - ensure your LangGraph versions are compatible

## New Features

### 1. TTL Support

You can now configure automatic cleanup of old checkpoints:

```typescript
// v0.1.x - No TTL support
const saver = new RedisSaver({ connection: redis });

// v0.3.x - Optional TTL support
const saver = new RedisSaver({ 
  connection: redis, 
  ttl: 3600 // 1 hour in seconds
});
```

**Benefits:**
- Automatic memory management
- Prevents Redis from growing indefinitely
- Configurable per your needs

### 2. Enhanced Error Handling

Error messages are now more descriptive and helpful:

```typescript
// v0.1.x - Basic error messages
// Error: "Mismatched checkpoint and metadata types."

// v0.3.x - Detailed error messages with context
// Error: "Serialization type mismatch: checkpoint type 'json' does not match metadata type 'msgpack'. This usually indicates a serialization configuration issue."
```

**Benefits:**
- Easier debugging
- Better error context
- More actionable error messages

### 3. Improved Validation

Added comprehensive input validation:

```typescript
// v0.3.x now validates all parameters
const saver = new RedisSaver({ connection: redis, ttl: 3600 });

// These will now throw helpful errors:
await saver.put(undefined, checkpoint, metadata); // Error with context
await saver.putWrites(config, "not-array", "task1"); // Error with context
```

**Benefits:**
- Catches errors early
- Prevents silent failures
- Better developer experience

### 4. Fixed deleteThread Method

The `deleteThread` method now properly handles all namespaces:

```typescript
// v0.1.x - Only deleted empty namespace threads
await saver.deleteThread("thread-123");

// v0.3.x - Deletes threads across ALL namespaces
await saver.deleteThread("thread-123"); // Now works correctly
```

**Benefits:**
- Complete thread cleanup
- Works with namespaced threads
- More reliable deletion

## Recommended Upgrades

### 1. Add TTL Configuration

Consider adding TTL to prevent memory growth:

```typescript
// Before
const saver = new RedisSaver({ connection: redis });

// After - Add TTL based on your needs
const saver = new RedisSaver({ 
  connection: redis,
  ttl: 86400 // 24 hours - adjust based on your use case
});
```

### 2. Update Error Handling

Take advantage of improved error messages:

```typescript
// Before
try {
  await saver.put(config, checkpoint, metadata);
} catch (error) {
  console.error("Failed to save checkpoint:", error.message);
}

// After - More specific error handling
try {
  await saver.put(config, checkpoint, metadata);
} catch (error) {
  if (error.message.includes("Serialization type mismatch")) {
    // Handle serialization issues
    console.error("Check your serialization configuration:", error.message);
  } else if (error.message.includes("Failed to save checkpoint to Redis")) {
    // Handle Redis issues
    console.error("Redis operation failed:", error.message);
  } else {
    console.error("Unexpected error:", error.message);
  }
}
```

### 3. Test deleteThread Usage

If you use `deleteThread`, verify it works with your namespaced threads:

```typescript
// Test that deleteThread now works correctly
await saver.put(
  { configurable: { thread_id: "test", checkpoint_ns: "namespace1" } },
  checkpoint,
  metadata
);

// This now properly deletes the thread from all namespaces
await saver.deleteThread("test");
```

## Performance Improvements

### 1. Better Error Handling
- Reduced silent failures
- Faster error detection
- More efficient validation

### 2. Improved deleteThread
- More efficient key pattern matching
- Better Redis operation handling
- Cleaner thread cleanup

## TypeScript Improvements

### 1. Better Type Safety
- More specific error types
- Improved parameter validation
- Better IntelliSense support

### 2. Enhanced JSDoc
- Better parameter documentation
- Clearer method descriptions
- Improved IDE support

## Testing Your Upgrade

1. **Install the new version:**
   ```bash
   npm install checkpoint-redis@^0.3.0
   ```

2. **Run your existing tests:**
   ```bash
   npm test
   ```

3. **Test TTL functionality (optional):**
   ```typescript
   const saverWithTTL = new RedisSaver({ 
     connection: redis, 
     ttl: 60 // 1 minute for testing
   });
   // Test that checkpoints expire as expected
   ```

4. **Verify deleteThread works:**
   ```typescript
   // Test with namespaced threads
   await saver.put(config1, checkpoint1, metadata);
   await saver.put(config2, checkpoint2, metadata);
   await saver.deleteThread("thread-id");
   // Verify both checkpoints are deleted
   ```

## Troubleshooting

### Common Issues

1. **TTL not working as expected:**
   - Ensure TTL is a positive integer (seconds)
   - Check Redis server supports TTL operations
   - Verify TTL is set on both checkpoint and write keys

2. **Error messages seem different:**
   - This is expected - error messages are now more descriptive
   - Update your error handling to take advantage of better context

3. **deleteThread behavior changed:**
   - This is a fix, not a breaking change
   - deleteThread now works correctly across all namespaces
   - Test your thread deletion logic to ensure it works as expected

### Getting Help

- Check the [README](./README.md) for usage examples
- Review the [API Reference](./README.md#api-reference) for method signatures
- Open an issue on GitHub if you encounter problems

## Summary

Version 0.3.0 is a significant improvement that adds TTL support, better error handling, and fixes several issues. The upgrade should be straightforward for most users, with only internal changes that don't affect the public API.

**Key takeaways:**
- ✅ **Public API unchanged** - your existing code will work without changes
- ✅ **New TTL feature** for memory management
- ✅ **Better error messages** and validation
- ✅ **Fixed deleteThread method** - now works across all namespaces
- ✅ **Improved reliability** and performance
- ⚠️ **Internal changes** - async serialization (doesn't affect your code)
