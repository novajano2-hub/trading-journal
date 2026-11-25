import type { QueryKey } from '@tanstack/react-query';

const W = (ws: string) => ['keel', 'ws', ws] as const;

/** Every key is a prefix of the keys of its details, and workspace keys never overlap. */
export const keys = {
  workspaces: () => ['keel', 'workspaces'] as const,
  activeWorkspace: () => ['keel', 'active-workspace'] as const,
  prefs: () => ['keel', 'prefs'] as const,
  prefsSaved: () => ['keel', 'prefs', 'saved'] as const,
  workspace: (ws: string) => W(ws),
  trades: (ws: string) => [...W(ws), 'trades'] as const,
  trade: (ws: string, id: string) => [...W(ws), 'trades', id] as const,
  accounts: (ws: string) => [...W(ws), 'accounts'] as const,
  cashFlows: (ws: string) => [...W(ws), 'cash-flows'] as const,
  challenges: (ws: string) => [...W(ws), 'challenges'] as const,
  strategies: (ws: string) => [...W(ws), 'strategies'] as const,
  strategy: (ws: string, id: string) => [...W(ws), 'strategies', id] as const,
  tags: (ws: string) => [...W(ws), 'tags'] as const,
  tagCategories: (ws: string) => [...W(ws), 'tag-categories'] as const,
  templates: (ws: string) => [...W(ws), 'templates'] as const,
  folders: (ws: string) => [...W(ws), 'folders'] as const,
  journal: (ws: string) => [...W(ws), 'journal'] as const,
  journalEntry: (ws: string, id: string) =>
    [...W(ws), 'journal', 'entry', id] as const,
  journalForTrade: (ws: string, tradeId: string) =>
    [...W(ws), 'journal', 'trade', tradeId] as const,
  tracker: (ws: string) => [...W(ws), 'tracker'] as const,
  days: (ws: string) => [...W(ws), 'days'] as const,
  dayShotsAll: (ws: string) => [...W(ws), 'day-shots'] as const,
  dayShots: (ws: string, date: string) =>
    [...W(ws), 'day-shots', date] as const,
  filesAll: (ws: string) => [...W(ws), 'files'] as const,
  files: (ws: string, owner: string) =>
    [...W(ws), 'files', 'owner', owner] as const,
  file: (ws: string, id: string) => [...W(ws), 'files', 'id', id] as const,
  history: (ws: string) => [...W(ws), 'history'] as const,
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
  | 'trades.updateMany'
  | 'trades.createManual'
  | 'trades.replaceManual'
  | 'trades.remove'
  | 'accounts.create'
  | 'accounts.update'
  | 'accounts.remove'
  | 'accounts.clearTrades'
  | 'cashFlows.create'
  | 'cashFlows.update'
  | 'cashFlows.remove'
  | 'challenges.create'
  | 'challenges.update'
  | 'challenges.remove'
  | 'strategies.create'
  | 'strategies.update'
  | 'strategies.remove'
  | 'tags.create'
  | 'tags.update'
  | 'tags.remove'
  | 'tagCategories.create'
  | 'tagCategories.update'
  | 'tagCategories.remove'
  | 'templates.save'
  | 'templates.remove'
  | 'templates.setDefault'
  | 'folders.create'
  | 'folders.rename'
  | 'folders.remove'
  | 'journal.save'
  | 'journal.remove'
  | 'journal.trash'
  | 'journal.restore'
  | 'journal.ensureTradeNote'
  | 'journal.dailyNote'
  | 'tracker.save'
  | 'tracker.reset'
  | 'days.write'
  | 'days.finish'
  | 'dayShots.add'
  | 'dayShots.remove'
  | 'files.add'
  | 'files.remove'
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
    // Writes that change an account, its open trades or their journaling also
    // make the import context stale (keys.imports covers it): the plan is remade.
    case 'trades.update':
    case 'trades.updateMany':
    case 'trades.createManual':
    case 'trades.replaceManual':
      return [keys.trades(ws), keys.imports(ws), keys.history(ws)];
    case 'trades.remove':
      return [
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
        keys.history(ws),
      ];
    case 'journal.remove':
      return [
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
        keys.days(ws),
      ];
    case 'imports.undo':
    case 'accounts.clearTrades':
      return [
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
        keys.history(ws),
      ];
    case 'journal.ensureTradeNote':
      return [
        keys.journal(ws),
        keys.trades(ws),
        keys.imports(ws),
        keys.days(ws),
      ];
    case 'accounts.create':
      return [keys.accounts(ws), keys.history(ws)];
    case 'accounts.update':
      return [keys.accounts(ws), keys.imports(ws), keys.history(ws)];
    case 'accounts.remove':
      return [
        keys.accounts(ws),
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
        keys.cashFlows(ws),
        keys.challenges(ws),
        keys.history(ws),
      ];
    case 'challenges.create':
    case 'challenges.update':
    case 'challenges.remove':
      return [keys.challenges(ws)];
    case 'cashFlows.create':
    case 'cashFlows.update':
    case 'cashFlows.remove':
      return [keys.cashFlows(ws), keys.history(ws)];
    case 'strategies.create':
      return [keys.strategies(ws), keys.history(ws)];
    case 'strategies.update':
    case 'strategies.remove':
      return [
        keys.strategies(ws),
        keys.trades(ws),
        keys.imports(ws),
        keys.history(ws),
      ];
    case 'tags.create':
    case 'tags.update':
      return [keys.tags(ws), keys.history(ws)];
    case 'tags.remove':
      return [
        keys.tags(ws),
        keys.trades(ws),
        keys.imports(ws),
        keys.history(ws),
      ];
    case 'tagCategories.create':
      return [keys.tagCategories(ws), keys.history(ws)];
    // Tags sort by their category's name.
    case 'tagCategories.update':
      return [keys.tagCategories(ws), keys.tags(ws), keys.history(ws)];
    case 'tagCategories.remove':
      return [
        keys.tagCategories(ws),
        keys.tags(ws),
        keys.trades(ws),
        keys.imports(ws),
        keys.history(ws),
      ];
    case 'templates.save':
    case 'templates.remove':
    case 'templates.setDefault':
      return [keys.templates(ws)];
    case 'folders.create':
    case 'folders.rename':
      return [keys.folders(ws)];
    // Its notes move to no folder.
    case 'folders.remove':
      return [keys.folders(ws), keys.journal(ws)];
    case 'journal.save':
    case 'journal.trash':
    case 'journal.restore':
    case 'journal.dailyNote':
      return [keys.journal(ws), keys.days(ws)];
    case 'tracker.save':
    case 'tracker.reset':
      return [keys.tracker(ws), keys.days(ws)];
    case 'days.write':
    case 'days.finish':
      return [keys.days(ws)];
    case 'dayShots.add':
    case 'dayShots.remove':
      return [keys.dayShotsAll(ws)];
    case 'files.add':
    case 'files.remove':
      return [keys.filesAll(ws)];
    case 'imports.commit':
      return [keys.imports(ws), keys.trades(ws), keys.history(ws)];
  }
}
