'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { copyProjects, createFolder, createProject, deleteItems, importProject, moveItems, renameItem, setProjectState } from '@/app/actions/projects';
import { PROJECT_STATES, type ProjectState } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Ico, type IcoName } from '../Ico';
import { DefaultBottom, SidebarSection, SideLink } from '../shell/Sidebar';
import { cx, Dialog, ToolBtn, useUi } from '../ui';

type ProjectRow = { id: string; number: number; name: string; state: ProjectState; cost: number; currency: string; createdAt: string; updatedAt: string };
type FolderRow = { id: string; name: string; parentId: string | null };
type Row = { kind: 'folder'; id: string; name: string } | ({ kind: 'project' } & ProjectRow);
type SortKey = 'number' | 'state' | 'date' | 'cost' | 'name';
type Sort = { key: SortKey; dir: 1 | -1 };

function Th({ k, children, className, sort, onSort }: { k?: SortKey; children?: React.ReactNode; className?: string; sort: Sort; onSort: (k: SortKey) => void }) {
  return (
    <th className={className}>
      {k ? (
        <button className="inline-flex items-center gap-1" onClick={() => onSort(k)}>
          <span className="text-[10px] text-[#555]" aria-hidden>{sort.key === k ? (sort.dir === 1 ? '▲' : '▼') : '◆'}</span>
          {children}
        </button>
      ) : children}
    </th>
  );
}

export const STATE_KEYS: Record<ProjectState, MessageKey> = { NOT_ORDERED: 'stateNotOrdered', ORDERED: 'stateOrdered', APPROVED: 'stateApproved', DONE: 'stateDone' };
const STATE_COLOR: Record<ProjectState, string> = { NOT_ORDERED: '#5c5c5c', ORDERED: '#c77d00', APPROVED: '#1c6fd1', DONE: '#2f9e44' };

