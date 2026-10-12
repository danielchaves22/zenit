import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import { useRouter } from 'next/router';
import { useAuth } from './AuthContext';

interface Navigation {
  protect: (dirty: boolean, busy: boolean) => void;
  request: (action: () => void) => void;
  complete: (action: () => void) => void;
  notice: string;
  setNotice: (notice: string) => void;
}
const Context = createContext<Navigation>({
  protect: () => {},
  request: (action) => action(),
  complete: (action) => action(),
  notice: '',
  setNotice: () => {}
});

export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { company } = useAuth();
  const guard = useRef({ dirty: false, busy: false });
  const permitted = useRef(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [message, setMessage] = useState<{ companyId?: number; text: string }>({ text: '' });
  const notice = message.companyId === company?.id ? message.text : '';
  const setNotice = (text: string) => setMessage({ companyId: company?.id, text });
  const dialog = useRef<HTMLDialogElement>(null);
  const protect = useCallback((dirty: boolean, busy: boolean) => {
    guard.current = { dirty, busy };
    if (dirty || busy) permitted.current = false;
  }, []);
  const complete = useCallback((action: () => void) => {
    guard.current = { dirty: false, busy: false };
    permitted.current = true;
    setPending(null);
    action();
  }, []);
  const request = useCallback((action: () => void) => {
    if (guard.current.busy) return;
    if (guard.current.dirty) setPending(() => action);
    else action();
  }, []);

  useEffect(() => {
    const historyIndex = () =>
      (
        window as Window & {
          navigation?: { currentEntry?: { index: number } };
        }
      ).navigation?.currentEntry?.index;
    const positions = new Map<string, number>();
    let current = 0;
    let currentKey = '';
    let currentIndex = historyIndex();
    let restoring = false;
    const remember = () => {
      permitted.current = false;
      currentIndex = historyIndex();
      const key = window.history.state?.key;
      if (!key) return;
      currentKey = key;
      if (!positions.has(key)) positions.set(key, positions.size ? current + 1 : current);
      current = positions.get(key)!;
    };
    remember();
    router.beforePopState((state) => {
      const key = (state as typeof state & { key?: string }).key || '';
      if (restoring) {
        restoring = false;
        // After a reload, Next may consume the restoring pop before invoking this hook.
        // Only suppress the actual restoring entry, never the later approved traversal.
        if (key === currentKey) return false;
      }
      if (permitted.current || (!guard.current.dirty && !guard.current.busy)) return true;
      // Next preserves the history key on replace and changes it on push.
      const target = positions.get(key);
      const targetIndex = historyIndex();
      const delta =
        currentIndex !== undefined && targetIndex !== undefined
          ? targetIndex - currentIndex
          : target === undefined
            ? -1
            : target - current;
      if (!delta) return true;
      restoring = true;
      window.history.go(-delta);
      request(() => {
        permitted.current = true;
        window.history.go(delta);
      });
      return false;
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (!guard.current.dirty && !guard.current.busy) return;
      event.preventDefault();
      event.returnValue = '';
    };
    router.events.on('routeChangeComplete', remember);
    window.addEventListener('beforeunload', unload);
    return () => {
      router.beforePopState(() => true);
      router.events.off('routeChangeComplete', remember);
      window.removeEventListener('beforeunload', unload);
    };
  }, [router.events, request]);
  useEffect(() => {
    if (pending) dialog.current?.showModal();
    else dialog.current?.close();
  }, [pending]);
  return (
    <Context.Provider value={{ protect, request, complete, notice, setNotice }}>
      {children}
      <dialog
        ref={dialog}
        className="confirmation-dialog"
        aria-labelledby="discard-title"
        onCancel={(event) => {
          event.preventDefault();
          setPending(null);
        }}
      >
        <div className="discard-panel">
          <h2 id="discard-title">Descartar alterações?</h2>
          <p>Você tem informações que ainda não foram salvas.</p>
          <div className="dialog-actions">
            <button className="button" autoFocus onClick={() => setPending(null)}>
              Continuar editando
            </button>
            <button
              className="button danger"
              onClick={() => {
                if (pending) complete(pending);
              }}
            >
              Descartar
            </button>
          </div>
        </div>
      </dialog>
    </Context.Provider>
  );
}
export const useNavigation = () => useContext(Context);
