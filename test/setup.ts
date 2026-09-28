import { beforeEach } from 'vitest';
import { MemoryStore, setStoreForTests } from '../lib/store';

// Fresh in-memory store per test so rate-limit / budget / cache state never leaks.
beforeEach(() => {
  setStoreForTests(new MemoryStore());
});
