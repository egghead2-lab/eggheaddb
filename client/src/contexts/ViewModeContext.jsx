import { createContext, useContext } from 'react';

const ViewModeContext = createContext(false);

export function ViewModeProvider({ value, children }) {
  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
