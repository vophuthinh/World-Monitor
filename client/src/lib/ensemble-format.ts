import type { VietnamEnvEnsemble } from '@shared/types';

export type EnsembleAgreement = 'high' | 'medium' | 'low';

/**
 * Plain-language summary of a multi-model forecast. Agreement is graded from the spread of the daily maximum
 * temperature and from how much the models differ on rain (whether it rains and how much), because that
 * disagreement is the real uncertainty.
 */
export function describeEnsemble(e: VietnamEnvEnsemble): {
  summary: string;
  agreement: EnsembleAgreement;
  tooltip: string;
} {
  const tempSpread = e.tempMaxMaxC - e.tempMaxMinC;
  const rainSpread = e.rainMaxMm - e.rainMinMm;
  const rainSplit = e.wetModels > 0 && e.wetModels < e.models;
  const agreement: EnsembleAgreement =
    tempSpread >= 4 || rainSpread >= 20 || (rainSplit && rainSpread >= 10)
      ? 'low'
      : tempSpread >= 2.5 || rainSpread >= 8 || (rainSplit && rainSpread >= 4)
        ? 'medium'
        : 'high';

  const summary =
    `24h · ${e.models} mô hình: Tmax ${e.tempMaxMeanC.toFixed(1)}° (${e.tempMaxMinC.toFixed(1)}–${e.tempMaxMaxC.toFixed(1)}) · ` +
    `Mưa TB ${e.rainMeanMm.toFixed(1)}mm (${e.rainMinMm.toFixed(1)}–${e.rainMaxMm.toFixed(1)}) · ${e.wetModels}/${e.models} có mưa`;
  const tooltip = e.perModel
    .map((m) => `${m.model}: Tmax ${m.tempMaxC.toFixed(1)}°, Tmin ${m.tempMinC.toFixed(1)}°, mưa ${m.rainMm.toFixed(1)}mm`)
    .join('\n');
  return { summary, agreement, tooltip };
}
