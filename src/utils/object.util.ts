import { ObjectLiteral } from 'typeorm';

/**
 * Parses a dot-notated string into segments, respecting backslash-escaped dots.
 * NO REGEX logic.
 */
export function parsePath(path: string): string[] {
  // Split by dot that is NOT preceded by a backslash
  // Then replace the escape sequence '\.' with a literal dot '.'
  return path.split(/(?<!\\)\./).map(part => part.replace(/\\\./g, '.'));
}

/**
 * Sets a value at a path in an object, creating nested objects as needed.
 */
export function set(object: Record<string, unknown>, path: string[], value: unknown): void {
  let current: Record<string, unknown> = object;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (key === undefined) continue;
    if (i === path.length - 1) {
      current[key] = value;
    } else {
      const next = current[key];
      if (typeof next !== 'object' || next === null) {
        current[key] = {};
      }
      const nextObj = current[key];
      if (typeof nextObj === 'object' && nextObj !== null && !Array.isArray(nextObj)) {
        current = nextObj as Record<string, unknown>;
      } else {
        const newObj: Record<string, unknown> = {};
        current[key] = newObj;
        current = newObj;
      }
    }
  }
}

/**
 * Unflattens an object with dot-notated keys into a nested object.
 * Example: { 'user.name': 'Alice', 'user.age': 30 } => { user: { name: 'Alice', age: 30 } }
 */
export function unflatten(data: ObjectLiteral): ObjectLiteral {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(data)) {
    const segments = parsePath(key);
    set(result, segments, data[key] as unknown);
  }

  return result as ObjectLiteral;
}
