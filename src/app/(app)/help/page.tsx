import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import type { MessageKey } from '@/lib/i18n';
import { HelpSidebar } from '@/components/HelpSidebar';

export const metadata: Metadata = { title: 'Help' };

const SHORTCUTS: [string, MessageKey, MessageKey][] = [
  ['Ctrl+S', 'save', 'scopeProject'],
  ['Ctrl+Z', 'undo', 'scopeProject'],
  ['Ctrl+Y / Ctrl+Shift+Z', 'redo', 'scopeProject'],
  ['F1', 'help', 'scopeEverywhere'],
  ['Enter / Ctrl+Space / double-click', 'open', 'scopeProjectsList'],
  ['Ctrl+PgDn / Insert', 'addProject', 'scopeProjectsList'],
  ['F2', 'rename', 'scopeProjectsList'],
  ['F4', 'moveTo', 'scopeProjectsList'],
  ['Del', 'delete', 'scopeProjectsList'],
  ['Ctrl+A', 'selectAll', 'scopeProjectsList'],
  ['Backspace', 'folderUp', 'scopeProjectsList'],
  ['Ctrl+K', 'clone', 'scopeOperationsParts'],
  ['Ctrl+↑ / Ctrl+↓', 'moveUpDown', 'scopeOperationsParts'],
  ['Insert / Ctrl+Enter', 'addPart', 'scopeParts'],
  ['Ctrl+PgUp', 'insertPart', 'scopeParts'],
  ['Ctrl+V', 'pasteFromExcel', 'scopeParts'],
  ['Tab / Enter', 'nextCell', 'scopeParts'],
  ['Ctrl+F', 'filterZeroProducts', 'scopeProducts'],
  ['Ctrl+Space', 'productProperties', 'scopeProducts'],
];

export default async function HelpPage() {
  const { t } = await getT();
  const steps: MessageKey[] = ['quickStart1', 'quickStart2', 'quickStart3', 'quickStart4', 'quickStart5'];
  return (
    <div className="h-full overflow-auto">
      <HelpSidebar />
      <div className="max-w-3xl space-y-4 p-4">
        <section className="border border-[#c4c4c4] bg-white" id="quick-start">
          <h2 className="gl-tabbar !min-h-[30px] text-[17px]">{t('quickStart')}</h2>
          <ol className="list-decimal space-y-1.5 p-4 pl-9 text-sm">{steps.map((s) => <li key={s}>{t(s)}</li>)}</ol>
        </section>
        <section className="border border-[#c4c4c4] bg-white" id="shortcuts">
          <h2 className="gl-tabbar !min-h-[30px] text-[17px]">{t('shortcuts')}</h2>
          <table className="gl-grid">
            <thead><tr><th>{t('key')}</th><th>{t('action')}</th><th>{t('where')}</th></tr></thead>
            <tbody>
              {SHORTCUTS.map(([k, a, s]) => (
                <tr key={k + a}><td className="font-mono text-xs">[{k}]</td><td>{t(a)}</td><td>{t(s)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="border border-[#c4c4c4] bg-white" id="commands">
          <h2 className="gl-tabbar !min-h-[30px] text-[17px]">{t('tableOfCommands')}</h2>
          <p className="p-4 text-sm">{t('cmdLegend')}</p>
        </section>
      </div>
    </div>
  );
}
