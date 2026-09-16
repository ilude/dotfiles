import { randomUUID } from "node:crypto";

export const FIRST_NAMES = [
  "Clara", "Maya", "Nora", "Iris", "Elena", "June", "Lena", "Sofia",
  "Amara", "Tessa", "Mina", "Rina", "Ada", "Cora", "Hana", "Zoe",
  "Ava", "Bella", "Celia", "Dalia", "Emma", "Freya", "Gaia", "Hope",
  "Isla", "Jada", "Keira", "Lila", "Mira", "Nina", "Olive", "Poppy",
  "Quinn", "Rosa", "Sara", "Thea", "Uma", "Vera", "Willa", "Xena",
  "Yara", "Zora", "Alice", "Beatrice", "Daisy", "Eva", "Fiona", "Grace",
  "Hazel", "Ivy", "Julia", "Kiara", "Layla", "Lucia", "Mabel", "Naomi",
  "Opal", "Paige", "Raya", "Stella", "Tara", "Violeta", "Wendy", "Yvette",
] as const;

export const LAST_NAMES = [
  "Adler", "Bennett", "Carter", "Dawson", "Ellis", "Foster", "Grant", "Hayes",
] as const;

const key = (name: string) => name.toLocaleLowerCase("en-US");

/** Names are process-local. A runtime owns one allocator per origin. */
export class NameAllocator {
  private readonly reservations = new Map<string, string>();
  private readonly firstNames: readonly string[];
  private readonly lastNames: readonly string[];

  constructor(firstNames: readonly string[] = FIRST_NAMES, lastNames: readonly string[] = LAST_NAMES) {
    this.firstNames = firstNames;
    this.lastNames = lastNames;
  }

  allocate(owner: string = randomUUID()): string {
    for (const first of this.firstNames) {
      if (!this.reservations.has(key(first))) return this.reserve(first, owner);
    }
    for (const first of this.firstNames) {
      for (const last of this.lastNames) {
        const name = `${first} ${last}`;
        if (!this.reservations.has(key(name))) return this.reserve(name, owner);
      }
    }

    const base = `${this.firstNames[0]} ${this.lastNames[0]}`;
    let suffix = 2;
    while (this.reservations.has(key(`${base} ${suffix}`))) suffix++;
    return this.reserve(`${base} ${suffix}`, owner);
  }

  reserve(name: string, owner = `manual:${key(name)}`): string {
    this.reservations.set(key(name), owner);
    return name;
  }

  /** Releases only the reservation held by owner; repeated or stale releases are harmless. */
  release(name: string, owner: string): boolean {
    const normalized = key(name);
    if (this.reservations.get(normalized) !== owner) return false;
    this.reservations.delete(normalized);
    return true;
  }

  owner(name: string): string | undefined {
    return this.reservations.get(key(name));
  }

  snapshot(): string[] {
    return [...this.reservations.keys()];
  }

  has(name: string): boolean {
    return this.reservations.has(key(name));
  }
}
