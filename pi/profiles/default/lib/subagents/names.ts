export const FIRST_NAMES = [
  "Clara", "Maya", "Nora", "Iris", "Elena", "June", "Lena", "Sofia",
  "Amara", "Tessa", "Mina", "Rina", "Ada", "Cora", "Hana", "Zoe",
] as const;

export const LAST_NAMES = [
  "Adler", "Bennett", "Carter", "Dawson", "Ellis", "Foster", "Grant", "Hayes",
] as const;

const key = (name: string) => name.toLocaleLowerCase("en-US");

/** Names are intentionally process-local. A runtime owns one allocator per origin. */
export class NameAllocator {
  private readonly used = new Set<string>();
  private readonly firstNames: readonly string[];
  private readonly lastNames: readonly string[];

  constructor(firstNames: readonly string[] = FIRST_NAMES, lastNames: readonly string[] = LAST_NAMES) {
    this.firstNames = firstNames;
    this.lastNames = lastNames;
  }

  allocate(): string {
    for (const first of this.firstNames) {
      if (!this.used.has(key(first))) return this.reserve(first);
    }
    for (const first of this.firstNames) {
      for (const last of this.lastNames) {
        const name = `${first} ${last}`;
        if (!this.used.has(key(name))) return this.reserve(name);
      }
    }

    const base = `${this.firstNames[0]} ${this.lastNames[0]}`;
    let suffix = 2;
    while (this.used.has(key(`${base} ${suffix}`))) suffix++;
    return this.reserve(`${base} ${suffix}`);
  }

  reserve(name: string): string {
    this.used.add(key(name));
    return name;
  }

  snapshot(): string[] {
    return [...this.used];
  }

  has(name: string): boolean {
    return this.used.has(key(name));
  }
}
