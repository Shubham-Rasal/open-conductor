// NavigationAdapter is the abstract interface for platform-specific routing.
// Each app (desktop, web) provides its own implementation via NavigationProvider.
export interface NavigationAdapter {
  push: (path: string) => void;
  replace: (path: string) => void;
  back: () => void;
  pathname: string;
}

// NavigationContext is set by each platform's NavigationProvider.
// Views consume it via useNavigation() to stay framework-agnostic.
import { createContext, useContext } from "react";

export const NavigationContext = createContext<NavigationAdapter | null>(null);

export function useNavigation(): NavigationAdapter {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}
