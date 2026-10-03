import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { todayIso } from "../domain/dates";
import type { Services } from "./services";
import { createAppStore, type AppActions, type AppData } from "./storeCore";

interface AppStore extends AppData, AppActions {
  services: Services;
  error: string | null;
}

const StoreContext = createContext<AppStore | null>(null);

interface StoreProviderProps {
  services: Services;
  children: ReactNode;
}

export function StoreProvider({ services, children }: StoreProviderProps) {
  const [core] = useState(() => createAppStore(services));
  const { data, error } = useSyncExternalStore(
    core.subscribe,
    core.getSnapshot,
  );

  useEffect(() => {
    void core.actions.reload().then(() => core.autoBackup(todayIso()));
  }, [core]);

  const store = useMemo<AppStore | null>(
    () => (data ? { ...data, ...core.actions, services, error } : null),
    [data, core, services, error],
  );

  if (!store) {
    return (
      <p role={error ? "alert" : "status"} className="text-ink/70 p-4">
        {error ?? "Cargando tus datos…"}
      </p>
    );
  }
  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore necesita un StoreProvider");
  return store;
}
