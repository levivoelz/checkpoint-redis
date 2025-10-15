# Roadmap

Planned improvements for `checkpoint-redis`.

## Critical Issues

### Error Handling & Validation
- [x] **Inconsistent validation** - `put()` method doesn't validate `thread_id` ✅ Fixed in commit 6b688e0
- [x] **Silent failures** - `putWrites()` uses fire-and-forget operations with no error handling ✅ Fixed in commit 6b688e0
- [x] **Missing connection validation** - no check if Redis is actually connected ✅ Fixed in commit 6b688e0
- [x] **Better error messages** with context about failed operations ✅ Fixed in commit 6b688e0

### Performance Issues
- [ ] **Inefficient key parsing** - `filterKeys()` parses every key twice
- [ ] **Memory leaks** - `keys()` operations load all matching keys into memory
- [ ] **Batch Redis operations** for `putWrites()` instead of individual `hset` calls
- [ ] **Optimize `_getCheckpointKey()`** - parses all keys to find latest

### Code Quality Issues
- [x] **Fix typo** - `decodeCommaSeperatedString` should be "Separated" ✅ Fixed in commit 6b688e0
- [x] **Fix `deleteThread()`** - hardcodes empty `checkpoint_ns` instead of using parameter ✅ Fixed in commit 0c3efa0
- [x] **Consistent naming** - mix of `thread_id` vs `threadId` throughout codebase ✅ Fixed in commit ae86304
- [ ] **Add null checks** in several places

### API Improvements
- [ ] **Configuration options** for key prefixes and Redis options
- [ ] **Better TypeScript types** - more specific return types
- [ ] **Connection health checks** before operations

## Nice to Have

### Testing
- [x] **Error scenario tests** - Redis failures, malformed data ✅ Added in commit 6b688e0
- [ ] **Integration tests** - real Redis instead of mocks
- [ ] **Concurrent access tests** - race conditions

### Documentation
- [ ] **API documentation** with JSDoc comments
- [ ] **More usage examples** in README
- [ ] **Migration guide** for breaking changes

---

## How to Contribute

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and guidelines.

**Want to help?** Check the issues or start a discussion!
