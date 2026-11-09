import type { ClParams, CsParams, InputMode, LengthRounding } from '@/domain/project';
import type { MessageKey } from '@/lib/i18n';

export const INPUT_MODE_KEYS: Record<InputMode, MessageKey> = {
  none: 'inputModeNone', workpiece: 'inputModeWorkpiece', detail: 'inputModeDetail', afterPremilling: 'inputModeAfterPremilling',
};
export const ROUNDING_KEYS: Record<CsParams['roundingSheets'], MessageKey> = {
  whole: 'roundWhole', any2: 'roundAny2', any3: 'roundAny3', any4: 'roundAny4',
  width2: 'roundWidth2', width3: 'roundWidth3', width4: 'roundWidth4', length2: 'roundLength2', length3: 'roundLength3', length4: 'roundLength4',
};
export const COST_BY_KEYS: Record<CsParams['costOperationBy'], MessageKey> = { cutLength: 'byCutLength', partsPerimeter: 'byPartsPerimeter', partsArea: 'byPartsArea', materialArea: 'byMaterialArea' };
export const CL_COST_BY_KEYS: Record<ClParams['costOperationBy'], MessageKey> = { cutWithTrim: 'byCutWithTrim', cutWithoutTrim: 'byCutWithoutTrim', partsLength: 'byPartsLength', materialLength: 'byMaterialLength' };
export const DIRECTION_KEYS: Record<CsParams['initialDirection'], MessageKey> = { any: 'dirAny', length: 'dirLength', width: 'dirWidth', lengthPreferred: 'dirLengthPreferred', widthPreferred: 'dirWidthPreferred' };
export const SORT_KEYS: Record<CsParams['sortBands'], MessageKey> = { descending: 'sortDescending', ascending: 'sortAscending', center: 'sortCenter', none: 'sortNone' };
export const LENGTH_ROUNDING_KEYS: Record<LengthRounding, MessageKey> = { nearest2: 'roundNearest2', nearest1: 'roundNearest1', nearest0: 'roundNearest0', up1: 'roundUp1', up0: 'roundUp0' };
