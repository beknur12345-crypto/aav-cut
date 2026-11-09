'use client';
import type { OperationCost } from '@/domain/calc';
import { COST_OPERATION_BY, INITIAL_DIRECTIONS, MILL_MOVEMENT, ROUNDING_SHEETS, SORT_BANDS, type CsParams, type SheetOperation } from '@/domain/project';
import { useI18n } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { CheckField, Form, NumField, Section, SelectField, TextField, useOp } from './forms';
import { COST_BY_KEYS, DIRECTION_KEYS, ROUNDING_KEYS, SORT_KEYS } from './labels';

export function SheetParams({ opIndex, cost }: { opIndex: number; cost: OperationCost }) {
  const { t } = useI18n();
  const { op, set } = useOp<SheetOperation>(opIndex);
  const p = op.params;
  const setP = <K extends keyof CsParams>(k: K) => (v: CsParams[K]) => set((o) => void (o.params[k] = v));
  const opts = <V extends string>(values: readonly V[], keys: Record<V, MessageKey>) => values.map((v) => ({ value: v, label: t(keys[v]) }));

  return (
    <Form>
      <div>
        <Section title={t('materialParameters')} />
        <TextField label={t('name')} value={op.name} onChange={(v) => set((o) => void (o.name = v), `name:${op.id}`)} />
        <TextField label={t('code')} value={op.code} maxLength={60} onChange={(v) => set((o) => void (o.code = v), `code:${op.id}`)} />
        <NumField label={t('thickness')} unit="mm" value={p.thickness} max={500} onChange={setP('thickness')} />
        <Section title={t('costGroup')} />
        <NumField label={t('priceOfMaterial')} help={t('helpPriceOfMaterial')} value={p.materialPrice} onChange={setP('materialPrice')} />
        <NumField label={t('estimatedFill')} help={t('helpEstimatedFill')} unit="%" value={p.estimatedFill} min={1} max={100} onChange={setP('estimatedFill')} />
        <NumField label={t('amountOfMaterial')} help={t('helpAmountOfMaterial')} unit="m2" value={cost.materialArea} readOnly />
        <NumField label={t('numberOfSheets')} unit={t('pcs')} value={cost.sheets} readOnly />
        <CheckField label={t('costBySheets')} checked={p.costBySheets} onChange={setP('costBySheets')} />
        <SelectField label={t('roundingSheets')} value={p.roundingSheets} options={opts(ROUNDING_SHEETS, ROUNDING_KEYS)} onChange={setP('roundingSheets')} wide />
        <NumField label={t('costMaterialM2')} help={t('helpCostMaterial')} value={cost.costMaterial} readOnly />
        <SelectField label={t('costOperationBy')} help={t('helpCostOperationBy')} value={p.costOperationBy} options={opts(COST_OPERATION_BY, COST_BY_KEYS)} onChange={setP('costOperationBy')} wide />
        <NumField label={t('priceOfOperationMeter')} help={t('helpPriceOfOperation')} value={p.operationPrice} onChange={setP('operationPrice')} />
        <NumField label={t('costOperation')} help={t('helpCostOperation')} value={cost.costOperation} readOnly />
        <Section title={t('offcutGroup')} />
        <NumField label={t('minOffcutFirstSide')} help={t('helpMinOffcut')} unit="mm" value={p.minOffcutLong} onChange={setP('minOffcutLong')} />
        <NumField label={t('minOffcutSecondSide')} help={t('helpMinOffcut')} unit="mm" value={p.minOffcutShort} onChange={setP('minOffcutShort')} />
        <NumField label={t('businessOffcutArea')} help={t('helpBusinessOffcut')} unit="m2" value={p.businessOffcutArea} onChange={setP('businessOffcutArea')} />
        <CheckField label={t('offcutIncludesTrim')} help={t('helpOffcutTrim')} checked={p.offcutIncludesTrim} onChange={setP('offcutIncludesTrim')} />
        <Section title={t('constraintsGroup')} />
        <NumField label={t('minPartSize')} unit="mm" value={p.minPartSize} onChange={setP('minPartSize')} />
      </div>
      <div>
        {op.type === 'CN' ? (
          <>
            <Section title={t('mainCutMill')} />
            <NumField label={t('millDiameter')} help={t('helpMillDiameter')} unit="mm" value={op.cn.millDiameter} min={0.5} max={50} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.millDiameter = v; })} />
            <NumField label={t('millProtrusion')} unit="mm" value={op.cn.millProtrusion} min={-1000} max={50} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.millProtrusion = v; })} />
            <NumField label={t('partAllowance')} help={t('helpPartAllowance')} unit="mm" value={op.cn.partAllowance} max={50} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.partAllowance = v; })} />
            <SelectField label={t('millMovement')} value={op.cn.movement} wide
              options={MILL_MOVEMENT.map((m) => ({ value: m, label: t(m === 'shortest' ? 'moveShortest' : m === 'rows' ? 'moveRows' : 'moveColumns') }))}
              onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.movement = v; })} />
            <NumField label={t('plungeAngle')} unit="°" value={op.cn.plungeAngle} max={90} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.plungeAngle = v; })} />
            <TextField label={t('toolName')} value={op.cn.millName} maxLength={60} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.millName = v; })} />
            <Section title={t('preCutMill')} />
            <CheckField label={t('usePreCut')} checked={op.cn.preCutUse} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.preCutUse = v; })} />
            <NumField label={t('millDiameter')} unit="mm" value={op.cn.preCutDiameter} min={0.5} max={50} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.preCutDiameter = v; })} />
            <NumField label={t('millProtrusion')} unit="mm" value={op.cn.preCutProtrusion} min={-1000} max={50} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.preCutProtrusion = v; })} />
            <TextField label={t('toolName')} value={op.cn.preCutName} maxLength={60} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.preCutName = v; })} />
            <Section title={t('cuttingParameters')} />
            <NumField label={t('trimByLength')} unit="mm" value={p.trimLength} max={200} onChange={setP('trimLength')} />
            <NumField label={t('trimByWidth')} unit="mm" value={p.trimWidth} max={200} onChange={setP('trimWidth')} />
            <CheckField label={t('fixTexture')} checked={p.fixTexture} onChange={setP('fixTexture')} />
            <CheckField label={t('backSideSkip')} checked={op.cn.backSideSkip} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.backSideSkip = v; })} />
            <NumField label={t('startX')} unit="mm" value={op.cn.startX} min={-1000} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.startX = v; })} />
            <NumField label={t('startY')} unit="mm" value={op.cn.startY} min={-1000} onChange={(v) => set((o) => { if (o.type === 'CN') o.cn.startY = v; })} />
          </>
        ) : (
          <>
            <Section title={t('cuttingParameters')} />
            <NumField label={t('sawThickness')} help={t('helpKerf')} unit="mm" value={p.kerf} max={20} onChange={setP('kerf')} testId="param-kerf" />
            <NumField label={t('trimByLength')} help={t('helpTrim')} unit="mm" value={p.trimLength} max={200} onChange={setP('trimLength')} />
            <NumField label={t('trimByWidth')} help={t('helpTrim')} unit="mm" value={p.trimWidth} max={200} onChange={setP('trimWidth')} />
            <SelectField label={t('initialDirection')} help={t('helpInitialDirection')} value={p.initialDirection} options={opts(INITIAL_DIRECTIONS, DIRECTION_KEYS)} onChange={setP('initialDirection')} wide />
            <CheckField label={t('fixTexture')} help={t('helpFixTexture')} checked={p.fixTexture} onChange={setP('fixTexture')} />
            <CheckField label={t('useComplexBand')} help={t('helpComplexBand')} checked={p.complexBand} onChange={setP('complexBand')} />
            <SelectField label={t('maxRotations')} help={t('helpMaxRotations')} value={p.maxRotations} options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} onChange={setP('maxRotations')} wide />
            <NumField label={t('packageHeight')} help={t('helpPackage')} unit="mm" value={p.packageHeight} max={1000} onChange={setP('packageHeight')} />
            <NumField label={t('repetition')} help={t('helpRepetition')} unit={t('pcs')} value={p.repetition} min={1} max={1000} onChange={setP('repetition')} />
            <SelectField label={t('maxVarieties')} value={p.maxVarieties} options={[{ value: 0, label: t('notLimited') }, ...Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))]} onChange={setP('maxVarieties')} wide />
            <Section title={t('preferencesGroup')} />
            <CheckField label={t('largePacket')} checked={p.largePacket} onChange={setP('largePacket')} />
            <Section title={t('sortingGroup')} />
            <SelectField label={t('sortBands')} help={t('helpSortBands')} value={p.sortBands} options={opts(SORT_BANDS, SORT_KEYS)} onChange={setP('sortBands')} wide />
            <SelectField label={t('sortIntoBands')} help={t('helpSortBands')} value={p.sortIntoBands} options={opts(SORT_BANDS, SORT_KEYS)} onChange={setP('sortIntoBands')} wide />
            <NumField label={t('minBandWidth')} unit="mm" value={p.minBandWidth} onChange={setP('minBandWidth')} />
            <NumField label={t('maxBandWidth')} unit="mm" value={p.maxBandWidth} onChange={setP('maxBandWidth')} />
            <NumField label={t('maxBandLength')} unit="mm" value={p.maxBandLength} onChange={setP('maxBandLength')} />
          </>
        )}
        <p className="mt-3 text-xs text-[#666]">{t('paramsNote')}</p>
      </div>
    </Form>
  );
}
