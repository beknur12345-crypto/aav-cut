'use client';
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Ico, type IcoName } from './Ico';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ---------- Dialog ---------- */

const noSubscribe = () => () => {};
/** False during server rendering and hydration, true afterwards — keeps the first client render identical to the server HTML. */
function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  width = 520,
  testId,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { t } = useI18n();
  const hydrated = useHydrated();
  // Callers usually pass an inline onClose; reading it through a ref keeps the focus setup below
  // from re-running (and stealing focus back to the first field) on every keystroke.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!open || !hydrated) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // Focus the first field, keep Tab inside the dialog, close on Escape.
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('input,select,textarea,button,[tabindex]:not([tabindex="-1"])') ?? [])].filter((x) => !x.hasAttribute('disabled'));
    (focusables().find((x) => x.tagName !== 'BUTTON') ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, hydrated]);
  if (!open || !hydrated) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/20 p-4 pt-[14vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className="w-full max-w-full border border-[#8f8f8f] bg-white shadow-[3px_3px_10px_rgba(0,0,0,0.35)]"
        style={{ width }}
      >
        <div className="flex h-8 items-center justify-between border-b border-[#a4a4a4] bg-gradient-to-b from-[#ececec] to-[#c9c9c9] pl-2.5 pr-1.5">
          <h2 id={titleId} className="text-base">{title}</h2>
          <button className="icon-btn h-6 w-6" onClick={onClose} aria-label={t('close')} title={t('close')}>
            <Ico name="close" size={15} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-3 py-3">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-3 pb-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Tabs ---------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  children,
}: {
  tabs: { id: T; label: string; icon?: IcoName }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /** Toolbar shown on the right of the tab bar. */
  children?: React.ReactNode;
}) {
  return (
    <div className={cx('gl-tabbar', className)}>
      <div role="tablist" className="flex items-end gap-1 self-end">
        {tabs.map((tab) => (
          <button key={tab.id} role="tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)} className="gl-tab">
            {tab.icon && <Ico name={tab.icon} size={14} />}
            {tab.label}
          </button>
        ))}
      </div>
      {children && <div className="ml-auto flex flex-wrap items-center gap-0.5" role="toolbar">{children}</div>}
    </div>
  );
}

