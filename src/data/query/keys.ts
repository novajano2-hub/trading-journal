import type { QueryKey } from '@tanstack/react-query';

const W = (ws: string) => ['keel', 'ws', ws] as const;

/** Every key is a prefix of the keys of its details, and workspace keys never overlap. */
export const keys = {
  workspaces: () => ['keel', 'workspaces'] as const,
  activeWorkspace: () => ['keel', 'active-workspace'] as const,
  prefs: () => ['keel', 'prefs'] as const,
  workspace: (ws: string) => W(ws),
  trades: (ws: string) => [...W(ws), 'trades'] as const,
  trade: (ws: string, id: string) => [...W(ws), 'trades', id] as const,
  accounts: (ws: string) => [...W(ws), 'accounts'] as const,
  strategies: (ws: string) => [...W(ws), 'strategies'] as const,
  strategy: (ws: string, id: string) => [...W(ws), 'strategies', id] as const,
  tags: (ws: string) => [...W(ws), 'tags'] as const,
  journal: (ws: string) => [...W(ws), 'journal'] as const,
  journalEntry: (ws: string, id: string) =>
    [...W(ws), 'journal', 'entry', id] as const,
  journalForTrade: (ws: string, tradeId: string) =>
    [...W(ws), 'journal', 'trade', tradeId] as const,
  imports: (ws: string) => [...W(ws), 'imports'] as const,
  importContext: (ws: string, accountId: string) =>
    [...W(ws), 'imports', 'context', accountId] as const,
};

export type WriteKind =
  | 'workspaces.setActive'
  | 'workspaces.resetSample'
  | 'workspaces.clearUser'
  | 'prefs.update'
  | 'trades.update'
  | 'trades.remove'
  | 'accounts.create'
  | 'accounts.update'
  | 'accounts.remove'
  | 'strategies.create'
  | 'strategies.update'
  | 'strategies.remove'
  | 'tags.create'
  | 'tags.update'
  | 'tags.remove'
  | 'journal.save'
  | 'journal.remove'
  | 'imports.commit'
  | 'imports.undo';

/** The query keys a successful write makes stale, in workspace `ws`. */
export function invalidationsFor(write: WriteKind, ws: string): QueryKey[] {
  switch (write) {
    case 'workspaces.setActive':
      return [keys.activeWorkspace()];
    case 'workspaces.resetSample':
      return [keys.workspace('sample')];
    case 'workspaces.clearUser':
      return [keys.workspace('mine')];
    case 'prefs.update':
      return [keys.prefs()];
    case 'trades.update':
      return [keys.trades(ws)];
    case 'trades.remove':
    case 'journal.remove':
      return [keys.trades(ws), keys.journal(ws)];
    case 'imports.undo':
      return [keys.trades(ws), keys.journal(ws), keys.imports(ws)];
    case 'accounts.create':
    case 'accounts.update':
      return [keys.accounts(ws)];
    case 'accounts.remove':
      return [
        keys.accounts(ws),
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
      ];
    case 'strategies.create':
      return [keys.strategies(ws)];
    case 'strategies.update':
    case 'strategies.remove':
      return [keys.strategies(ws), keys.trades(ws)];
    case 'tags.create':
    case 'tags.update':
      return [keys.tags(ws)];
    case 'tags.remove':
      return [keys.tags(ws), keys.trades(ws)];
    case 'journal.save':
      return [keys.journal(ws)];
    case 'imports.commit':
      return [keys.imports(ws), keys.trades(ws)];
  }
}
