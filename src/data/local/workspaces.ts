import type { Workspace } from '@/domain/types';
import { NotFoundError, type WorkspacesRepo } from '../repository';
import { SAMPLE_WORKSPACE, USER_WORKSPACE, WORKSPACES } from '../workspaces';
import { writeSample, type LocalContext, type SampleSource } from './context';
import { DATA_TABLES, META, type KeelDb } from './db';

const copy = (w: Workspace): Workspace => ({ ...w });

export function localWorkspaces(
  ctx: LocalContext,
  sample: SampleSource,
): WorkspacesRepo {
  return {
    async list() {
      return WORKSPACES.map(copy);
    },

    async getActive() {
      const db = await ctx.db();
      const id = (await db.meta.get(META.activeWorkspace))?.value;
      return copy(WORKSPACES.find((w) => w.id === id) ?? SAMPLE_WORKSPACE);
    },

    async setActive(id) {
      if (!WORKSPACES.some((w) => w.id === id))
        throw new NotFoundError('workspace', id);
      const db = await ctx.db();
      await db.meta.put({ key: META.activeWorkspace, value: id });
    },

    async resetSample() {
      const db = await ctx.db();
      const at = ctx.now();
      // Generate outside the transaction: awaiting anything but Dexie inside one commits it early.
      const fresh = await sample(at);
      await db.transaction('rw', [...DATA_TABLES, 'meta'], async () => {
        await deleteWorkspaceRows(db, SAMPLE_WORKSPACE.id);
        await writeSample(db, fresh, at);
      });
    },

    async clearUser() {
      const db = await ctx.db();
      await db.transaction('rw', [...DATA_TABLES, 'meta'], async () => {
        await deleteWorkspaceRows(db, USER_WORKSPACE.id);
        await db.meta.delete(META.overrides(USER_WORKSPACE.id));
      });
    },
  };
}

/** Call inside an rw transaction over the data tables. */
async function deleteWorkspaceRows(db: KeelDb, ws: string): Promise<void> {
  for (const name of DATA_TABLES)
    await db.table(name).where('workspaceId').equals(ws).delete();
}
