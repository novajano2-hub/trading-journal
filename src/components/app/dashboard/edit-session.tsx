'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useChangeDashboards, usePrefs } from '@/data/query/hooks';
import {
  sameTemplate,
  TemplateChangedError,
  templatesOf,
  withoutTemplate,
  withSavedTemplate,
} from '@/domain/dashboard/templates';
import type { DashTemplate } from '@/domain/types';
import { ConfirmDialog, ConfirmFailure } from '../confirm-dialog';

/** The only route that has an edit mode. */
const DASHBOARD = '/app/dashboard';

/** A template's name is 1 to 40 characters (the prefs refuse anything else). */
export const NAME_LIMIT = 40;

/** What an edit of one template holds. */
export interface EditSession {
  /** The template as it was stored when the edit began. */
  base: DashTemplate;
  /** The template as the user has it now; nothing of it is stored until Save. */
  draft: DashTemplate;
  /** Whether the draft differs from what was stored. */
  dirty: boolean;
  /** Save found the stored template changed elsewhere (C70); the next Save replaces it. */
  conflict: boolean;
  /** Save found the name blank. */
  nameError: boolean;
  /** The last Save did not land. */
  saveError: boolean;
  saving: boolean;
  /** The last template cannot be deleted (C2). */
  canDelete: boolean;
}

export interface DashboardEdit {
  session: EditSession | undefined;
  /** The template button, where focus goes back when the edit ends. */
  anchor: RefObject<HTMLButtonElement | null>;
  /** Starts editing `template`, as stored. */
  begin(template: DashTemplate): void;
  rename(name: string): void;
  /** Changes the draft. A change that cannot be made (a sixth upper widget) is dropped. */
  change(fn: (draft: DashTemplate) => DashTemplate): void;
  save(): Promise<void>;
  /** Drops the draft. */
  cancel(): void;
  /** Asks, then deletes the template being edited. */
  askDelete(): void;
}

const EditContext = createContext<DashboardEdit | undefined>(undefined);

/**
 * The edit session of the Dashboard, or undefined outside a provider (a page
 * with no edit mode).
 */
export function useDashboardEdit(): DashboardEdit | undefined {
  return useContext(EditContext);
}

interface State {
  base: DashTemplate;
  draft: DashTemplate;
  conflict: boolean;
  nameError: boolean;
  saveError: boolean;
}

/** A link that stays in the app and goes to another page, or undefined. */
function leavingLink(e: MouseEvent): string | undefined {
  if (e.defaultPrevented || e.button !== 0) return undefined;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return undefined;
  const target = e.target instanceof Element ? e.target : null;
  const a = target?.closest<HTMLAnchorElement>('a[href]');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download'))
    return undefined;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return undefined;
  // The same page (a hash, or filters on it) leaves nothing behind.
  if (url.pathname === window.location.pathname) return undefined;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Holds the one edit of a dashboard template that can be open: the draft, and
 * what Save, Cancel and Delete do to it (C2, C8, C70). It sits above the top
 * bar and the page, which both draw from it. The draft is dropped when the
 * page is left, and a link that would leave with changes asks first.
 */
export function DashboardEditProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const prefs = usePrefs().data;
  const change = useChangeDashboards();
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<State>();
  const [leaving, setLeaving] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  // Always the latest, for what runs after an await.
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  });
  const refocus = useRef(false);

  const end = useCallback(() => {
    refocus.current = true;
    setState(undefined);
    setLeaving(undefined);
    setDeleting(false);
  }, []);

  // The edit ends; focus goes back to the template button, which the top bar draws again.
  useEffect(() => {
    if (state === undefined && refocus.current) {
      refocus.current = false;
      anchor.current?.focus();
    }
  }, [state]);

  // A route change, however it happened, drops the draft.
  useEffect(() => {
    if (pathname !== DASHBOARD) setState(undefined);
  }, [pathname]);

  const dirty =
    state !== undefined &&
    !sameTemplate(state.base, {
      ...state.draft,
      name: state.draft.name.trim(),
    });

  // A link that leaves the page with changes in the draft asks first (C8).
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      const href = leavingLink(e);
      if (href === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  const begin = useCallback((template: DashTemplate) => {
    setState({
      base: template,
      draft: template,
      conflict: false,
      nameError: false,
      saveError: false,
    });
    window.scrollTo?.({ top: 0 });
  }, []);

  const rename = useCallback((name: string) => {
    setState(
      (s) => s && { ...s, draft: { ...s.draft, name }, nameError: false },
    );
  }, []);

  const edit = useCallback((fn: (draft: DashTemplate) => DashTemplate) => {
    setState((s) => {
      if (!s) return s;
      try {
        return { ...s, draft: fn(s.draft), saveError: false };
      } catch {
        return s;
      }
    });
  }, []);

  const save = useCallback(async () => {
    const s = latest.current;
    if (!s || change.isPending) return;
    const name = s.draft.name.trim();
    if (name.length < 1 || name.length > NAME_LIMIT) {
      setState({ ...s, nameError: true });
      return;
    }
    const draft = { ...s.draft, name };
    if (sameTemplate(s.base, draft)) {
      end();
      return;
    }
    try {
      await change.mutateAsync((current) =>
        withSavedTemplate(current, draft, s.base, { overwrite: s.conflict }),
      );
      end();
    } catch (e) {
      setState((now) =>
        now
          ? e instanceof TemplateChangedError
            ? { ...now, conflict: true, saveError: false }
            : { ...now, saveError: true }
          : now,
      );
    }
  }, [change, end]);

  const value = useMemo<DashboardEdit>(() => {
    const all = prefs ? templatesOf(prefs).all : undefined;
    return {
      session: state && {
        base: state.base,
        draft: state.draft,
        dirty,
        conflict: state.conflict,
        nameError: state.nameError,
        saveError: state.saveError,
        saving: change.isPending,
        canDelete:
          all !== undefined &&
          all.length > 1 &&
          all.some((t) => t.id === state.base.id),
      },
      anchor,
      begin,
      rename,
      change: edit,
      save,
      cancel: end,
      askDelete: () => setDeleting(true),
    };
  }, [prefs, state, dirty, change.isPending, begin, rename, edit, save, end]);

  const name = state?.base.name;
  const next =
    prefs && state
      ? (() => {
          const { inUse, all } = templatesOf(prefs);
          return inUse.id === state.base.id
            ? all.find((t) => t.id !== state.base.id)
            : undefined;
        })()
      : undefined;

  return (
    <EditContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={leaving !== undefined}
        title="Leave without saving?"
        body={
          <>
            Your changes to <strong className="text-text">{name}</strong>{' '}
            haven&apos;t been saved. Leaving drops them.
          </>
        }
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        danger
        onConfirm={async () => {
          const href = leaving;
          end();
          if (href !== undefined) router.push(href);
        }}
        onClose={() => setLeaving(undefined)}
      />
      <ConfirmDialog
        open={deleting}
        title="Delete this template?"
        body={
          <>
            <strong className="text-text">{name}</strong> will be removed from
            this browser. Your trades and your other templates are not affected.
            {next ? ` The Dashboard will show ${next.name} instead.` : ''}
          </>
        }
        confirmLabel="Delete template"
        danger
        onConfirm={async () => {
          const s = latest.current;
          if (!s) return;
          try {
            await change.mutateAsync((current) =>
              withoutTemplate(current, s.base.id),
            );
          } catch {
            throw new ConfirmFailure(
              'The last template cannot be deleted. Make another one first.',
            );
          }
          end();
        }}
        onClose={() => setDeleting(false)}
      />
    </EditContext.Provider>
  );
}
