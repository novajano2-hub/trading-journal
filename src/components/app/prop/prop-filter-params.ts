import type { ChallengeType, PropFilters } from '@/domain/prop/finance';

/**
 * The prop dashboard's six filters (C37) as the address holds them. They carry
 * a `p` the trade filters' names lack, because three of the plain names are
 * the trade filters' own (`status`, `size` and `strategy`): the date chip and
 * the shell's cleaner rewrite those and would strip a prop filter written
 * under them.
 */
export const PROP_PARAMS = {
  firm: 'pfirm',
  phase: 'pphase',
  status: 'pstatus',
  size: 'psize',
  type: 'ptype',
  strategy: 'pstrategy',
} as const;

export interface PropSelection {
  firm: string[];
  phase?: 'evaluation' | 'funded';
  /** 'active' is every challenge not breached, Keel's passed one too. */
  status?: 'active' | 'breached';
  /** Account sizes, in cents. */
  size: number[];
  type: ChallengeType[];
  strategy: string[];
}

export const NO_SELECTION: PropSelection = {
  firm: [],
  size: [],
  type: [],
  strategy: [],
};

type Read = Pick<URLSearchParams, 'get' | 'getAll'>;

const TYPES: readonly ChallengeType[] = ['1-step', '2-step', 's2f'];

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

/** The selection an address holds; a value that is not one of the choices is ignored. */
export function parseSelection(params: Read): PropSelection {
  const phase = params.get(PROP_PARAMS.phase);
  const status = params.get(PROP_PARAMS.status);
  const types = new Set(params.getAll(PROP_PARAMS.type));
  return {
    firm: unique(params.getAll(PROP_PARAMS.firm).filter((v) => v !== '')),
    ...(phase === 'evaluation' || phase === 'funded' ? { phase } : {}),
    ...(status === 'active' || status === 'breached' ? { status } : {}),
    size: unique(
      params
        .getAll(PROP_PARAMS.size)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
    type: TYPES.filter((t) => types.has(t)),
    strategy: unique(
      params.getAll(PROP_PARAMS.strategy).filter((v) => v !== ''),
    ),
  };
}

/** Writes the selection into `params`: the six parameters are replaced, every other one stays where it was. */
export function setSelection(
  params: URLSearchParams,
  selection: PropSelection,
): void {
  for (const name of Object.values(PROP_PARAMS)) params.delete(name);
  for (const v of selection.firm) params.append(PROP_PARAMS.firm, v);
  if (selection.phase) params.set(PROP_PARAMS.phase, selection.phase);
  if (selection.status) params.set(PROP_PARAMS.status, selection.status);
  for (const v of selection.size) params.append(PROP_PARAMS.size, String(v));
  for (const v of selection.type) params.append(PROP_PARAMS.type, v);
  for (const v of selection.strategy) params.append(PROP_PARAMS.strategy, v);
}

/** How many of the six filters are set: each counts once, however many values it holds. */
export function selectionCount(s: PropSelection): number {
  return [
    s.firm.length > 0,
    s.phase !== undefined,
    s.status !== undefined,
    s.size.length > 0,
    s.type.length > 0,
    s.strategy.length > 0,
  ].filter(Boolean).length;
}

/** The selection and the resolved date range as the finance functions take them. */
export function propFilters(
  s: PropSelection,
  range: { from?: string; to?: string },
): PropFilters {
  return {
    ...(s.firm.length > 0 ? { firm: s.firm } : {}),
    ...(s.phase ? { phase: s.phase } : {}),
    ...(s.status ? { status: s.status } : {}),
    ...(s.size.length > 0 ? { size: s.size } : {}),
    ...(s.type.length > 0 ? { type: s.type } : {}),
    ...(s.strategy.length > 0 ? { strategy: s.strategy } : {}),
    ...(range.from !== undefined || range.to !== undefined ? { range } : {}),
  };
}
