/**
 * Bounded LRU cache (with optional per-entry TTL) backed by Map insertion order.
 * Prevents long-running sessions from accumulating unbounded in-memory entries.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, { at: number; value: V }>()
  private readonly max: number
  private readonly ttlMs: number

  constructor(max: number, ttlMs = 0) {
    this.max = max
    this.ttlMs = ttlMs
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (this.ttlMs > 0 && Date.now() - entry.at >= this.ttlMs) {
      this.map.delete(key)
      return undefined
    }
    // Refresh recency
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  getEntry(key: K): { at: number; value: V } | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (this.ttlMs > 0 && Date.now() - entry.at >= this.ttlMs) {
      this.map.delete(key)
      return undefined
    }
    this.map.delete(key)
    this.map.set(key, entry)
    return entry
  }

  has(key: K): boolean {
    return this.getEntry(key) !== undefined
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, { at: Date.now(), value })
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}
