import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { SampleWorkspace } from '../seed/generate';
import { SAMPLE_WORKSPACE } from '../workspaces';

const WS = SAMPLE_WORKSPACE.id;

/**
 * Test-only: a tiny sample workspace for store and hook tests. Fresh objects on every call.
 * Active `acc-a` holds closed USD trades `f-1` (win, note `j-1`) and `f-2` (loss); archived `acc-b` holds `f-3`.
 * Tags `tag-setup` (Setups) and `tag-fomo` (the built-in Mistakes); `str-1` has an Entry and a Risk group.
 */
export function fixtureSample(): SampleWorkspace {
  return {
    seed: 1,
    endDate: '2026-11-19',
    accounts: [
      {
        id: 'acc-a',
        workspaceId: WS,
        name: 'Futures main',
        broker: 'Sample broker',
        type: 'live',
        currency: 'USD',
        startingBalance: 5_000_000,
        status: 'active',
      },
      {
        id: 'acc-b',
        workspaceId: WS,
        name: 'Old demo',
        broker: 'Sample broker',
        type: 'demo',
        currency: 'USD',
        startingBalance: 2_500_000,
        status: 'archived',
      },
    ],
    strategies: [
      {
        id: 'str-1',
        workspaceId: WS,
        name: 'Opening range breakout',
        description: 'Trade the break of the first 15-minute range.',
        assetClasses: ['future'],
        groups: [
          {
            id: 'g-entry',
            title: 'Entry',
            rules: [
              {
                id: 'r-1',
                text: 'Wait for the 15-minute range to close',
                showWhen: 'always',
              },
            ],
          },
          {
            id: 'g-risk',
            title: 'Risk',
            rules: [
              {
                id: 'r-2',
                text: 'Stop beyond the far side of the range',
                showWhen: 'always',
              },
            ],
          },
        ],
        checklist: ['Check the economic calendar'],
        status: 'active',
      },
    ],
    tagCategories: [
      {
        id: 'setups',
        workspaceId: WS,
        name: 'Setups',
        color: '#2B35AF',
        builtIn: false,
      },
      {
        id: 'mistakes',
        workspaceId: WS,
        name: 'Mistakes',
        color: '#D97706',
        role: 'mistake',
        builtIn: true,
      },
      {
        id: 'custom-tags',
        workspaceId: WS,
        name: 'Custom tags',
        color: '#16A34A',
        builtIn: true,
      },
    ],
    tags: [
      {
        id: 'tag-setup',
        workspaceId: WS,
        name: 'Breakout',
        categoryId: 'setups',
      },
      {
        id: 'tag-fomo',
        workspaceId: WS,
        name: 'FOMO',
        categoryId: 'mistakes',
        description: 'Entered because the move was running away.',
      },
    ],
    trades: [
      makeTrade({
        id: 'f-1',
        serial: 1,
        workspaceId: WS,
        accountId: 'acc-a',
        openedAt: '2026-11-16T14:45:00.000Z',
        closedAt: '2026-11-16T15:10:00.000Z',
        avgEntry: 6000,
        avgExit: 6005,
        net: 24_550,
        fees: 450,
        strategyIds: ['str-1'],
        ruleChecks: [
          { ruleId: 'r-1', followed: true },
          { ruleId: 'r-2', followed: true },
        ],
        tagIds: ['tag-fomo'],
        rating: 4,
        noteId: 'j-1',
      }),
      makeTrade({
        id: 'f-2',
        serial: 2,
        workspaceId: WS,
        accountId: 'acc-a',
        direction: 'short',
        openedAt: '2026-11-17T15:00:00.000Z',
        closedAt: '2026-11-17T15:30:00.000Z',
        avgEntry: 6010,
        avgExit: 6012.5,
        net: -12_950,
        fees: 450,
      }),
      makeTrade({
        id: 'f-3',
        serial: 3,
        workspaceId: WS,
        accountId: 'acc-b',
        instrument: resolveInstrument('NQZ5')!,
        openedAt: '2026-11-18T15:00:00.000Z',
        closedAt: '2026-11-18T15:20:00.000Z',
        avgEntry: 21000,
        avgExit: 21002.5,
        net: 5_000,
      }),
    ],
    journal: [
      {
        id: 'j-1',
        workspaceId: WS,
        kind: 'note',
        date: '2026-11-16',
        title: 'Clean breakout',
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Waited for the range, then took the break.',
                },
              ],
            },
          ],
        },
        linkedTradeIds: ['f-1'],
        tags: [],
        updatedAt: '2026-11-16T21:00:00.000Z',
      },
    ],
  };
}
