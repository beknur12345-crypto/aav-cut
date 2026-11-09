'use client';
import { useId } from 'react';
import type { Operation } from '@/domain/project';
import { HelpMark, NumberInput } from '../ui';
import { useEditor } from './store';

/** The operation at `opIndex` (typed by the caller) and an updater that records one undo step. */
export function useOp<T extends Operation>(opIndex: number) {
  const op = useEditor((s) => s.doc.operations[opIndex]) as T;
  const update = useEditor((s) => s.update);
  const set = (recipe: (op: T) => void, coalesce?: string) => update((d) => recipe(d.doc.operations[opIndex] as T), coalesce);
  return { op, set };
}

export function Section({ title }: { title: string }) {
  return <div className="gl-section">{title}</div>;
}

function Row({ id, label, help, unit, children, wide }: { id: string; label: string; help?: string; unit?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="gl-row">
      <label htmlFor={id} className="gl-l">
        {label}
        {help && <HelpMark text={help} />}
      </label>
      <div className={wide ? 'flex w-[205px] shrink-0 items-center' : 'gl-v'}>{children}</div>
      {!wide && <span className="gl-u">{unit}</span>}
    </div>
  );
}

export function NumField({ label, help, unit, value, onChange, min = 0, max, readOnly, testId }: { label: string; help?: string; unit?: string; value: number; onChange?: (v: number) => void; min?: number; max?: number; readOnly?: boolean; testId?: string }) {
  const id = useId();
  return (
    <Row id={id} label={label} help={help} unit={unit}>
      {readOnly ? (
        <output id={id} className="input block text-right tabular-nums" data-testid={testId}>{Math.round(value * 1000) / 1000}</output>
      ) : (
        <NumberInput id={id} value={value} min={min} max={max} onChange={(v) => onChange?.(v)} aria-label={label} data-testid={testId} />
      )}
    </Row>
  );
}

export function CheckField({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="gl-row cursor-pointer gap-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
      {help && <HelpMark text={help} />}
    </label>
  );
}

export function SelectField<V extends string | number>({ label, help, value, options, onChange, wide }: { label: string; help?: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; wide?: boolean }) {
  const id = useId();
  return (
    <Row id={id} label={label} help={help} wide={wide}>
      <select id={id} className="input" value={String(value)} onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as V)}>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </Row>
  );
}

export function TextField({ label, value, onChange, maxLength = 200, unit }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number; unit?: string }) {
  const id = useId();
  return (
    <Row id={id} label={label} unit={unit}>
      <input id={id} className="input" value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </Row>
  );
}

export function RadioGroup<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  return (
    <fieldset>
      <legend className="gl-section">{label}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-1.5 py-0.5 pl-1 text-sm">
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export function Description({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="mt-1">
      <label htmlFor={id} className="gl-section block">{label}</label>
      <textarea id={id} className="input min-h-[110px] w-full" maxLength={5000} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Two-column parameter form. */
export function Form({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-auto"><div className="gl-form">{children}</div></div>;
}
