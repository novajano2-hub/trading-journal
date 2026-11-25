import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { KeelDb } from '../local/db';
import { createLocalRepository } from '../local/local-repository';
import { builtInTemplates } from './templates';

const IDS = [
  'template-daily-plan',
  'template-daily-full',
  'template-daily-checkin',
];

test('three Keel daily templates are built in and none is the default', async () => {
  const built = builtInTemplates('mine');
  for (const id of IDS) {
    const t = built.find((x) => x.id === id);
    expect(t, id).toMatchObject({
      kind: 'daily-review',
      builtIn: true,
      isDefault: false,
    });
    expect(JSON.stringify(t?.body)).toContain('"type":"doc"');
  }
  // Daily review stays the one default daily template.
  expect(
    built
      .filter((t) => t.kind === 'daily-review' && t.isDefault)
      .map((t) => t.id),
  ).toEqual(['template-daily-review']);

  // Opening an existing workspace adds the ones it lacks and keeps an edited one.
  const indexedDB = new IDBFactory();
  const open = () =>
    createLocalRepository({
      indexedDB,
      IDBKeyRange,
      sample: async () => fixtureSample(),
    });
  await open().templates.list('mine');
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  await db.templates.delete(['mine', 'template-daily-plan']);
  await db.templates.update(['mine', 'template-daily-full'], {
    name: 'My full day',
  });
  db.close();
  const after = await open().templates.list('mine');
  expect(after.find((t) => t.id === 'template-daily-plan')?.name).toBe(
    'Daily game plan',
  );
  expect(after.find((t) => t.id === 'template-daily-full')?.name).toBe(
    'My full day',
  );
});
