import type { StaticGeoBundle } from '../types';
import { CHOKEPOINT_FEATURES } from './chokepoints';
import { FINANCE_CENTER_FEATURES } from './finance-centers';
import { NUCLEAR_SITE_FEATURES, SUBMARINE_CABLE_FEATURES } from './strategic-sites';
import { THEATER_PRESETS } from './theaters';

export {
  CHOKEPOINT_FEATURES,
  FINANCE_CENTER_FEATURES,
  NUCLEAR_SITE_FEATURES,
  SUBMARINE_CABLE_FEATURES,
  THEATER_PRESETS,
};

export function buildStaticGeoBundle(): StaticGeoBundle {
  return {
    chokepoints: [...CHOKEPOINT_FEATURES],
    nuclear: [...NUCLEAR_SITE_FEATURES],
    financeCenters: [...FINANCE_CENTER_FEATURES],
    cables: [...SUBMARINE_CABLE_FEATURES],
  };
}
