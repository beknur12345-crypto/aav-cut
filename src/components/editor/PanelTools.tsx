'use client';
import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

/** The element on the right of the panel's tab bar where the active tab puts its toolbar. */
export const PanelToolsContext = createContext<HTMLElement | null>(null);

export function PanelTools({ children }: { children: React.ReactNode }) {
  const el = useContext(PanelToolsContext);
  return el ? createPortal(children, el) : null;
}
