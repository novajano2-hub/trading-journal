import { isValidTimeZone } from '@/domain/time';
import type { UserPrefs } from '@/domain/types';
import { isCurrencyCode, USERNAME } from '../onboarding';
import type { OnboardingRepo } from '../repository';
import { USER_WORKSPACE } from '../workspaces';
import type { LocalContext } from './context';
import { asPartial, validate } from './prefs';
import { META } from './schema';
import { rwTx } from './tx';

export const FIRST_ACCOUNT_NAME = 'My account';

export function localOnboarding(ctx: LocalContext): OnboardingRepo {
  return {
    async complete(input) {
      // Check everything before the first write: a bad answer writes nothing.
      if (!USERNAME.test(input.username))
        throw new RangeError(
          'A username is 3 to 30 letters, digits, dots or underscores',
        );
      if (!isValidTimeZone(input.timeZone))
        throw new RangeError(`Unknown time zone "${input.timeZone}"`);
      if (!isCurrencyCode(input.baseCurrency))
        throw new RangeError(`Unknown currency "${input.baseCurrency}"`);
      const changes: Partial<UserPrefs> = {
        firstName: input.firstName,
        lastName: input.lastName,
        username: input.username,
        baseCurrency: input.baseCurrency.toUpperCase(),
        timeZone: input.timeZone,
        onboarding: {
          status: 'done',
          at: ctx.now().toISOString(),
          ...(input.survey ? { survey: input.survey } : {}),
        },
      };
      validate(changes);
      const db = await ctx.db();
      const ws = USER_WORKSPACE.id;
      await rwTx(db, [db.accounts, db.meta], async () => {
        const current = asPartial((await db.meta.get(META.prefs))?.value);
        await db.meta.put({
          key: META.prefs,
          value: { ...current, ...changes },
        });
        // A retry, or a user who already has an account, gets no second one.
        if ((await db.accounts.where('workspaceId').equals(ws).count()) === 0)
          // Settings > Accounts' new-account defaults: a live account, no broker, no balance.
          await db.accounts.put({
            id: ctx.newId(),
            workspaceId: ws,
            name: FIRST_ACCOUNT_NAME,
            broker: '',
            type: 'live',
            currency: changes.baseCurrency!,
            startingBalance: 0,
            status: 'active',
          });
        await db.meta.put({ key: META.activeWorkspace, value: ws });
      });
    },
  };
}
