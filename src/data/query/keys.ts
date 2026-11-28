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
  noteVersionsAll: (ws: string) => [...W(ws), 'note-versions'] as const,
  noteVersions: (ws: string, noteId: string) =>
    [...W(ws), 'note-versions', noteId] as const,
  history: (ws: string) => [...W(ws), 'history'] as const,
  targetRules: (ws: string) => [...W(ws), 'target-rules'] as const,
  feeRules: (ws: string) => [...W(ws), 'fee-rules'] as const,
  missedTradesAll: (ws: string) => [...W(ws), 'missed-trades'] as const,
  missedTrades: (ws: string, strategyId: string) =>
    [...W(ws), 'missed-trades', strategyId] as const,
  imports: (ws: string) => [...W(ws), 'imports'] as const,
  propTxns: (ws: string) => [...W(ws), 'prop-txns'] as const,
  importContext: (ws: string, accountId: string) =>
    [...W(ws), 'imports', 'context', accountId] as const,
};

export type WriteKind =
  | 'workspaces.setActive'
  | 'workspaces.resetSample'
  | 'workspaces.clearUser'
  | 'prefs.update'
  | 'onboarding.complete'
  | 'trades.update'
  | 'trades.updateMany'
  | 'trades.createManual'
  | 'trades.replaceManual'
  | 'trades.remove'
  | 'trades.merge'
  | 'trades.split'
  | 'trades.move'
  | 'trades.setFillCosts'
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
  | 'noteVersions.keep'
  | 'noteVersions.restore'
  | 'imports.commit'
  | 'imports.undo'
  | 'targetRules.save'
  | 'targetRules.remove'
  | 'feeRules.save'
  | 'feeRules.remove'
  | 'missedTrades.save'
  | 'missedTrades.remove'
  | 'rules.apply'
  // Plan 6C
  | 'propTxns.add'
  | 'propTxns.update'
  | 'propTxns.remove'
  | 'challenges.markBreached'
  | 'challenges.createMany'
  | 'accounts.setCostMethod';

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
    // The first run: prefs and My workspace, which becomes the active one.
    case 'onboarding.complete':
      return [keys.prefs(), keys.activeWorkspace(), keys.workspace('mine')];
    // Writes that change an account, its open trades or their journaling also
    // make the import context stale (keys.imports covers it): the plan is remade.
    case 'trades.update':
    case 'trades.updateMany':
    case 'trades.createManual':
    case 'trades.replaceManual':
      return [keys.trades(ws), keys.imports(ws), keys.history(ws)];
    // Deleting trades deletes their files (B56).
    case 'trades.remove':
      return [
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
        keys.history(ws),
        keys.filesAll(ws),
      ];
    // Regrouping moves a merged trade's files and unlinks its notes; a day's
    // figures read the trades (a finished day's frozen score does not move).
    case 'trades.merge':
    case 'trades.split':
    case 'trades.move':
      return [
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
        keys.history(ws),
        keys.days(ws),
        keys.filesAll(ws),
      ];
    // A fill's costs move the trade's fees and net, and the import state (a
    // pending plan carries the open trades); a day's figures read the trades,
    // while a finished day's frozen score does not move.
    case 'trades.setFillCosts':
      return [
        keys.trades(ws),
        keys.imports(ws),
        keys.history(ws),
        keys.days(ws),
      ];
    case 'journal.remove':
      return [
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
        keys.days(ws),
        keys.filesAll(ws),
      ];
    case 'imports.undo':
    case 'accounts.clearTrades':
      return [
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
        keys.history(ws),
        keys.filesAll(ws),
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
    // A new cost method (C40) rewrites the account's trades too.
    case 'accounts.update':
      return [
        keys.accounts(ws),
        keys.trades(ws),
        keys.imports(ws),
        keys.history(ws),
      ];
    case 'accounts.remove':
      return [
        keys.accounts(ws),
        keys.trades(ws),
        keys.journal(ws),
        keys.imports(ws),
        keys.cashFlows(ws),
        keys.challenges(ws),
        keys.history(ws),
        keys.filesAll(ws),
        keys.targetRules(ws),
        keys.feeRules(ws),
      ];
    case 'challenges.create':
    case 'challenges.markBreached':
      return [keys.challenges(ws)];
    // An update can make an account for a phase, and a quantity makes its accounts too.
    case 'challenges.update':
    case 'challenges.createMany':
      return [keys.challenges(ws), keys.accounts(ws)];
    // Its prop transactions are unlinked.
    case 'challenges.remove':
      return [keys.challenges(ws), keys.propTxns(ws)];
    case 'cashFlows.create':
    case 'cashFlows.update':
    case 'cashFlows.remove':
      return [keys.cashFlows(ws), keys.history(ws)];
    // A strategy can be made with its photo (B56's owner).
    case 'strategies.create':
      return [keys.strategies(ws), keys.history(ws), keys.filesAll(ws)];
    // A photo that is cleared or replaced is deleted with the write (B56).
    case 'strategies.update':
      return [
        keys.strategies(ws),
        keys.trades(ws),
        keys.imports(ws),
        keys.history(ws),
        keys.filesAll(ws),
      ];
    // Its photo and its missed trades go with it (B56), and a challenge traded with it no longer lists it.
    case 'strategies.remove':
      return [
        keys.strategies(ws),
        keys.trades(ws),
        keys.imports(ws),
        keys.history(ws),
        keys.filesAll(ws),
        keys.challenges(ws),
        keys.missedTradesAll(ws),
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
    case 'noteVersions.keep':
      return [keys.noteVersionsAll(ws)];
    // A restore writes the note's body: the journal and the day cards read it.
    case 'noteVersions.restore':
      return [keys.journal(ws), keys.days(ws), keys.noteVersionsAll(ws)];
    case 'imports.commit':
      return [keys.imports(ws), keys.trades(ws), keys.history(ws)];
    // A rule's own write changes its list and leaves a row; what it has
    // already written on trades stays (B57).
    case 'targetRules.save':
    case 'targetRules.remove':
      return [keys.targetRules(ws), keys.history(ws)];
    case 'feeRules.save':
    case 'feeRules.remove':
      return [keys.feeRules(ws), keys.history(ws)];
    // Missed trades are kept apart (B43): they log nothing and no figure reads them.
    case 'missedTrades.save':
    case 'missedTrades.remove':
      return [keys.missedTradesAll(ws)];
    // Applying a rule rewrites open trades the next import plan carries.
    case 'rules.apply':
      return [
        keys.targetRules(ws),
        keys.feeRules(ws),
        keys.trades(ws),
        keys.imports(ws),
        keys.history(ws),
      ];
    // Plan 6C
    case 'propTxns.add':
    case 'propTxns.update':
    case 'propTxns.remove':
      return [keys.propTxns(ws)];
    // The rebuild rewrites the account's trades, and the import context carries the method.
    case 'accounts.setCostMethod':
      return [
        keys.accounts(ws),
        keys.trades(ws),
        keys.imports(ws),
        keys.history(ws),
      ];
  }
}
