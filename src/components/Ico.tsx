import {
  ArrowDownToLine, ArrowUpFromLine, BookOpen, Boxes, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, ClipboardPaste,
  Columns3, Copy, Database, FileBox, FileInput, FileSpreadsheet, FileText, Files, Filter, FolderInput, FolderOpen, FolderPlus, FolderUp, Globe,
  Home, KeyRound, Layers, ListChecks, ListOrdered, LogOut, Mail, MessageSquare, Pencil, Printer, Redo2, RefreshCw, Save, Scissors, Settings2,
  ShoppingCart, SlidersHorizontal, Sparkles, Tag, Undo2, User, Wrench, type LucideIcon,
} from 'lucide-react';

/** Custom classic glyphs (our own drawings). */
function Help({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7.2" fill="#3aa335" stroke="#1f6e1b" strokeWidth="0.8" />
      <text x="8" y="12" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="Arial">?</text>
    </svg>
  );
}
function Plus({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M6 1.5h4v4.5h4.5v4H10v4.5H6V10H1.5V6H6z" fill="#3fb13a" stroke="#1d7019" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}
function Cross({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M3 5.2 5.2 3 8 5.8 10.8 3 13 5.2 10.2 8 13 10.8 10.8 13 8 10.2 5.2 13 3 10.8 5.8 8z" fill="#e5312b" stroke="#9c1612" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}
function CloseBox({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <rect x="0.8" y="0.8" width="14.4" height="14.4" rx="3" fill="#ef4a3a" stroke="#b5241a" strokeWidth="0.8" />
      <path d="M4.6 4.6l6.8 6.8M11.4 4.6l-6.8 6.8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
/** Small coloured "sheet with cuts" glyphs for operation types. */
function OpGlyph({ size, color, kind }: { size: number; color: string; kind: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <rect x="1" y="3" width="14" height="10" fill={color} stroke="#5b4300" strokeWidth="0.8" />
      {kind === 'grid' && <path d="M1 8h14M6 3v10M11 3v10" stroke="#5b4300" strokeWidth="0.8" />}
      {kind === 'bands' && <path d="M4.5 3v10M8 3v10M11.5 3v10" stroke="#5b4300" strokeWidth="0.8" />}
      {kind === 'edge' && <path d="M1 3h14" stroke="#1c7ed6" strokeWidth="2.4" />}
      {kind === 'groove' && <path d="M1 7h14M1 9h14" stroke="#5b4300" strokeWidth="0.8" />}
      {kind === 'surface' && <path d="M3 11 7 5l2 3 2-2 3 5" stroke="#1c7ed6" strokeWidth="1" fill="none" />}
      {kind === 'nest' && <path d="M3 5h4v3H3zM9 5h4v6H9zM3 9.5h4" stroke="#5b4300" strokeWidth="0.8" fill="none" />}
      {kind === 'xnc' && <><circle cx="5" cy="8" r="1.4" fill="#5b4300" /><circle cx="11" cy="8" r="1.4" fill="#5b4300" /></>}
    </svg>
  );
}

type Spec = { icon: LucideIcon; color: string } | ((size: number) => React.ReactNode);

const SPECS = {
  help: (s: number) => <Help size={s} />,
  add: (s: number) => <Plus size={s} />,
  delete: (s: number) => <Cross size={s} />,
  close: (s: number) => <CloseBox size={s} />,
  opCS: (s: number) => <OpGlyph size={s} color="#ffd34d" kind="grid" />,
  opCN: (s: number) => <OpGlyph size={s} color="#ffd34d" kind="nest" />,
  opCL: (s: number) => <OpGlyph size={s} color="#ffd34d" kind="bands" />,
  opEL: (s: number) => <OpGlyph size={s} color="#fff1c2" kind="edge" />,
  opSP: (s: number) => <OpGlyph size={s} color="#ffe58a" kind="surface" />,
  opGR: (s: number) => <OpGlyph size={s} color="#ffe58a" kind="groove" />,
  opXNC: (s: number) => <OpGlyph size={s} color="#ffe58a" kind="xnc" />,
  opLB: { icon: Tag, color: '#7aa7d6' },
  opO: { icon: Boxes, color: '#2f9e44' },
  refresh: { icon: RefreshCw, color: '#1c6fd1' },
  undo: { icon: Undo2, color: '#1c6fd1' },
  redo: { icon: Redo2, color: '#1c6fd1' },
  save: { icon: Save, color: '#1c4fa0' },
  general: { icon: Settings2, color: '#7048e8' },
  export: { icon: ArrowUpFromLine, color: '#2f9e44' },
  import: { icon: ArrowDownToLine, color: '#e8590c' },
  excel: { icon: FileSpreadsheet, color: '#1e7b34' },
  otherPrograms: { icon: FileInput, color: '#ae3ec9' },
  ordered: { icon: ShoppingCart, color: '#5c6b7a' },
  print: { icon: Printer, color: '#495057' },
  settings: { icon: Wrench, color: '#1c6fd1' },
  logout: { icon: LogOut, color: '#e8590c' },
  language: { icon: Globe, color: '#1c6fd1' },
  project: { icon: FileText, color: '#4c6ef5' },
  projects: { icon: Files, color: '#4c6ef5' },
  open: { icon: FolderOpen, color: '#e0a800' },
  addFolder: { icon: FolderPlus, color: '#e0a800' },
  moveTo: { icon: FolderInput, color: '#e0a800' },
  folderUp: { icon: FolderUp, color: '#e0a800' },
  home: { icon: Home, color: '#4c6ef5' },
  rename: { icon: Pencil, color: '#e8590c' },
  copy: { icon: Copy, color: '#4c6ef5' },
  clone: { icon: Copy, color: '#2f9e44' },
  up: { icon: ChevronUp, color: '#1c6fd1' },
  down: { icon: ChevronDown, color: '#1c6fd1' },
  first: { icon: ChevronsLeft, color: '#1c6fd1' },
  prev: { icon: ChevronLeft, color: '#1c6fd1' },
  next: { icon: ChevronRight, color: '#1c6fd1' },
  last: { icon: ChevronsRight, color: '#1c6fd1' },
  catalog: { icon: Database, color: '#1c6fd1' },
  parameters: { icon: SlidersHorizontal, color: '#495057' },
  parts: { icon: Layers, color: '#e0a800' },
  sheets: { icon: RefreshCw, color: '#2f9e44' },
  cutting: { icon: Scissors, color: '#e8590c' },
  product: { icon: FileBox, color: '#e8590c' },
  paste: { icon: ClipboardPaste, color: '#c77d00' },
  columns: { icon: Columns3, color: '#4c6ef5' },
  filter: { icon: Filter, color: '#2f9e44' },
  properties: { icon: ListChecks, color: '#4c6ef5' },
  commands: { icon: ListOrdered, color: '#4c6ef5' },
  comment: { icon: MessageSquare, color: '#e0a800' },
  optimize: { icon: Sparkles, color: '#e8590c' },
  password: { icon: KeyRound, color: '#e0a800' },
  email: { icon: Mail, color: '#1c6fd1' },
  user: { icon: User, color: '#4c6ef5' },
  book: { icon: BookOpen, color: '#4c6ef5' },
  template: { icon: Pencil, color: '#ae3ec9' },
} satisfies Record<string, Spec>;

export type IcoName = keyof typeof SPECS;

/** Colourful toolbar / menu icon. */
export function Ico({ name, size = 16 }: { name: IcoName; size?: number }) {
  const spec: Spec = SPECS[name];
  if (typeof spec === 'function') return <span className="inline-flex shrink-0">{spec(size)}</span>;
  const I = spec.icon;
  return <I size={size} color={spec.color} strokeWidth={2.2} className="shrink-0" aria-hidden />;
}
