import { HistoryContextData } from '../src/interfaces/history.interface';

/** Default history context for E2E tests when not using HTTP (CLS-only). */
export const E2E_HISTORY_CONTEXT: HistoryContextData = {
  contextEntityKey: 'e2e-test',
  contextEntityId: null,
  user_id: 'e2e-user',
};
