import type { StaticGeoBundle } from '../types';
import { CHOKEPOINT_FEATURES } from './chokepoints';
import { FINANCE_CENTER_FEATURES } from './finance-centers';
import { NUCLEAR_SITE_FEATURES, SUBMARINE_CABLE_FEATURES } from './strategic-sites';
import { THEATER_PRESETS } from './theaters';
import {
  VIETNAM_ARCHIPELAGO_ZONES,
  VIETNAM_SEA_LABELS,
  VIETNAM_SOVEREIGNTY_FEATURES,
} from './vietnam-sovereignty';
import {
  AI_DATACENTER_FEATURES,
  MILITARY_BASE_FEATURES,
} from './worldmonitor-strategic';

export {
  AI_DATACENTER_FEATURES,
  CHOKEPOINT_FEATURES,
  FINANCE_CENTER_FEATURES,
  MILITARY_BASE_FEATURES,
  NUCLEAR_SITE_FEATURES,
  SUBMARINE_CABLE_FEATURES,
  THEATER_PRESETS,
  VIETNAM_ARCHIPELAGO_ZONES,
  VIETNAM_SEA_LABELS,
  VIETNAM_SOVEREIGNTY_FEATURES,
};

export function buildStaticGeoBundle(): StaticGeoBundle {
  return {
    chokepoints: [...CHOKEPOINT_FEATURES],
    nuclear: [...NUCLEAR_SITE_FEATURES],
    financeCenters: [...FINANCE_CENTER_FEATURES],
    militaryBases: [...MILITARY_BASE_FEATURES],
    aiDatacenters: [...AI_DATACENTER_FEATURES],
    cables: [...SUBMARINE_CABLE_FEATURES],
    vietnamSovereignty: [...VIETNAM_SOVEREIGNTY_FEATURES],
    vietnamZones: [...VIETNAM_ARCHIPELAGO_ZONES],
    vietnamSeaLabels: [...VIETNAM_SEA_LABELS],
  };
}
