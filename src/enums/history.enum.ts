/**
 * Type of change recorded: new row (CREATE), changed row (UPDATE), or removed/soft-deleted row (DELETE).
 */
export enum HistoryActionType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}
