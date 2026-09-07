/**
 * Marcode-owned migration namespace.
 *
 * IDs below 9000 are the deployed shared/upstream history and are immutable.
 * New Marcode migrations belong here so an upstream sync never has to
 * renumber an applied migration in Migrations.ts.
 */
export const MARCODE_MIGRATION_ID_START = 9000 as const;

export function defineMarcodeMigration<T>(
  id: number,
  name: string,
  migration: T,
): readonly [number, string, T] {
  if (!Number.isInteger(id) || id < MARCODE_MIGRATION_ID_START) {
    throw new Error(`Marcode migration ids must be >= ${MARCODE_MIGRATION_ID_START}; got ${id}.`);
  }
  return [id, name, migration];
}

export function validateMarcodeMigrationEntries(
  entries: ReadonlyArray<readonly [number, string, unknown]>,
): void {
  const ids = new Set<number>();
  for (const [id, name] of entries) {
    if (!Number.isInteger(id) || id < MARCODE_MIGRATION_ID_START) {
      throw new Error(`Marcode migration ${name} uses reserved id ${id}.`);
    }
    if (ids.has(id)) throw new Error(`Duplicate Marcode migration id ${id}.`);
    ids.add(id);
  }
}

// Keep this registry empty until Marcode needs another schema change. When one
// is added, give it an ID >= MARCODE_MIGRATION_ID_START and append it here.
// Use defineMarcodeMigration when adding an entry; its inferred tuple type
// preserves the migration effect's type for Migrations.ts.
export const marcodeMigrationEntries = [] as const;
