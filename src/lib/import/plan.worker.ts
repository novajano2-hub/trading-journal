import { answer, type PlanReply, type PlanRequest } from './plan-protocol';

/**
 * The import's planner, off the page's thread: a request in, the plan (in
 * slices where its lists are long) or the reason it failed back. Everything it
 * runs is the pure `planImport`.
 */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PlanRequest>) => void) | null;
  postMessage(reply: PlanReply): void;
};

scope.onmessage = (e) => {
  for (const reply of answer(e.data)) scope.postMessage(reply);
};
