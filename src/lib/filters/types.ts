// Pure type definitions for the filter framework.
// No runtime imports — safe to use anywhere.

export type DimKind = 'multi' | 'range' | 'tristate' | 'single';

export interface MultiOption {
  slug: string;
  label: string;
  flag?: string;
  count: number;
}

export interface FilterDimension {
  key: string;
  label: string;
  kind: DimKind;
  // For 'multi' and 'single' kinds
  options?: MultiOption[];
  // For 'range' kinds
  unit?: string;
  format?: (n: number) => string;
  // When true and kind is 'range', rows whose attr is 0 / missing are excluded
  // by an active filter. When false, missing-data rows pass any range.
  excludeMissing?: boolean;
  // The data-* attribute on rows that holds this dimension's value.
  rowAttr: string;
}

export type RangeValue = { min: number | null; max: number | null };
export type TristateValue = 'any' | 'yes' | 'no';

// State for a single dimension.
export type DimState =
  | { kind: 'multi'; values: Set<string> }
  | { kind: 'range'; value: RangeValue }
  | { kind: 'tristate'; value: TristateValue }
  | { kind: 'single'; value: string | null };

// Total filter state for a page = map of dimension key → DimState.
export type FilterState = Record<string, DimState>;

export interface FilterChangeDetail {
  state: FilterState;
  dirtyKeys: string[];
}
