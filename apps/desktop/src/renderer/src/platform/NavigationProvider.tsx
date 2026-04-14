import { type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { NavigationContext, type NavigationAdapter } from "@open-conductor/views/navigation";

// Desktop implementation of NavigationAdapter using react-router-dom.
export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const adapter: NavigationAdapter = {
    pathname: location.pathname,
    push: (path) => navigate(path),
    replace: (path) => navigate(path, { replace: true }),
    back: () => navigate(-1),
  };

  return (
    <NavigationContext.Provider value={adapter}>
      {children}
    </NavigationContext.Provider>
  );
}
