import type { Repository } from '../repository';
import type { SampleWorkspace } from '../seed/generate';
import { createLocalContext, defaultSample } from './context';
import { localAccounts } from './accounts';
import { localCashFlows } from './cashflows';
import { localChallenges } from './challenges';
import { localDays } from './days';
import { localDayShots } from './day-shots';
import { localFeeRules } from './fee-rules';
import { localFiles } from './files';
import { localFolders } from './folders';
import { localHistory } from './history';
import { localImports } from './imports';
import { localJournal } from './journal';
import { localNoteVersions } from './note-versions';
import { localOnboarding } from './onboarding';
import { localPrefs } from './prefs';
import { localPropTxns } from './prop-txns';
import { localStrategies } from './strategies';
import { localTagCategories } from './tag-categories';
import { localTargetRules } from './target-rules';
import { localTags } from './tags';
import { localTemplates } from './templates';
import { localTracker } from './tracker';
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
  const journal = localJournal(ctx);
  return {
    workspaces: localWorkspaces(ctx, sample),
    prefs: localPrefs(ctx),
    trades: localTrades(ctx),
    accounts: localAccounts(ctx),
    cashFlows: localCashFlows(ctx),
    challenges: localChallenges(ctx),
    strategies: localStrategies(ctx),
    tags: localTags(ctx),
    tagCategories: localTagCategories(ctx),
    templates: localTemplates(ctx),
    folders: localFolders(ctx),
    journal,
    noteVersions: localNoteVersions(ctx, journal),
    imports: localImports(ctx),
    tracker: localTracker(ctx),
    days: localDays(ctx),
    dayShots: localDayShots(ctx),
    files: localFiles(ctx),
    history: localHistory(ctx),
    targetRules: localTargetRules(ctx),
    feeRules: localFeeRules(ctx),
    onboarding: localOnboarding(ctx),
    propTxns: localPropTxns(ctx),
  };
}
