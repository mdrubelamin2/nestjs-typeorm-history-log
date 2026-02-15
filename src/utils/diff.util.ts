import diff from 'microdiff';
import { HistoryContent } from '../interfaces/history.interface';

export function generateDiff(
  oldData: Record<string, any>,
  newData: Record<string, any>
): HistoryContent {
  const changes = diff(oldData || {}, newData || {});
  const output: HistoryContent = {};

  for (const change of changes) {
    const fullPath = change.path.join('.');

    if (change.type === 'CHANGE') {
      output[fullPath] = {
        old: change.oldValue,
        new: change.value,
      };
    }
    // Note: You could also handle 'CREATE' and 'DELETE' types within objects here if needed.
  }
  return output;
}
