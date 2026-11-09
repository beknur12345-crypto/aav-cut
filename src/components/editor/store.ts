'use client';
import { createContext, useContext } from 'react';
import { createStore, useStore } from 'zustand';
import type { ProjectDoc, ProjectHeader, ProjectState } from '@/domain/project';

export interface EditorSnapshot {
  header: ProjectHeader;
  doc: ProjectDoc;
}

export interface EditorState extends EditorSnapshot {
  id: string;
  number: number;
  state: ProjectState;
  version: number;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  /** Snapshot that matches what is stored on the server. */
  saved: EditorSnapshot;
  selectedOpId: string | null;
  selectedProductId: string | null;
  /** Apply a change as one undoable step. The recipe mutates a deep copy. */
  /**
   * Apply a change as one undoable step. The recipe mutates a deep copy.
   * Changes with the same `coalesce` key within 1.5 s merge into one step (typing in a field).
   */
  update: (recipe: (draft: EditorSnapshot) => void, coalesce?: string) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (version: number) => void;
  select: (p: { op?: string | null; product?: string | null }) => void;
}

const HISTORY_LIMIT = 100;

export function createEditorStore(init: { id: string; number: number; state: ProjectState; version: number; header: ProjectHeader; doc: ProjectDoc }) {
  const snap = { header: init.header, doc: init.doc };
  let last: { key: string; at: number } | null = null;
  return createStore<EditorState>((set, get) => ({
    ...init,
    past: [],
    future: [],
    saved: snap,
    selectedOpId: init.doc.operations[0]?.id ?? null,
    selectedProductId: init.doc.products[0]?.id ?? null,
    update: (recipe, coalesce) => {
      const { header, doc, past } = get();
      const draft = structuredClone({ header, doc });
      recipe(draft);
      const now = Date.now();
      const merge = !!coalesce && last?.key === coalesce && now - last.at < 1500 && past.length > 0;
      last = coalesce ? { key: coalesce, at: now } : null;
      set({ header: draft.header, doc: draft.doc, past: merge ? past : [...past.slice(-HISTORY_LIMIT + 1), { header, doc }], future: [] });
    },
    undo: () => {
      const { past, future, header, doc } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ ...prev, past: past.slice(0, -1), future: [{ header, doc }, ...future] });
    },
    redo: () => {
      const { past, future, header, doc } = get();
      const next = future[0];
      if (!next) return;
      set({ ...next, past: [...past, { header, doc }], future: future.slice(1) });
    },
    markSaved: (version) => set((s) => ({ version, saved: { header: s.header, doc: s.doc } })),
    select: ({ op, product }) => set((s) => ({ selectedOpId: op === undefined ? s.selectedOpId : op, selectedProductId: product === undefined ? s.selectedProductId : product })),
  }));
}

export type EditorStore = ReturnType<typeof createEditorStore>;
export const EditorContext = createContext<EditorStore | null>(null);

export function useEditor<T>(selector: (s: EditorState) => T): T {
  const store = useContext(EditorContext);
  if (!store) throw new Error('useEditor outside EditorContext');
  return useStore(store, selector);
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorContext);
  if (!store) throw new Error('useEditorStore outside EditorContext');
  return store;
}

export const isDirty = (s: EditorState) => s.header !== s.saved.header || s.doc !== s.saved.doc;
