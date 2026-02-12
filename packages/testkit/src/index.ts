export function createUuidPrefix(prefix: string, randomValue: string): string {
  return `${prefix}_${randomValue}`;
}
