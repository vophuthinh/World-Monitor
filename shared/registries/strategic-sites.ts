import type { GeoLineFeature, GeoPointFeature, SeverityLevel } from '../types';

interface RawNuclearSite {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  type: 'plant' | 'enrichment' | 'reprocessing' | 'weapons' | 'test-site' | 'research';
  status: 'active' | 'contested' | 'construction' | 'inactive' | 'decommissioned';
  note: string;
}

const RAW_NUCLEAR_SITES: readonly RawNuclearSite[] = [
  // Strategic / Contested / Proliferation Flashpoints
  { id: 'zaporizhzhia', name: 'Zaporizhzhia Nuclear Power Plant', country: 'UA', lat: 47.51, lon: 34.59, type: 'plant', status: 'contested', note: 'Nhà máy điện hạt nhân lớn nhất Châu Âu — đang bị chiếm đóng & giám sát đặc biệt bởi IAEA' },
  { id: 'chernobyl', name: 'Chernobyl Exclusion Zone', country: 'UA', lat: 51.39, lon: 30.1, type: 'plant', status: 'decommissioned', note: 'Khu vực loại trừ hạt nhân lịch sử dưới sự giám sát của IAEA' },
  { id: 'kursk', name: 'Kursk Nuclear Power Plant', country: 'RU', lat: 51.67, lon: 35.61, type: 'plant', status: 'active', note: 'Tổ hợp điện hạt nhân chiến lược miền Tây nước Nga gần biên giới Ukraine' },
  { id: 'natanz', name: 'Natanz Uranium Enrichment Facility', country: 'IR', lat: 33.73, lon: 51.73, type: 'enrichment', status: 'active', note: 'Cơ sở làm giàu uranium ngầm trọng yếu của Iran' },
  { id: 'fordow', name: 'Fordow Fuel Enrichment Plant', country: 'IR', lat: 34.89, lon: 51.0, type: 'enrichment', status: 'active', note: 'Cơ sở làm giàu uranium xuyên núi sâu tại Qom, Iran' },
  { id: 'bushehr', name: 'Bushehr Nuclear Power Plant', country: 'IR', lat: 28.83, lon: 50.89, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân ven Vịnh Ba Tư của Iran' },
  { id: 'arak', name: 'Arak Heavy Water Reactor Complex', country: 'IR', lat: 34.37, lon: 49.24, type: 'research', status: 'active', note: 'Tổ hợp lò phản ứng nước nặng Arak' },
  { id: 'negev', name: 'Negev Nuclear Research Center (Dimona)', country: 'IL', lat: 31.0, lon: 35.15, type: 'weapons', status: 'active', note: 'Trung tâm nghiên cứu hạt nhân chiến lược tại sa mạc Negev' },
  { id: 'yongbyon', name: 'Yongbyon Nuclear Scientific Research Center', country: 'KP', lat: 39.8, lon: 125.75, type: 'weapons', status: 'active', note: 'Tổ hợp sản xuất plutonium & làm giàu hạt nhân chính của Triều Tiên' },
  { id: 'punggye_ri', name: 'Punggye-ri Nuclear Test Site', country: 'KP', lat: 41.28, lon: 129.09, type: 'test-site', status: 'active', note: 'Bãi thử vũ khí hạt nhân dưới lòng đất của Triều Tiên' },

  // Vietnam & Surrounding East Sea / Southern China Rim
  { id: 'dalat_reactor', name: 'Lò phản ứng Hạt nhân Nghiên cứu Đà Lạt (DLNRR)', country: 'VN', lat: 11.9547, lon: 108.4583, type: 'research', status: 'active', note: 'Viện Nghiên cứu Hạt nhân Đà Lạt — nghiên cứu đồng vị y tế & khoa học dưới thanh sát IAEA' },
  { id: 'fangchenggang', name: 'Fangchenggang Nuclear Power Plant (Phòng Thành Cảng)', country: 'CN', lat: 21.67, lon: 108.56, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân Quảng Tây, cách biên giới Việt Nam ~50 km' },
  { id: 'changjiang', name: 'Changjiang Nuclear Power Plant (Đảo Hải Nam)', country: 'CN', lat: 19.46, lon: 108.9, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân bờ Tây đảo Hải Nam, sát Vịnh Bắc Bộ' },
  { id: 'yangjiang', name: 'Yangjiang Nuclear Power Station (Dương Giang)', country: 'CN', lat: 21.71, lon: 112.26, type: 'plant', status: 'active', note: 'Một trong những nhà máy điện hạt nhân lớn nhất ven Biển Đông (Quảng Đông)' },
  { id: 'taishan', name: 'Taishan Nuclear Power Plant', country: 'CN', lat: 21.92, lon: 112.98, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân EPR công suất lớn tại Quảng Đông' },
  { id: 'daya_bay', name: 'Daya Bay / Ling Ao Nuclear Complex', country: 'CN', lat: 22.6, lon: 114.54, type: 'plant', status: 'active', note: 'Cụm điện hạt nhân cung cấp điện cho Thâm Quyến & Hồng Kông' },
  { id: 'fuqing', name: 'Fuqing Nuclear Power Plant', country: 'CN', lat: 25.45, lon: 119.45, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân Hualong One đối diện Eo biển Đài Loan' },
  { id: 'maanshan', name: 'Maanshan Nuclear Power Plant', country: 'TW', lat: 21.96, lon: 120.75, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân cực Nam Đài Loan gần kênh Bashi' },

  // East Asia & South Asia
  { id: 'fukushima_daiichi', name: 'Fukushima Daiichi Site', country: 'JP', lat: 37.42, lon: 141.03, type: 'plant', status: 'decommissioned', note: 'Đang tháo dỡ & xả nước xử lý ALPS dưới sự giám sát của IAEA' },
  { id: 'kashiwazaki_kariwa', name: 'Kashiwazaki-Kariwa Nuclear Power Plant', country: 'JP', lat: 37.43, lon: 138.6, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân có công suất thiết kế lớn nhất thế giới (7 tổ máy)' },
  { id: 'rokkasho', name: 'Rokkasho Reprocessing Plant', country: 'JP', lat: 40.96, lon: 141.32, type: 'reprocessing', status: 'active', note: 'Trung tâm tái chế nhiên liệu hạt nhân của Nhật Bản' },
  { id: 'kori', name: 'Kori / Saeul Nuclear Complex', country: 'KR', lat: 35.32, lon: 129.29, type: 'plant', status: 'active', note: 'Cụm lò phản ứng hạt nhân trọng điểm Đông Nam Hàn Quốc' },
  { id: 'lanzhou', name: 'Lanzhou Uranium Enrichment Plant', country: 'CN', lat: 36.15, lon: 103.52, type: 'enrichment', status: 'active', note: 'Cơ sở làm giàu uranium lớn tại Cam Túc, Trung Quốc' },
  { id: 'kahuta', name: 'Kahuta Enrichment Facility (KRL)', country: 'PK', lat: 33.59, lon: 73.4, type: 'enrichment', status: 'active', note: 'Trung tâm làm giàu hạt nhân chiến lược của Pakistan' },
  { id: 'khushab', name: 'Khushab Nuclear Complex', country: 'PK', lat: 32.02, lon: 72.22, type: 'weapons', status: 'active', note: 'Tổ hợp lò phản ứng nước nặng của Pakistan' },
  { id: 'kudankulam', name: 'Kudankulam Nuclear Power Plant', country: 'IN', lat: 8.17, lon: 77.71, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân lớn nhất Ấn Độ' },

  // Europe, Russia, MENA & Americas
  { id: 'barakah', name: 'Barakah Nuclear Energy Plant', country: 'AE', lat: 23.97, lon: 52.23, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân thương mại đầu tiên của thế giới Ả Rập (UAE)' },
  { id: 'akkuyu', name: 'Akkuyu Nuclear Power Plant', country: 'TR', lat: 36.14, lon: 33.54, type: 'plant', status: 'construction', note: 'Nhà máy điện hạt nhân đầu tiên của Thổ Nhĩ Kỳ bên bờ Địa Trung Hải' },
  { id: 'mayak', name: 'Mayak Production Association', country: 'RU', lat: 55.7, lon: 60.78, type: 'reprocessing', status: 'active', note: 'Tổ hợp tái chế nhiên liệu & vật liệu hạt nhân tại Chelyabinsk, Nga' },
  { id: 'novaya_zemlya', name: 'Novaya Zemlya Test Range', country: 'RU', lat: 73.37, lon: 54.78, type: 'test-site', status: 'inactive', note: 'Thao trường hạt nhân Bắc Cực của Nga' },
  { id: 'gravelines', name: 'Gravelines Nuclear Power Station', country: 'FR', lat: 51.01, lon: 2.14, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân lớn nhất Tây Âu (6 lò phản ứng)' },
  { id: 'orano_la_hague', name: 'Orano La Hague Reprocessing Site', country: 'FR', lat: 49.68, lon: -1.88, type: 'reprocessing', status: 'active', note: 'Trung tâm tái chế nhiên liệu hạt nhân hàng đầu Châu Âu' },
  { id: 'sellafield', name: 'Sellafield Nuclear Site', country: 'GB', lat: 54.42, lon: -3.49, type: 'reprocessing', status: 'active', note: 'Tổ hợp quản lý & lưu trữ vật liệu hạt nhân lớn nhất Vương quốc Anh' },
  { id: 'los_alamos', name: 'Los Alamos National Laboratory (LANL)', country: 'US', lat: 35.88, lon: -106.32, type: 'weapons', status: 'active', note: 'Phòng thí nghiệm quốc gia nghiên cứu hạt nhân chiến lược Hoa Kỳ' },
  { id: 'pantex', name: 'Pantex Plant', country: 'US', lat: 35.32, lon: -101.55, type: 'weapons', status: 'active', note: 'Cơ sở lắp ráp & bảo dưỡng đầu đạn hạt nhân chính của Hoa Kỳ' },
  { id: 'palo_verde', name: 'Palo Verde Generating Station', country: 'US', lat: 33.39, lon: -112.86, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân sản lượng lớn nhất Hoa Kỳ (Arizona)' },
  { id: 'vogtle', name: 'Vogtle Electric Generating Plant', country: 'US', lat: 33.14, lon: -81.76, type: 'plant', status: 'active', note: 'Cụm 4 lò phản ứng bao gồm các tổ máy AP1000 mới nhất của Mỹ' },
  { id: 'koeberg', name: 'Koeberg Nuclear Power Station', country: 'ZA', lat: -33.68, lon: 18.43, type: 'plant', status: 'active', note: 'Nhà máy điện hạt nhân thương mại duy nhất tại Châu Phi' },
];

function severityForNuclear(site: RawNuclearSite): SeverityLevel {
  if (site.status === 'contested') return 'critical';
  if (site.type === 'weapons' || site.type === 'enrichment' || site.type === 'test-site') return 'high';
  if (site.country === 'VN' || (site.country === 'CN' && site.lat < 23)) return 'medium';
  return 'info';
}

export const NUCLEAR_SITE_FEATURES: readonly GeoPointFeature[] = RAW_NUCLEAR_SITES.map((s) => ({
  id: `nuclear:${s.id}`,
  layer: 'nuclear',
  title: s.name,
  subtitle: `${s.country} · ${s.type.toUpperCase()} (${s.status}) — ${s.note}`,
  category: s.type,
  severity: severityForNuclear(s),
  lat: s.lat,
  lon: s.lon,
  timestamp: 0,
  source: 'Global Nuclear Facility Registry (IAEA / Open Reference)',
  meta: {
    country: s.country,
    facilityType: s.type,
    status: s.status,
    note: s.note,
  },
}));

export const SUBMARINE_CABLE_FEATURES: readonly GeoLineFeature[] = [
  // === VIETNAM-CONNECTED STRATEGIC SUBMARINE CABLES ===
  {
    id: 'cable:apg',
    layer: 'cables',
    name: 'Asia Pacific Gateway (APG)',
    category: 'vietnam_backbone',
    severity: 'high',
    vietnamConnected: true,
    rfsYear: 2016,
    owners: ['VNPT', 'Viettel', 'NTT', 'China Telecom', 'KT', 'Singtel', 'Meta'],
    coordinates: [
      [
        [103.99, 1.39],   // Singapore
        [103.39, 4.13],   // Cherating, MY
        [100.6, 7.2],     // Songkhla, TH
        [106.5, 9.0],     // Con Son / South Vietnam shelf
        [108.21, 16.05],  // Da Nang, Vietnam
        [113.5, 19.5],    // Northern Biển Đông
        [114.26, 22.32],  // Hong Kong
        [121.8, 24.86],   // Toucheng, Taiwan
        [129.0, 35.17],   // Busan, South Korea
        [136.87, 34.34],  // Shima, Japan
        [139.98, 35.01],  // Maruyama, Japan
      ],
    ],
    landingPoints: [
      { city: 'Đà Nẵng', country: 'VN', lat: 16.05, lon: 108.21 },
      { city: 'Singapore', country: 'SG', lat: 1.39, lon: 103.99 },
      { city: 'Hong Kong', country: 'HK', lat: 22.32, lon: 114.26 },
      { city: 'Toucheng', country: 'TW', lat: 24.86, lon: 121.8 },
      { city: 'Busan', country: 'KR', lat: 35.17, lon: 129.0 },
      { city: 'Maruyama', country: 'JP', lat: 35.01, lon: 139.98 },
    ],
    source: 'Submarine Cable Registry (VN & Global Backbone)',
  },
  {
    id: 'cable:aag',
    layer: 'cables',
    name: 'Asia-America Gateway (AAG)',
    category: 'vietnam_backbone',
    severity: 'high',
    vietnamConnected: true,
    rfsYear: 2009,
    owners: ['VNPT', 'Viettel', 'SPT', 'AT&T', 'Singtel', 'PLDT', 'Telstra'],
    // Split at antimeridian (180 / -180) so 2D Mercator never draws wrap-around artifacts
    coordinates: [
      [
        [103.99, 1.39],   // Singapore
        [103.85, 2.3],    // Mersing, MY
        [107.08, 10.34],  // Vũng Tàu, Vietnam
        [113.95, 22.27],  // Hong Kong
        [120.39, 16.58],  // La Union, Philippines
        [144.81, 13.54],  // Guam
        [179.9, 18.2],    // Pacific West of Dateline
      ],
      [
        [-179.9, 18.2],   // Pacific East of Dateline
        [-158.24, 21.55], // Oahu, Hawaii
        [-120.85, 35.37], // Morro Bay, California
      ],
    ],
    landingPoints: [
      { city: 'Vũng Tàu', country: 'VN', lat: 10.34, lon: 107.08 },
      { city: 'Singapore', country: 'SG', lat: 1.39, lon: 103.99 },
      { city: 'Hong Kong', country: 'HK', lat: 22.27, lon: 113.95 },
      { city: 'La Union', country: 'PH', lat: 16.58, lon: 120.39 },
      { city: 'Guam', country: 'US', lat: 13.54, lon: 144.81 },
      { city: 'Morro Bay, CA', country: 'US', lat: 35.37, lon: -120.85 },
    ],
    source: 'Submarine Cable Registry (VN & Global Backbone)',
  },
  {
    id: 'cable:aae_1',
    layer: 'cables',
    name: 'Asia Africa Europe-1 (AAE-1)',
    category: 'vietnam_backbone',
    severity: 'high',
    vietnamConnected: true,
    rfsYear: 2017,
    owners: ['Viettel', 'VNPT', 'PCCW', 'China Unicom', 'Reliance Jio', 'Telecom Egypt', 'Ooredoo'],
    coordinates: [
      [
        [114.26, 22.21],  // Hong Kong
        [111.5, 15.8],    // Biển Đông
        [107.08, 10.34],  // Vũng Tàu, Vietnam
        [103.51, 10.63],  // Sihanoukville, Cambodia
        [100.6, 7.2],     // Songkhla, Thailand
        [100.41, 5.37],   // Penang, Malaysia
        [94.39, 16.86],   // Myanmar
        [80.5, 6.0],      // South of Sri Lanka
        [72.88, 19.08],   // Mumbai, India
        [58.61, 23.58],   // Muscat, Oman
        [45.03, 12.8],    // Aden / Bab el-Mandeb
        [43.15, 11.59],   // Djibouti
        [38.5, 21.2],     // Red Sea
        [32.65, 29.12],   // Zafarana / Suez, Egypt
        [29.7, 31.07],    // Alexandria, Egypt
        [24.01, 35.51],   // Chania, Greece
        [16.87, 41.13],   // Bari, Italy
        [5.37, 43.29],    // Marseille, France
      ],
    ],
    landingPoints: [
      { city: 'Vũng Tàu', country: 'VN', lat: 10.34, lon: 107.08 },
      { city: 'Hong Kong', country: 'HK', lat: 22.21, lon: 114.26 },
      { city: 'Mumbai', country: 'IN', lat: 19.08, lon: 72.88 },
      { city: 'Djibouti', country: 'DJ', lat: 11.59, lon: 43.15 },
      { city: 'Suez / Alexandria', country: 'EG', lat: 31.07, lon: 29.7 },
      { city: 'Marseille', country: 'FR', lat: 43.29, lon: 5.37 },
    ],
    source: 'Submarine Cable Registry (VN & Global Backbone)',
  },
  {
    id: 'cable:sjc2_adc',
    layer: 'cables',
    name: 'ADC / SJC2 Intra-Asia High-Capacity',
    category: 'vietnam_backbone',
    severity: 'high',
    vietnamConnected: true,
    rfsYear: 2024,
    owners: ['Viettel', 'VNPT', 'Singtel', 'SoftBank', 'KDDI', 'China Telecom', 'Meta'],
    coordinates: [
      [
        [103.65, 1.34],   // Tuas, Singapore
        [107.08, 10.34],  // Vũng Tàu, Vietnam
        [109.22, 13.77],  // Quy Nhơn, Bình Định, Vietnam
        [114.2, 22.22],   // Hong Kong
        [120.65, 22.25],  // Fangshan, Taiwan
        [139.95, 34.98],  // Chikura, Japan
      ],
    ],
    landingPoints: [
      { city: 'Quy Nhơn', country: 'VN', lat: 13.77, lon: 109.22 },
      { city: 'Vũng Tàu', country: 'VN', lat: 10.34, lon: 107.08 },
      { city: 'Singapore', country: 'SG', lat: 1.34, lon: 103.65 },
      { city: 'Hong Kong', country: 'HK', lat: 22.22, lon: 114.2 },
      { city: 'Chikura', country: 'JP', lat: 34.98, lon: 139.95 },
    ],
    source: 'Submarine Cable Registry (VN & Global Backbone)',
  },

  // === GLOBAL STRATEGIC SUBMARINE CABLES ===
  {
    id: 'cable:seamewe_6',
    layer: 'cables',
    name: 'SeaMeWe-6 (Asia-MENA-Europe)',
    category: 'global_backbone',
    severity: 'info',
    vietnamConnected: false,
    rfsYear: 2026,
    owners: ['Singtel', 'Microsoft', 'Orange', 'Bharti Airtel', 'Telecom Egypt', 'Djibouti Telecom'],
    coordinates: [
      [
        [103.65, 1.34],   // Singapore
        [101.44, 2.75],   // Morib, MY
        [80.24, 13.06],   // Chennai, IN
        [72.88, 19.08],   // Mumbai, IN
        [58.41, 23.58],   // Muscat, OM
        [43.15, 11.59],   // Djibouti
        [32.28, 31.26],   // Port Said, EG
        [5.37, 43.29],    // Marseille, FR
      ],
    ],
    landingPoints: [
      { city: 'Singapore', country: 'SG', lat: 1.34, lon: 103.65 },
      { city: 'Mumbai', country: 'IN', lat: 19.08, lon: 72.88 },
      { city: 'Djibouti', country: 'DJ', lat: 11.59, lon: 43.15 },
      { city: 'Port Said', country: 'EG', lat: 31.26, lon: 32.28 },
      { city: 'Marseille', country: 'FR', lat: 43.29, lon: 5.37 },
    ],
    source: 'Submarine Cable Registry (koala73 / TeleGeography Ref)',
  },
  {
    id: 'cable:peace',
    layer: 'cables',
    name: 'PEACE Cable',
    category: 'global_backbone',
    severity: 'info',
    vietnamConnected: false,
    rfsYear: 2022,
    owners: ['PEACE Cable International'],
    coordinates: [
      [
        [103.65, 1.34],   // Singapore
        [67.03, 24.89],   // Karachi, PK
        [45.01, 10.44],   // Berbera / Red Sea Mouth
        [32.65, 29.12],   // Egypt Red Sea
        [32.47, 34.77],   // Cyprus
        [14.35, 35.95],   // Malta
        [5.37, 43.29],    // Marseille, FR
      ],
    ],
    landingPoints: [
      { city: 'Singapore', country: 'SG', lat: 1.34, lon: 103.65 },
      { city: 'Karachi', country: 'PK', lat: 24.89, lon: 67.03 },
      { city: 'Marseille', country: 'FR', lat: 43.29, lon: 5.37 },
    ],
    source: 'Submarine Cable Registry (koala73 / TeleGeography Ref)',
  },
  {
    id: 'cable:2africa',
    layer: 'cables',
    name: '2Africa Circum-African System',
    category: 'global_backbone',
    severity: 'info',
    vietnamConnected: false,
    rfsYear: 2024,
    owners: ['Meta', 'China Mobile', 'Orange', 'Vodafone', 'Telecom Egypt', 'Bayobab'],
    coordinates: [
      [
        [-4.54, 50.83],   // Bude, UK
        [-9.33, 38.69],   // Lisbon, PT
        [-17.45, 14.69],  // Dakar, SN
        [-4.03, 5.32],    // Abidjan, CI
        [3.42, 6.44],     // Lagos, NG
        [13.23, -8.81],   // Luanda, AO
        [18.45, -33.69],  // Cape Town, ZA
        [32.58, -25.97],  // Maputo, MZ
        [39.67, -4.05],   // Mombasa, KE
        [43.15, 11.59],   // Djibouti
        [32.53, 29.97],   // Suez, EG
        [8.94, 44.41],    // Genoa, IT
        [2.17, 41.39],    // Barcelona, ES
      ],
    ],
    landingPoints: [
      { city: 'Bude', country: 'GB', lat: 50.83, lon: -4.54 },
      { city: 'Lagos', country: 'NG', lat: 6.44, lon: 3.42 },
      { city: 'Cape Town', country: 'ZA', lat: -33.69, lon: 18.45 },
      { city: 'Djibouti', country: 'DJ', lat: 11.59, lon: 43.15 },
      { city: 'Genoa', country: 'IT', lat: 44.41, lon: 8.94 },
    ],
    source: 'Submarine Cable Registry (koala73 / TeleGeography Ref)',
  },
  {
    id: 'cable:marea',
    layer: 'cables',
    name: 'MAREA Trans-Atlantic',
    category: 'global_backbone',
    severity: 'info',
    vietnamConnected: false,
    rfsYear: 2018,
    owners: ['Meta', 'Microsoft', 'Telxius'],
    coordinates: [
      [
        [-76.06, 36.76],  // Virginia Beach, US
        [-60.0, 38.2],
        [-40.0, 41.5],
        [-20.0, 44.8],
        [-2.95, 43.27],   // Bilbao, Spain
      ],
    ],
    landingPoints: [
      { city: 'Virginia Beach', country: 'US', lat: 36.76, lon: -76.06 },
      { city: 'Bilbao', country: 'ES', lat: 43.27, lon: -2.95 },
    ],
    source: 'Submarine Cable Registry (koala73 / TeleGeography Ref)',
  },
  {
    id: 'cable:grace_hopper',
    layer: 'cables',
    name: 'Grace Hopper Trans-Atlantic',
    category: 'global_backbone',
    severity: 'info',
    vietnamConnected: false,
    rfsYear: 2022,
    owners: ['Google'],
    coordinates: [
      [
        [-72.94, 40.76],  // Bellport, NY
        [-52.0, 44.0],
        [-26.0, 48.5],
        [-4.54, 50.83],   // Bude, UK
      ],
      [
        [-26.0, 48.5],
        [-12.0, 46.0],
        [-2.95, 43.27],   // Bilbao, ES
      ],
    ],
    landingPoints: [
      { city: 'Bellport, NY', country: 'US', lat: 40.76, lon: -72.94 },
      { city: 'Bude', country: 'GB', lat: 50.83, lon: -4.54 },
      { city: 'Bilbao', country: 'ES', lat: 43.27, lon: -2.95 },
    ],
    source: 'Submarine Cable Registry (koala73 / TeleGeography Ref)',
  },
  {
    id: 'cable:faster',
    layer: 'cables',
    name: 'FASTER Trans-Pacific',
    category: 'global_backbone',
    severity: 'info',
    vietnamConnected: false,
    rfsYear: 2016,
    owners: ['Google', 'KDDI', 'Singtel', 'China Mobile', 'China Telecom', 'TIME dotCom'],
    coordinates: [
      [
        [121.46, 25.18],  // Tanshui, Taiwan
        [136.87, 34.34],  // Shima, Japan
        [139.95, 34.98],  // Chikura, Japan
        [162.0, 40.5],
        [179.9, 43.0],
      ],
      [
        [-179.9, 43.0],
        [-152.0, 44.2],
        [-124.41, 43.12], // Bandon, Oregon, US
      ],
    ],
    landingPoints: [
      { city: 'Tanshui', country: 'TW', lat: 25.18, lon: 121.46 },
      { city: 'Chikura', country: 'JP', lat: 34.98, lon: 139.95 },
      { city: 'Bandon, OR', country: 'US', lat: 43.12, lon: -124.41 },
    ],
    source: 'Submarine Cable Registry (koala73 / TeleGeography Ref)',
  },
  {
    id: 'cable:jupiter',
    layer: 'cables',
    name: 'JUPITER Trans-Pacific',
    category: 'global_backbone',
    severity: 'info',
    vietnamConnected: false,
    rfsYear: 2020,
    owners: ['AWS', 'Meta', 'SoftBank', 'NTT', 'PLDT', 'PCCW'],
    coordinates: [
      [
        [122.95, 14.12],  // Daet, Philippines
        [136.87, 34.34],  // Shima, Japan
        [139.98, 35.01],  // Maruyama, Japan
        [165.0, 39.0],
        [179.9, 40.0],
      ],
      [
        [-179.9, 40.0],
        [-148.0, 38.5],
        [-118.4, 33.86],  // Hermosa Beach, LA, US
      ],
    ],
    landingPoints: [
      { city: 'Daet', country: 'PH', lat: 14.12, lon: 122.95 },
      { city: 'Maruyama', country: 'JP', lat: 35.01, lon: 139.98 },
      { city: 'Hermosa Beach, CA', country: 'US', lat: 33.86, lon: -118.4 },
    ],
    source: 'Submarine Cable Registry (koala73 / TeleGeography Ref)',
  },
  {
    id: 'cable:curie',
    layer: 'cables',
    name: 'Curie Americas Pacific',
    category: 'global_backbone',
    severity: 'info',
    vietnamConnected: false,
    rfsYear: 2020,
    owners: ['Google'],
    coordinates: [
      [
        [-118.42, 33.92], // El Segundo, CA
        [-98.0, 14.0],
        [-79.57, 8.95],   // Balboa, Panama
        [-84.0, -6.0],
        [-71.62, -33.05], // Valparaíso, Chile
      ],
    ],
    landingPoints: [
      { city: 'El Segundo, CA', country: 'US', lat: 33.92, lon: -118.42 },
      { city: 'Balboa', country: 'PA', lat: 8.95, lon: -79.57 },
      { city: 'Valparaíso', country: 'CL', lat: -33.05, lon: -71.62 },
    ],
    source: 'Submarine Cable Registry (koala73 / TeleGeography Ref)',
  },
];
