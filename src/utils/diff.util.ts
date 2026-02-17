import diff from 'microdiff';
import { HistoryContent } from '../interfaces/history.interface';

/**
 * Escapes dots in path segments to avoid collision with the separator.
 * e.g. ['ver.1', 'active'] -> 'ver\.1.active'
 */
function escapePath(segments: (string | number)[]): string {
  return segments
    .map(segment => String(segment).split('.').join('\\.'))
    .join('.');
}

export function generateDiff(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
): HistoryContent {
  const changes = diff(oldData || {}, newData || {});
  const output: HistoryContent = {};

  for (const change of changes) {
    const fullPath = escapePath(change.path);

    if (change.type === 'CHANGE') {
      output[fullPath] = {
        old: change.oldValue,
        new: change.value,
      };
    } else if (change.type === 'CREATE') {
      output[fullPath] = {
        old: null,
        new: change.value,
      };
    } else if (change.type === 'REMOVE') {
      output[fullPath] = {
        old: change.oldValue,
        new: null,
      };
    }
  }
  return output;
}

