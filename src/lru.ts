/** Bounded in-memory LRU cache with optional default & per-call TTL so long sessions never leak memory. */
export class LruCache<K, V> {
  private readonly map = new Map<K, { value: V; at: number }>()
  private readonly maxSize: number
  private readonly defaultTtlMs?: number

  constructor(maxSize: number, defaultTtlMs?: number) {
    this.maxSize = Math.max(1, maxSize)
    this.defaultTtlMs = defaultTtlMs
  }

  getEntry(key: K, maxAgeMs = this.defaultTtlMs): { value: V; at: number } | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (maxAgeMs !== undefined && Date.now() - entry.at >= maxAgeMs) {
      this.map.delete(key)
      return undefined
    }
    // Refresh recency order
    this.map.delete(key)
    this.map.set(key, entry)
    return entry
  }

  get(key: K, maxAgeMs = this.defaultTtlMs): V | undefined {
    return this.getEntry(key, maxAgeMs)?.value
  }

  has(key: K, maxAgeMs = this.defaultTtlMs): boolean {
    return this.getEntry(key, maxAgeMs) !== undefined
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, { value, at: Date.now() })
  }

  delete(key: K): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}