/** Icon-only toolbar button with tooltip (label + optional shortcut). */
export function ToolBtn({ icon, label, onClick, disabled, shortcut, testId, pressed }: { icon: IcoName; label: string; onClick: () => void; disabled?: boolean; shortcut?: string; testId?: string; pressed?: boolean }) {
  return (
    <button
      className={cx('icon-btn', pressed && 'bg-white/80 ring-1 ring-[#8f8f8f]')}
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} [${shortcut}]` : label}
      aria-label={label}
      aria-pressed={pressed}
      data-testid={testId}
    >
      <Ico name={icon} size={17} />
    </button>
  );
}

/** Text link with an icon, as used in empty states and the sidebar. */
export function IconLink({ icon, label, onClick, disabled, testId }: { icon: IcoName; label: string; onClick: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button className="gl-link w-auto items-center" onClick={onClick} disabled={disabled} data-testid={testId}>
      <Ico name={icon} size={16} />
      {label}
    </button>
  );
}

/** Small green help mark with a tooltip, next to parameter labels. */
export function HelpMark({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} role="img" className="inline-flex cursor-help">
      <Ico name="help" size={14} />
    </span>
  );
}

/* ---------- Form fields ---------- */

/**
 * Labelled form control. The label names the control; hint and error text are linked with
 * aria-describedby so they are announced without becoming part of the control's name.
 */
export function Field({ label, error, children, hint }: { label: string; error?: string | null; children: React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>; hint?: string }) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  const control = isValidElement(children)
    ? cloneElement(children, { id: children.props.id ?? id, 'aria-describedby': note ? noteId : undefined, 'aria-invalid': error ? true : undefined })
    : children;
  return (
    <div>
      <label htmlFor={children.props.id ?? id} className="label">{label}</label>
      {control}
      {note && (
        <span id={noteId} role={error ? 'alert' : undefined} className={cx('mt-0.5 block text-xs', error ? 'text-red-600' : 'text-slate-500')}>
          {note}
        </span>
      )}
    </div>
  );
}

/** Numeric input that keeps the raw text while typing and commits a number on blur/Enter. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  className,
  ...rest
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step'>) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  // Follow outside changes (undo, recalculation) without an effect.
  if (value !== prev) {
    setPrev(value);
    setText(String(value));
  }
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n)) return setText(String(value));
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <input
      {...rest}
      inputMode="decimal"
      className={cx('input text-right tabular-nums', className)}
      value={text}
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" aria-hidden />;
}

export function ErrorText({ error }: { error: MessageKey | null }) {
  const { t } = useI18n();
  if (!error) return null;
  return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{t(error)}</p>;
}

/* ---------- Confirm / prompt / toast (imperative API) ---------- */

type Prompt =
  | { kind: 'confirm'; title: string; message: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'prompt'; title: string; label: string; value: string; resolve: (v: string | null) => void };

type Toast = { id: number; text: string; tone: 'ok' | 'error' };

const UiCtx = createContext<{
  confirm: (o: { title: string; message: string; danger?: boolean }) => Promise<boolean>;
  prompt: (o: { title: string; label: string; value?: string }) => Promise<string | null>;
  toast: (text: string, tone?: 'ok' | 'error') => void;
  setBusy: (busy: boolean) => void;
} | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [dlg, setDlg] = useState<Prompt | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusyCount] = useState(0);
  const [promptValue, setPromptValue] = useState('');

  const confirm = useCallback((o: { title: string; message: string; danger?: boolean }) => new Promise<boolean>((resolve) => setDlg({ kind: 'confirm', ...o, resolve })), []);
  const prompt = useCallback(
    (o: { title: string; label: string; value?: string }) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(o.value ?? '');
        setDlg({ kind: 'prompt', title: o.title, label: o.label, value: o.value ?? '', resolve });
      }),
    [],
  );
  const toast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4000);
  }, []);
  const setBusy = useCallback((b: boolean) => setBusyCount((c) => Math.max(0, c + (b ? 1 : -1))), []);

  const close = (v: boolean) => {
    if (!dlg) return;
    if (dlg.kind === 'confirm') dlg.resolve(v);
    else dlg.resolve(v ? promptValue.trim() || null : null);
    setDlg(null);
  };

  return (
    <UiCtx.Provider value={{ confirm, prompt, toast, setBusy }}>
      {children}
      <Dialog
        open={!!dlg}
        title={dlg?.title ?? ''}
        onClose={() => close(false)}
        width={420}
        footer={
          <>
            <button className="btn" onClick={() => close(false)}>{t('cancel')}</button>
            <button className={cx('btn', dlg?.kind === 'confirm' && dlg.danger ? 'btn-danger' : 'btn-primary')} onClick={() => close(true)}>
              {t('ok')}
            </button>
          </>
        }
      >
        {dlg?.kind === 'confirm' && <p className="text-sm text-slate-700">{dlg.message}</p>}
        {dlg?.kind === 'prompt' && (
          <form onSubmit={(e) => { e.preventDefault(); close(true); }}>
            <Field label={dlg.label}>
              <input className="input" value={promptValue} maxLength={200} onChange={(e) => setPromptValue(e.target.value)} />
            </Field>
          </form>
        )}
      </Dialog>
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((x) => (
          <div key={x.id} className={cx('rounded-md px-3 py-2 text-sm text-white shadow-lg', x.tone === 'ok' ? 'bg-slate-800' : 'bg-red-600')}>
            {x.text}
          </div>
        ))}
      </div>
      {busy > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/40" aria-busy="true">
          <div className="rounded-full bg-white p-3 text-brand-600 shadow-lg">
            <Spinner size={28} />
          </div>
        </div>
      )}
    </UiCtx.Provider>
  );
}

export function useUi() {
  const c = useContext(UiCtx);
  if (!c) throw new Error('useUi must be used inside UiProvider');
  return c;
}
