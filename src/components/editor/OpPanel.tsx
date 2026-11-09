'use client';
import { useState } from 'react';
import type { OperationCost } from '@/domain/calc';
import type { Operation } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { IcoName } from '../Ico';
import { Tabs, ToolBtn } from '../ui';
import { useEditor, useEditorStore } from './store';
import { PanelToolsContext } from './PanelTools';
import { SheetParams } from './SheetParams';
import { PartsGrid } from './PartsGrid';
import { SheetsGrid } from './SheetsGrid';
import { CuttingTab } from './CuttingTab';
import { ElParams, ElParts } from './ElPanel';
import { GrParams, GrParts } from './GrPanel';
import { SpParams, SpParts } from './SpPanel';
import { OPanel } from './OPanel';
import { ClParams, ClParts, ClStock, ClCutting } from './ClPanel';
import { LbParams, LbTemplate } from './LbPanel';
import { XncParams, XncTemplate } from './XncPanel';

type TabId = 'params' | 'parts' | 'sheets' | 'cutting' | 'template';

const TABS: Record<Operation['type'], TabId[]> = {
  CS: ['params', 'parts', 'sheets', 'cutting'],
  CN: ['params', 'parts', 'sheets', 'cutting'],
  CL: ['params', 'parts', 'sheets', 'cutting'],
  EL: ['params', 'parts'],
  GR: ['params', 'parts'],
  SP: ['params', 'parts'],
  LB: ['params', 'template'],
  XNC: ['params', 'template'],
  O: [],
};
const TAB_ICON: Record<TabId, IcoName> = { params: 'parameters', parts: 'parts', sheets: 'sheets', cutting: 'opCS', template: 'template' };

export function OpPanel({ opIndex, cost }: { opIndex: number; cost: OperationCost }) {
  const { t } = useI18n();
  const op = useEditor((s) => s.doc.operations[opIndex]!);
  const store = useEditorStore();
  const tabs = TABS[op.type];
  const hasParts = 'parts' in op && op.parts.length > 0;
  const [tab, setTab] = useState<TabId>(hasParts ? 'parts' : 'params');
  const [tools, setTools] = useState<HTMLElement | null>(null);

  if (op.type === 'O') return <OPanel opIndex={opIndex} cost={cost} />;

  const label: Record<TabId, string> = {
    params: t('parameters'),
    parts: 'parts' in op ? `${t('parts')} (${op.parts.length})` : t('parts'),
    sheets: op.type === 'CL' ? t('bandsAndOffcut') : t('sheetsAndOffcuts'),
    cutting: t('cutting'),
    template: t('template'),
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={tab} onChange={setTab} tabs={tabs.map((id) => ({ id, label: label[id], icon: TAB_ICON[id] }))}>
        <span ref={setTools} className="flex items-center gap-0.5" />
        <ToolBtn icon="print" label={t('printThisOperation')} onClick={() => window.open(`/projects/${store.getState().id}/print?op=${op.id}`, '_blank', 'noopener')} />
        <ToolBtn icon="help" label={t('help')} onClick={() => window.open('/help', '_blank', 'noopener')} shortcut="F1" />
      </Tabs>
      <PanelToolsContext.Provider value={tools}>
        <div className="min-h-0 flex-1 bg-[var(--gl-bg)]">
          {(op.type === 'CS' || op.type === 'CN') && (
            <>
              {tab === 'params' && <SheetParams opIndex={opIndex} cost={cost} />}
              {tab === 'parts' && <PartsGrid opIndex={opIndex} />}
              {tab === 'sheets' && <SheetsGrid opIndex={opIndex} />}
              {tab === 'cutting' && <CuttingTab opIndex={opIndex} />}
            </>
          )}
          {op.type === 'CL' && (
            <>
              {tab === 'params' && <ClParams opIndex={opIndex} cost={cost} />}
              {tab === 'parts' && <ClParts opIndex={opIndex} />}
              {tab === 'sheets' && <ClStock opIndex={opIndex} />}
              {tab === 'cutting' && <ClCutting opIndex={opIndex} />}
            </>
          )}
          {op.type === 'EL' && (tab === 'params' ? <ElParams opIndex={opIndex} cost={cost} /> : <ElParts opIndex={opIndex} />)}
          {op.type === 'GR' && (tab === 'params' ? <GrParams opIndex={opIndex} cost={cost} /> : <GrParts opIndex={opIndex} />)}
          {op.type === 'SP' && (tab === 'params' ? <SpParams opIndex={opIndex} cost={cost} /> : <SpParts opIndex={opIndex} />)}
          {op.type === 'LB' && (tab === 'params' ? <LbParams opIndex={opIndex} /> : <LbTemplate opIndex={opIndex} />)}
          {op.type === 'XNC' && (tab === 'params' ? <XncParams opIndex={opIndex} cost={cost} /> : <XncTemplate opIndex={opIndex} />)}
        </div>
      </PanelToolsContext.Provider>
    </div>
  );
}
