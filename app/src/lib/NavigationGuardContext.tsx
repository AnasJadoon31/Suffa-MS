import { createContext, useContext, useRef, type ReactNode } from "react";

type NavigationGuard = () => Promise<boolean>;

interface NavigationGuardContextValue {
  confirmNavigation: () => Promise<boolean>;
  setNavigationGuard: (guard: NavigationGuard | null) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: Readonly<{ children: ReactNode }>) {
  const guardRef = useRef<NavigationGuard | null>(null);

  return (
    <NavigationGuardContext.Provider
      value={{
        confirmNavigation: () => guardRef.current?.() ?? Promise.resolve(true),
        setNavigationGuard: (guard) => {
          guardRef.current = guard;
        },
      }}
    >
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard() {
  const value = useContext(NavigationGuardContext);
  if (!value) throw new Error("useNavigationGuard must be used inside NavigationGuardProvider");
  return value;
}
