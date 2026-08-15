import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Atomically write JSON: write to a temp file in the same directory, then
 * rename over the target so a crash mid-write never corrupts the store.
 */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    // On Windows, rename over an existing file can fail transiently; fall back
    // to remove-then-rename.
    await fs.rm(filePath, { force: true });
    await fs.rename(tmp, filePath);
  }
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** A collection of records indexed by id, persisted as a JSON array. */
export class JsonCollection<T extends { id: string }> {
  private items = new Map<string, T>();

  constructor(private filePath: string) {}

  async load(): Promise<void> {
    const arr = await readJson<T[]>(this.filePath, []);
    this.items = new Map(arr.map((item) => [item.id, item]));
  }

  private async persist(): Promise<void> {
    await writeJsonAtomic(this.filePath, [...this.items.values()]);
  }

  list(): T[] {
    return [...this.items.values()];
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  async put(item: T): Promise<T> {
    this.items.set(item.id, item);
    await this.persist();
    return item;
  }

  async putMany(newItems: T[]): Promise<void> {
    for (const item of newItems) this.items.set(item.id, item);
    await this.persist();
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
    await this.persist();
  }
}

/** A single JSON value (settings, active combat). */
export class JsonValue<T> {
  private value: T;

  constructor(
    private filePath: string,
    private fallback: T,
  ) {
    this.value = fallback;
  }

  async load(): Promise<void> {
    this.value = await readJson<T>(this.filePath, this.fallback);
  }

  get(): T {
    return this.value;
  }

  async set(value: T): Promise<void> {
    this.value = value;
    await writeJsonAtomic(this.filePath, value);
  }
}
