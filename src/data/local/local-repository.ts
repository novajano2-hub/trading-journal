import type { Repository } from '../repository';
import type { SampleWorkspace } from '../seed/generate';
import { createLocalContext, defaultSample } from './context';
import { localAccounts } from './accounts';
import { localFolders } from './folders';
import { localImports } from './imports';
import { localJournal } from './journal';
import { localPrefs } from './prefs';
import { localStrategies } from './strategies';
import { localTagCategories } from './tag-categories';
import { localTags } from './tags';
import { localTemplates } from './templates';
import { localTrades } from './trades';
import { localWorkspaces } from './workspaces';

export interface LocalRepositoryOptions {
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  now?: () => Date;
  newId?: () => string;
  /** Default: the real generator with `SAMPLE_SEED`, ending the last weekday before `now`. */
  sample?: (now: Date) => Promise<SampleWorkspace>;
  /** Default 5000. */
  openTimeoutMs?: number;
}

/** The IndexedDB repository. Side-effect free: nothing touches storage until the first method call. */
export function createLocalRepository(
  opts: LocalRepositoryOptions = {},
): Repository {
  const sample = opts.sample ?? defaultSample;
  const ctx = createLocalContext({ ...opts, sample });
  return {
    workspaces: localWorkspaces(ctx, sample),
    prefs: localPrefs(ctx),
    trades: localTrades(ctx),
    accounts: localAccounts(ctx),
    strategies: localStrategies(ctx),
    tags: localTags(ctx),
    tagCategories: localTagCategories(ctx),
    templates: localTemplates(ctx),
    folders: localFolders(ctx),
    journal: localJournal(ctx),
    imports: localImports(ctx),
  };
}
