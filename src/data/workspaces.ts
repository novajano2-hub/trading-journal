import type { Workspace } from '@/domain/types';

export const SAMPLE_WORKSPACE: Workspace = {
  id: 'sample',
  name: 'Sample workspace',
  kind: 'sample',
};
export const USER_WORKSPACE: Workspace = {
  id: 'mine',
  name: 'My workspace',
  kind: 'user',
};
export const WORKSPACES: readonly Workspace[] = [
  SAMPLE_WORKSPACE,
  USER_WORKSPACE,
];