export function ProjectsBrowser({ folderId, crumbs, folders, allFolders, projects }: { folderId: string | null; crumbs: { id: string; name: string }[]; folders: FolderRow[]; allFolders: FolderRow[]; projects: ProjectRow[] }) {
  const { t, locale } = useI18n();
  const ui = useUi();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: 'number', dir: 1 });
  const onSort = (k: SortKey) => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }));
  const [menu, setMenuRaw] = useState<{ x: number; y: number } | null>(null);
  const setMenu = (m: { x: number; y: number } | null) => setMenuRaw(m && { x: Math.min(m.x, window.innerWidth - 260), y: Math.min(m.y, window.innerHeight - 440) });
  const [moveOpen, setMoveOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows: Row[] = useMemo(() => {
    const ps = [...projects].sort((a, b) => {
      const v = (p: ProjectRow) => (sort.key === 'date' ? p.updatedAt : sort.key === 'name' ? p.name.toLowerCase() : sort.key === 'state' ? PROJECT_STATES.indexOf(p.state) : p[sort.key]);
      return v(a) < v(b) ? -sort.dir : v(a) > v(b) ? sort.dir : 0;
    });
    return [...folders.map((f) => ({ kind: 'folder' as const, id: f.id, name: f.name })), ...ps.map((p) => ({ kind: 'project' as const, ...p }))];
  }, [folders, projects, sort]);


  const sel = rows.filter((r) => selected.has(r.id));
  const single = sel.length === 1 ? sel[0]! : null;
  const selProjects = sel.filter((r): r is Extract<Row, { kind: 'project' }> => r.kind === 'project');
  const upHref = crumbs.length > 1 ? `/projects?folder=${crumbs[crumbs.length - 2]!.id}` : '/projects';

  const run = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: MessageKey }>, okText?: string) => {
      ui.setBusy(true);
      try {
        const r = await fn();
        if (!r.ok) ui.toast(t(r.error ?? 'errorText'), 'error');
        else if (okText) ui.toast(okText);
        router.refresh();
        return r.ok;
      } catch {
        ui.toast(t('errorText'), 'error');
        return false;
      } finally {
        ui.setBusy(false);
      }
    },
    [router, t, ui],
  );

  const open = (r: Row) => router.push(r.kind === 'folder' ? `/projects?folder=${r.id}` : `/projects/${r.id}`);

  const openImport = useCallback(() => fileRef.current?.click(), []);

  const actions = {
    add: async () => {
      ui.setBusy(true);
      const r = await createProject({ folderId, name: t('newProject') });
      ui.setBusy(false);
      if (r.ok) router.push(`/projects/${r.data.id}`);
      else ui.toast(t(r.error), 'error');
    },
    addFolder: async () => {
      const name = await ui.prompt({ title: t('addFolder'), label: t('name'), value: t('newFolder') });
      if (name) await run(() => createFolder({ name, parentId: folderId }));
    },
    rename: async () => {
      if (!single) return;
      const name = await ui.prompt({ title: t('rename'), label: t('name'), value: single.name });
      if (name && name !== single.name) await run(() => renameItem({ kind: single.kind, id: single.id, name }));
    },
    copy: async () => {
      if (selProjects.length) await run(() => copyProjects({ ids: selProjects.map((p) => p.id) }), t('copied'));
    },
    remove: async () => {
      if (!sel.length) return;
      const hasFolder = sel.some((r) => r.kind === 'folder');
      const okd = await ui.confirm({ title: t('delete'), message: t(hasFolder ? 'confirmDeleteWithFolders' : 'confirmDelete', { count: sel.length }), danger: true });
      if (okd) await run(() => deleteItems(sel.map((r) => ({ kind: r.kind, id: r.id }))), t('deleted'));
    },
    setState: async (state: ProjectState) => {
      if (selProjects.length) await run(() => setProjectState({ ids: selProjects.map((p) => p.id), state }));
    },
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return ui.toast(t('importTooLarge'), 'error');
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return ui.toast(t('importInvalid'), 'error');
    }
    ui.setBusy(true);
    const r = await importProject({ folderId, file: json });
    ui.setBusy(false);
    if (r.ok) router.push(`/projects/${r.data.id}`);
    else ui.toast(t(r.error), 'error');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea,select')) return;
    const idx = rows.findIndex((r) => r.id === anchor);
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = rows[Math.min(rows.length - 1, Math.max(0, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { setAnchor(next.id); setSelected(new Set([next.id])); }
    } else if (e.key === 'Enter' || (mod && e.key === ' ')) {
      e.preventDefault();
      if (single) open(single);
    } else if (e.key === 'F2') { e.preventDefault(); actions.rename(); }
    else if (e.key === 'F4') {
      e.preventDefault();
      if (sel.length) setMoveOpen(true);
    }
    else if (e.key === 'Delete') { e.preventDefault(); actions.remove(); }
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(rows.map((r) => r.id))); }
    else if ((mod && e.key === 'PageDown') || e.key === 'Insert') { e.preventDefault(); actions.add(); }
    else if (e.key === 'Backspace' && folderId) { e.preventDefault(); router.push(upHref); }
  };

  const clickRow = (e: React.MouseEvent, r: Row) => {
    if (e.shiftKey && anchor) {
      const a = rows.findIndex((x) => x.id === anchor);
      const b = rows.findIndex((x) => x.id === r.id);
      setSelected(new Set(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id)));
    } else if (e.ctrlKey || e.metaKey) {
      const s = new Set(selected);
      if (s.has(r.id)) s.delete(r.id);
      else s.add(r.id);
      setSelected(s);
      setAnchor(r.id);
    } else {
      setSelected(new Set([r.id]));
      setAnchor(r.id);
    }
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : locale);
  const fmtCost = (v: number) => v.toLocaleString(locale === 'en' ? 'en-GB' : locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const menuItems: { label: string; shortcut?: string; onClick: () => void; disabled?: boolean; icon: IcoName }[] = [
    { label: t('open'), shortcut: 'Ctrl+Space', onClick: () => single && open(single), disabled: !single, icon: 'open' },
    { label: t('add'), shortcut: 'Ctrl+PgDn', onClick: actions.add, icon: 'add' },
    { label: t('rename'), shortcut: 'F2', onClick: actions.rename, disabled: !single, icon: 'rename' },
    { label: t('addFolder'), onClick: actions.addFolder, icon: 'addFolder' },
    { label: t('moveTo'), shortcut: 'F4', onClick: () => setMoveOpen(true), disabled: !sel.length, icon: 'moveTo' },
    { label: t('copy'), onClick: actions.copy, disabled: !selProjects.length, icon: 'copy' },
    { label: t('delete'), shortcut: 'Del', onClick: actions.remove, disabled: !sel.length, icon: 'delete' },
    ...PROJECT_STATES.map((s) => ({ label: `${t('setState')}: ${t(STATE_KEYS[s])}`, onClick: () => actions.setState(s), disabled: !selProjects.length, icon: 'ordered' as const })),
    { label: t('selectAll'), shortcut: 'Ctrl+A', onClick: () => setSelected(new Set(rows.map((r) => r.id))), icon: 'properties' },
    { label: t('help'), shortcut: 'F1', onClick: () => router.push('/help'), icon: 'help' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col" onClick={() => setMenu(null)}>
      <SidebarSection title={t('projects')} icon="projects">
        <SideLink icon="refresh" label={t('refresh')} onClick={() => router.refresh()} />
        <SideLink icon="open" label={t('open')} onClick={() => single && open(single)} disabled={!single} />
        <div className="h-2" />
        <SideLink icon="add" label={t('add')} onClick={actions.add} testId="sb-add-project" />
        <SideLink icon="addFolder" label={t('addFolder')} onClick={actions.addFolder} />
        <div className="h-2" />
        <SideLink icon="moveTo" label={t('moveTo')} onClick={() => setMoveOpen(true)} disabled={!sel.length} />
        <SideLink icon="rename" label={t('rename')} onClick={actions.rename} disabled={!single} />
        <SideLink icon="copy" label={t('copy')} onClick={actions.copy} disabled={!selProjects.length} />
        <SideLink icon="delete" label={t('delete')} onClick={actions.remove} disabled={!sel.length} />
        <SideLink icon="import" label={t('importProject')} onClick={openImport} />
        <div className="h-2" />
        <SideLink icon="help" label={t('help')} href="/help" />
        <p className="px-3 pt-2 text-xs leading-relaxed text-[#333]">{t('openProjectHint')}</p>
      </SidebarSection>
      <DefaultBottom />

      <div className="flex h-[46px] shrink-0 items-center gap-1 border-b border-[#c4c4c4] px-2">
        <ToolBtn icon="folderUp" label={t('folderUp')} onClick={() => router.push(upHref)} disabled={!folderId} shortcut="Backspace" />
        <ToolBtn icon="home" label={t('projects')} onClick={() => router.push('/projects')} />
        <nav aria-label={t('projects')} className="ml-2 flex min-w-0 items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={c.id} className="inline-flex min-w-0 items-center gap-1">
              {i > 0 && <span className="text-[#888]">/</span>}
              <Link href={`/projects?folder=${c.id}`} className="truncate text-[var(--gl-link)] hover:underline">{c.name}</Link>
            </span>
          ))}
        </nav>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { onImportFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-auto border-l border-[#2f6fde] outline-none"
        data-testid="projects-grid"
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      >
        <table className="gl-grid">
          <thead>
            <tr>
              <Th className="w-12" sort={sort} onSort={onSort}>№</Th>
              <Th className="w-10" sort={sort} onSort={onSort} />
              <Th k="number" className="w-24" sort={sort} onSort={onSort}>ID</Th>
              <Th className="w-32" sort={sort} onSort={onSort}>{t('owner')}</Th>
              <Th k="state" className="w-36" sort={sort} onSort={onSort}>{t('state')}</Th>
              <Th k="date" className="w-36" sort={sort} onSort={onSort}>{t('date')}</Th>
              <Th k="cost" className="w-36" sort={sort} onSort={onSort}>{t('cost')}</Th>
              <Th k="name" sort={sort} onSort={onSort}>{t('name')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id}
                aria-selected={selected.has(r.id)}
                onClick={(e) => { e.stopPropagation(); clickRow(e, r); setMenu(null); }}
                onDoubleClick={() => open(r)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!selected.has(r.id)) { setSelected(new Set([r.id])); setAnchor(r.id); }
                  setMenu({ x: e.clientX, y: e.clientY });
                }}
              >
                <td className="no">{i + 1}</td>
                <td className="text-center">{r.kind === 'folder' ? <Ico name="open" size={16} /> : <Ico name="project" size={16} />}</td>
                {r.kind === 'folder' ? (
                  <>
                    <td colSpan={5} />
                    <td className="font-semibold">{r.name}</td>
                  </>
                ) : (
                  <>
                    <td className="text-right tabular-nums">{r.number}</td>
                    <td className="text-center">{t('my')}</td>
                    <td className="text-center" style={{ color: STATE_COLOR[r.state] }}>{t(STATE_KEYS[r.state])}</td>
                    <td className="text-center tabular-nums">{fmtDate(r.updatedAt)}</td>
                    <td className="text-right tabular-nums">{fmtCost(r.cost)} {r.currency}</td>
                    <td><Link href={`/projects/${r.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-[#555]">{t('noProjectsYet')}</p>
            <button className="gl-link w-auto items-center" onClick={actions.add}><Ico name="add" /> {t('addProject')}</button>
          </div>
        )}
      </div>

      {menu && (
        <div role="menu" className="fixed z-40 min-w-60 border border-[#8f8f8f] bg-white py-1 shadow-[2px_2px_6px_rgba(0,0,0,0.3)]" style={{ left: menu.x, top: menu.y }}>
          {menuItems.map((m) => (
            <button
              key={m.label}
              role="menuitem"
              disabled={m.disabled}
              className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-sm hover:bg-[var(--gl-select)] disabled:opacity-40 disabled:hover:bg-transparent"
              onClick={(e) => { e.stopPropagation(); setMenu(null); m.onClick(); }}
            >
              <Ico name={m.icon} size={15} />
              <span className="flex-1">{m.label}</span>
              {m.shortcut && <kbd className="text-xs text-[#777]">[{m.shortcut}]</kbd>}
            </button>
          ))}
        </div>
      )}

      <MoveDialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        folders={allFolders}
        exclude={new Set(sel.filter((r) => r.kind === 'folder').map((r) => r.id))}
        onMove={async (target) => {
          setMoveOpen(false);
          await run(() => moveItems({ items: sel.map((r) => ({ kind: r.kind, id: r.id })), folderId: target }));
        }}
      />
    </div>
  );
}

function MoveDialog({ open, onClose, folders, exclude, onMove }: { open: boolean; onClose: () => void; folders: FolderRow[]; exclude: Set<string>; onMove: (id: string | null) => void }) {
  const { t } = useI18n();
  const [target, setTarget] = useState<string | null>(null);
  const tree = (parent: string | null, depth: number): React.ReactNode =>
    folders
      .filter((f) => f.parentId === parent && !exclude.has(f.id))
      .map((f) => (
        <div key={f.id}>
          <button className={cx('flex w-full items-center gap-2 px-2 py-0.5 text-left text-sm', target === f.id ? 'bg-[var(--gl-select)]' : 'hover:bg-[#eef6ff]')} style={{ paddingLeft: 8 + depth * 16 }} onClick={() => setTarget(f.id)}>
            <Ico name="open" size={14} /> {f.name}
          </button>
          {tree(f.id, depth + 1)}
        </div>
      ));
  return (
    <Dialog open={open} onClose={onClose} title={t('moveTo')} width={400} footer={<><button className="btn" onClick={() => onMove(target)}>{t('move')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></>}>
      <button className={cx('flex w-full items-center gap-2 px-2 py-0.5 text-left text-sm', target === null ? 'bg-[var(--gl-select)]' : 'hover:bg-[#eef6ff]')} onClick={() => setTarget(null)}>
        <Ico name="home" size={14} /> {t('projects')}
      </button>
      {tree(null, 1)}
    </Dialog>
  );
}
