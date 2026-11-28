import type {
  StrategyTemplate,
  TemplateStyle,
} from '@/content/strategy-templates';
import type { AssetClass } from '@/domain/types';
import { ASSET_LABEL } from './strategy-style';

export interface TemplateFilter {
  /** Any of these asset classes; none picked means every template. */
  assets: readonly AssetClass[];
  /** Any of these styles; none picked means every template. */
  styles: readonly TemplateStyle[];
  /** Matched against a template's name and its asset classes, ignoring case. */
  query: string;
}

export const NO_FILTER: TemplateFilter = { assets: [], styles: [], query: '' };

/** The templates that pass every filter that is set (the three narrow together). */
export function filterTemplates(
  list: readonly StrategyTemplate[],
  f: TemplateFilter,
): StrategyTemplate[] {
  const q = f.query.trim().toLowerCase();
  return list.filter(
    (t) =>
      (f.assets.length === 0 ||
        t.assetClasses.some((a) => f.assets.includes(a))) &&
      (f.styles.length === 0 || t.styles.some((s) => f.styles.includes(s))) &&
      (q === '' ||
        t.name.toLowerCase().includes(q) ||
        t.assetClasses.some((a) => ASSET_LABEL[a].toLowerCase().includes(q))),
  );
}
