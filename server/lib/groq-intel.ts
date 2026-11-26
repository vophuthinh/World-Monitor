import { computeGlobalThreatLevel, computeTheaterPostures, selectTopHotPolymarket } from '@shared/intelligence';
import { evaluateInvestmentCompass, evaluateMacroHealth } from '@shared/macro-health';
import { resolveFreshVessels } from '@shared/maritime-freshness';
import type {
  AiAskResponse,
  AiSitrepBullet,
  AiSitrepSnapshot,
  GeoPointFeature,
  GoogleTrendsSnapshot,
  HptCompanyIntelSnapshot,
  MacroCountryIndicator,
  MarketSnapshot,
  NewsItem,
  PolicyLegalSnapshot,
  PredictionItem,
  TechCyberSnapshot,
  VietnamEnvSnapshot,
} from '@shared/types';
import type { SnapshotStore } from '../cache/snapshot-store';
import { setBounded } from './bounded-map';
import { getRetainedMarketSnapshot } from '../collectors/markets-crypto';

export const GROQ_MODEL_CHAIN = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const;

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCallResult {
  text: string;
  provider: 'groq-lpu' | 'gemini';
  model: string;
  latencyMs: number;
}

function cleanModelOutput(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

export async function callGroqChatCompletion(
  messages: ChatMessage[],
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    apiKey?: string;
  } = {},
): Promise<LlmCallResult | null> {
  const groqKey = (options.apiKey ?? process.env.GROQ_API_KEY ?? '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  const maxTokens = options.maxTokens ?? 550;
  const temperature = options.temperature ?? 0.2;
  const timeoutMs = options.timeoutMs ?? 8_500;

  if (groqKey) {
    for (const model of GROQ_MODEL_CHAIN) {
      const t0 = Date.now();
      try {
        const isGptOss = model.startsWith('openai/gpt-oss-');
        const body: Record<string, unknown> = {
          model,
          temperature,
          max_completion_tokens: isGptOss ? Math.max(maxTokens, 850) : maxTokens,
          messages,
        };
        if (isGptOss) {
          body.reasoning_effort = 'low';
        }

        const resp = await fetch(GROQ_CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!resp.ok) {
          continue;
        }

        const json = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = cleanModelOutput(json.choices?.[0]?.message?.content ?? '');
        if (content.length >= 16) {
          return {
            text: content,
            provider: 'groq-lpu',
            model,
            latencyMs: Math.max(1, Date.now() - t0),
          };
        }
      } catch {
        // Fail over to next Groq model in chain
      }
    }
  }

  if (geminiKey) {
    const t0 = Date.now();
    try {
      const prompt = messages.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (resp.ok) {
        const json = (await resp.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const content = cleanModelOutput(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
        if (content.length >= 16) {
          return {
            text: content,
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            latencyMs: Math.max(1, Date.now() - t0),
          };
        }
      }
    } catch {
      // Fall through to null
    }
  }

  return null;
}

export function buildMonitorLiveContext(store: SnapshotStore, now = Date.now(), liveVessels?: readonly GeoPointFeature[]): string {
  const military = store.get<GeoPointFeature[]>('military-flights', now) ?? [];
  const vessels = resolveFreshVessels(store.get<GeoPointFeature[]>('maritime-vessels', now) ?? [], now, liveVessels);
  const cyber = store.get<GeoPointFeature[]>('cyber-threats', now) ?? [];
  const gpsOutages = store.get<GeoPointFeature[]>('gps-outages', now) ?? [];
  const earthquakes = store.get<GeoPointFeature[]>('earthquakes', now) ?? [];
  const geopolitics = store.get<GeoPointFeature[]>('geopolitics-gdelt', now) ?? [];
  const markets = getRetainedMarketSnapshot(store, now);
  const predictions = store.get<PredictionItem[]>('polymarket', now) ?? [];
  const trends = store.get<GoogleTrendsSnapshot>('google-trends', now);
  const policy = store.get<PolicyLegalSnapshot>('policy-legal', now);
  const techCyber = store.get<TechCyberSnapshot>('tech-cyber', now);
  const news = store.get<NewsItem[]>('rss-news', now) ?? [];
  const vnEnv = store.get<VietnamEnvSnapshot>('vietnam-env', now);
  const hptIntel = store.get<HptCompanyIntelSnapshot>('hpt-intel', now);

  const postures = computeTheaterPostures({
    military,
    vessels,
    geopolitics,
    cyberThreats: cyber,
  });
  const globalThreat = computeGlobalThreatLevel({
    theaterPostures: postures,
    cyberCount: cyber.length,
    earthquakeMajorCount: earthquakes.filter((e) => (e.magnitude ?? 0) >= 5.0).length,
    geopoliticsCriticalCount: geopolitics.filter((g) => g.severity === 'critical').length,
  });

  const lines: string[] = [];
  lines.push(
    `[AN NINH & TÁC CHIẾN] DEFCON ${globalThreat.defcon} (${globalThreat.score}/100). Máy bay QS: ${military.length}, Tàu AIS: ${vessels.length}, C2/APT IOC: ${cyber.length}, Động đất USGS: ${earthquakes.length}, Điểm nhiễu GPS/BGP: ${gpsOutages.length}.`,
  );
  lines.push(
    `Trạng thái 6 chiến trường: ${postures
      .map((p) => `${p.name}=${p.posture}(Air:${p.airCount},Sea:${p.seaCount},Geo:${p.conflictCount})`)
      .join('; ')}.`,
  );

  if (gpsOutages.length > 0) {
    lines.push(
      `[NHIỄU GPS & BGP] ${gpsOutages
        .slice(0, 4)
        .map((g) => `${g.title} (${g.subtitle ?? g.severity})`)
        .join(' | ')}`,
    );
  }

  if (markets) {
    const qSummary = markets.quotes
      .slice(0, 8)
      .map(
        (q) =>
          `${q.symbol}: ${q.price}${q.unit ? ` ${q.unit}` : ''} (${q.changePercent24h == null ? 'biến động không rõ' : `${q.changePercent24h >= 0 ? '+' : ''}${q.changePercent24h}%`})`,
      )
      .join(', ');
    lines.push(`[THỊ TRƯỜNG & TỶ GIÁ] ${qSummary}`);

    if (markets.vnGold && markets.vnGold.length > 0) {
      const goldSummary = markets.vnGold
        .slice(0, 3)
        .map(
          (g) =>
            `${g.name} (${g.code}): Mua ${g.buyPerLuongMillionVnd.toFixed(2)} - Bán ${g.sellPerLuongMillionVnd.toFixed(2)} tr/lượng${g.retained ? ' [dữ liệu cũ hoặc chưa rõ]' : ''}${
              g.premiumVsWorldMillionVnd !== undefined
                ? ` (Chênh thế giới +${g.premiumVsWorldMillionVnd.toFixed(1)} tr${g.retained || g.worldParityRetained !== false ? ', tham chiếu cũ hoặc chưa rõ' : ''})`
                : ''
            }`,
        )
        .join('; ');
      lines.push(`[VÀNG TRONG NƯỚC] ${goldSummary}`);
    }

    if (markets.vn30 && markets.vn30.length > 0) {
      const vn30Summary = markets.vn30
        .slice(0, 8)
        .map(
          (s) =>
            `${s.symbol} ${(s.closeThousandVnd ?? s.priceThousandVnd).toFixed(2)}k (${s.changePercent == null ? 'biến động không rõ' : `${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`})`,
        )
        .join(', ');
      lines.push(`[CỔ PHIẾU VN30] ${vn30Summary}`);
    }

    if (markets.fred && markets.fred.length > 0) {
      const fredSummary = markets.fred
        .map(
          (f) =>
            `${f.label}: ${f.value}${f.unit === '%' ? '%' : ` ${f.unit}`} (${f.change >= 0 ? '+' : ''}${f.change})`,
        )
        .join(', ');
      lines.push(`[LÃI SUẤT FED & VĨ MÔ MỸ FRED] ${fredSummary}`);
    }

    const wbMacro = store.get<MacroCountryIndicator[]>('macro-worldbank', now) ?? markets.macro ?? [];
    const health = evaluateMacroHealth({ ...markets, macro: wbMacro }, predictions, now);
    if (health.vn || health.us) {
      const parts = [
        health.vn
          ? `Việt Nam: ${health.vn.compositeScore}/100 (${health.vn.regimeLabel}${health.vn.quadrantLabel ? ` · ${health.vn.quadrantLabel}` : ''})`
          : '',
        health.us
          ? `Mỹ/Toàn cầu: ${health.us.compositeScore}/100 (${health.us.regimeLabel}${health.us.quadrantLabel ? ` · ${health.us.quadrantLabel}` : ''}${
              health.us.recessionProb12m !== undefined ? ` · XS Suy thoái NY Fed ${health.us.recessionProb12m}%` : ''
            })`
          : '',
      ].filter(Boolean);
      lines.push(`[CHẨN ĐOÁN SỨC KHỎE VĨ MÔ] ${parts.join(' | ')}`);
    }

    const compass = evaluateInvestmentCompass({ ...markets, macro: wbMacro }, predictions, now);
    if (compass) {
      const netLiqPart =
        compass.netLiquidityBillions !== undefined
          ? ` | Fed Net Liquidity: $${(compass.netLiquidityBillions / 1000).toFixed(2)}T${compass.netLiquidityDelta4wBillions !== undefined ? ` (${compass.netLiquidityDelta4wBillions >= 0 ? '+' : ''}${compass.netLiquidityDelta4wBillions}B$ 4T)` : ' (biến động 4T không rõ)'}`
          : '';
      const pePart =
        compass.vnIndexPe !== undefined
          ? ` | VN-Index P/E ${compass.vnIndexPe.toFixed(2)}x${compass.vnErpPct !== undefined ? ` (ERP ${compass.vnErpPct >= 0 ? '+' : ''}${compass.vnErpPct}%)` : ' (ERP không rõ)'}`
          : '';
      const allocPart =
        compass.allocations.length > 0
          ? ` | Phân bổ: ${compass.allocations.map((a) => `${a.label} ${a.weightPct}%`).join(', ')}`
          : '';
      const dualPart = compass.dualConfirmationLabel ? ` | ${compass.dualConfirmationLabel}` : '';
      lines.push(
        `[LA BÀN ĐẦU TƯ & CHỈ BÁO] ${compass.stanceLabel} (${compass.riskAppetiteScore}/100)${netLiqPart}${pePart}${dualPart}${allocPart}. Ưu tiên: ${compass.favoredAssets.join('; ')}`,
      );
    }

    if (markets.crypto.length > 0) {
      const topCoins = markets.crypto
        .slice(0, 4)
        .map((c) => `${c.symbol} $${c.priceUsd} (${c.changePercent24h === null ? 'biến động không rõ' : `${c.changePercent24h >= 0 ? '+' : ''}${c.changePercent24h}%`})`)
        .join(', ');
      lines.push(
        `[CRYPTO] ${topCoins}${markets.fearGreed ? ` | Fear&Greed: ${markets.fearGreed.value}/100 (${markets.fearGreed.classification})` : ''}`,
      );
    }
  }

  if (vnEnv && vnEnv.locations.length > 0) {
    lines.push(
      `[KHÍ TƯỢNG BIỂN ĐÔNG & AQI VN] ${vnEnv.locations
        .map(
          (l) =>
            `${l.name}: ${l.tempC}°C, gió ${l.windKmh}km/h (giật ${l.windGustKmh}km/h, cấp ${l.beaufortScale})${
              l.usAqi !== undefined ? `, AQI=${l.usAqi} (PM2.5=${l.pm25})` : ''
            }`,
        )
        .join(' | ')}`,
    );
  }

  const hotPoly = selectTopHotPolymarket(predictions, 5);
  if (hotPoly.length > 0) {
    lines.push(
      `[POLYMARKET TOP HOT] ${hotPoly
        .map((p) => `${p.titleVi || p.title}: ${p.yesPercent}%`)
        .join(' | ')}`,
    );
  }

  if (trends && (trends.vn.length > 0 || trends.global.length > 0)) {
    lines.push(
      `[GOOGLE TRENDS VN] ${trends.vn
        .slice(0, 5)
        .map((t) => `${t.query} (${t.approxTraffic})`)
        .join(', ')}`,
    );
  }

  if (policy && policy.items.length > 0) {
    lines.push(
      `[CHÍNH SÁCH & BỘ KH&CN VN] ${policy.items
        .slice(0, 6)
        .map((d) => `${d.docCode ? `[${d.docCode}] ` : ''}${d.title} (${d.source})`)
        .join(' | ')}`,
    );
  }

  if (hptIntel && (hptIntel.stock || hptIntel.items.length > 0)) {
    const st = hptIntel.stock;
    const f = st?.fundamentals;
    const fundStr = f
      ? ` [MST ${f.taxCode}${f.peRatio ? `, P/E=${f.peRatio}x` : ''}${f.pbRatio ? `, P/B=${f.pbRatio}x` : ''}${f.marketCapBillionVnd ? `, Vốn hóa=${f.marketCapBillionVnd} tỷ` : ''}${f.ytdChangePct !== undefined ? `, YTD=${f.ytdChangePct >= 0 ? '+' : ''}${f.ytdChangePct}%` : ''}]`
      : '';
    const stockStr = st
      ? `Cổ phiếu HPT (UPCoM)${st.priceKind === 'reference' ? ' giá tham chiếu' : ''}: ${st.priceThousandVnd.toFixed(2)} nghìn ₫${st.changePercent !== undefined ? ` (${st.changePercent >= 0 ? '+' : ''}${st.changePercent.toFixed(2)}%)` : ''}${fundStr}. `
      : '';
    const topHptNews = hptIntel.items
      .slice(0, 5)
      .map((i) => `[${i.badge} · ${i.sentiment.toUpperCase()}] ${i.title}`)
      .join(' | ');
    lines.push(`[CÔNG TY CP DỊCH VỤ CÔNG NGHỆ TIN HỌC HPT (MÃ HPT · NGUỒN ĐỘC LẬP)] ${stockStr}${topHptNews}`);
  }

  if (techCyber && techCyber.items.length > 0) {
    lines.push(
      `[AI & AN NINH MẠNG CVE] ${techCyber.items
        .slice(0, 5)
        .map((t) => `${t.cveId ? `[${t.cveId}] ` : ''}${t.titleVi || t.title}`)
        .join(' | ')}`,
    );
  }

  if (news.length > 0) {
    lines.push(
      `[TIN NÓNG OSINT] ${news
        .slice(0, 6)
        .map((n) => `[${n.source}] ${n.titleVi || n.title}`)
        .join(' | ')}`,
    );
  }

  return lines.join('\n');
}

const DEFAULT_TAGS = [
  'BIỂN ĐÔNG & AN NINH',
  'THỊ TRƯỜNG & VÀNG SJC',
  'CHÍNH SÁCH & BỘ KH&CN',
  'CYBER & KHÍ TƯỢNG',
] as const;

export function parseSitrepResponseText(raw: string): {
  headline: string;
  bullets: AiSitrepBullet[];
} {
  const cleaned = cleanModelOutput(raw);
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let headline = '';
  const bullets: AiSitrepBullet[] = [];

  for (const line of lines) {
    if (/^(?:\*\*)?HEADLINE(?:\*\*)?\s*:/i.test(line)) {
      headline = line.replace(/^(?:\*\*)?HEADLINE(?:\*\*)?\s*:\s*/i, '').replace(/^\*+|\*+$/g, '').trim();
      continue;
    }

    const bulletMatch = line.match(
      /^[-*•\d.)\s]*\[([^\]]{3,38})\]\s*:?\s*(.+)$/,
    );
    if (bulletMatch) {
      bullets.push({
        tag: bulletMatch[1].replace(/\*+/g, '').trim().toUpperCase(),
        text: bulletMatch[2].replace(/\*\*/g, '').trim(),
      });
      continue;
    }

    if (line.startsWith('-') || line.startsWith('*') || line.startsWith('•')) {
      const textOnly = line.replace(/^[-*•\s]+/, '').replace(/\*\*/g, '').trim();
      if (textOnly.length >= 15) {
        bullets.push({
          tag: DEFAULT_TAGS[bullets.length] ?? 'TÌNH BÁO',
          text: textOnly,
        });
      }
    } else if (!headline && line.length >= 20) {
      headline = line.replace(/\*\*/g, '').trim();
    }
  }

  if (!headline) {
    headline =
      bullets[0]?.text ??
      'Tổng hợp tình báo thời gian thực từ các trạm giám sát Biển Đông, Thị trường & Chính sách.';
  }

  return {
    headline,
    bullets: bullets.slice(0, 4),
  };
}

export function buildDeterministicSitrep(store: SnapshotStore, now = Date.now(), liveVessels?: readonly GeoPointFeature[]): AiSitrepSnapshot {
  const military = store.get<GeoPointFeature[]>('military-flights', now) ?? [];
  const vessels = resolveFreshVessels(store.get<GeoPointFeature[]>('maritime-vessels', now) ?? [], now, liveVessels);
  const cyber = store.get<GeoPointFeature[]>('cyber-threats', now) ?? [];
  const markets = getRetainedMarketSnapshot(store, now);
  const policy = store.get<PolicyLegalSnapshot>('policy-legal', now);
  const vnEnv = store.get<VietnamEnvSnapshot>('vietnam-env', now);

  const vnIndex = markets?.quotes.find((q) => q.symbol === 'VN-Index');
  const usdVnd = markets?.quotes.find((q) => q.symbol === 'USD/VND');
  const sjc = markets?.vnGold?.find((g) => g.code === 'SJC');
  const topDoc = policy?.items[0];
  const hoangSa = vnEnv?.locations.find((l) => l.id === 'vn-hoang-sa');

  return {
    headline: `Giám sát ${military.length} máy bay quân sự, ${vessels.length} tàu AIS & ${cyber.length} chỉ báo C2/APT toàn cầu.`,
    bullets: [
      {
        tag: 'BIỂN ĐÔNG & AN NINH',
        text: `Theo dõi trực tiếp ${military.length} máy bay quân sự ADS-B và ${vessels.length} tàu biển AIS qua các eo biển chiến lược.`,
      },
      {
        tag: 'THỊ TRƯỜNG & VÀNG SJC',
        text: [
          sjc ? `Vàng SJC ${sjc.buyPerLuongMillionVnd.toFixed(1)}–${sjc.sellPerLuongMillionVnd.toFixed(1)} tr/lượng${sjc.retained ? ' (dữ liệu cũ hoặc chưa rõ)' : ''}` : null,
          vnIndex ? `VN-Index ${vnIndex.price} (${vnIndex.changePercent24h == null ? 'biến động không rõ' : `${vnIndex.changePercent24h >= 0 ? '+' : ''}${vnIndex.changePercent24h}%`})` : null,
          usdVnd ? `USD/VND ${usdVnd.price.toLocaleString('en-US')}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Đang đồng bộ dữ liệu tỷ giá, vàng SJC và rổ cổ phiếu VN30.',
      },
      {
        tag: 'CHÍNH SÁCH & BỘ KH&CN',
        text: topDoc
          ? `Mới nhất: ${topDoc.docCode ? `[${topDoc.docCode}] ` : ''}${topDoc.title.slice(0, 115)}`
          : 'Đang theo dõi Bộ tứ Nghị quyết 57·59·66·68 và Cổng văn bản Bộ KH&CN.',
      },
      {
        tag: 'CYBER & KHÍ TƯỢNG',
        text: hoangSa
          ? `QĐ. Hoàng Sa ${hoangSa.tempC}°C, gió cấp ${hoangSa.beaufortScale} (giật ${hoangSa.windGustKmh} km/h); phát hiện ${cyber.length} máy chủ C2/APT.`
          : `Ghi nhận ${cyber.length} mối đe dọa mạng C2/APT đang hoạt động trên radar toàn cầu.`,
      },
    ],
    provider: 'deterministic',
    model: 'rule-engine-v1',
    latencyMs: 1,
    generatedAt: now,
  };
}

let cachedSitrep: { snapshot: AiSitrepSnapshot; populatedCount: number } | null = null;
const SITREP_TTL_MS = 10 * 60_000;

function countPopulatedCollectors(store: SnapshotStore, now: number): number {
  return store.getAllHealth(now).filter((h) => h.itemCount > 0).length;
}

export async function generateAiSitrep(
  store: SnapshotStore,
  forceRefresh = false,
  getLiveVessels?: () => GeoPointFeature[],
): Promise<AiSitrepSnapshot> {
  const now = Date.now();
  const populated = countPopulatedCollectors(store, now);

  if (
    !forceRefresh &&
    cachedSitrep &&
    now - cachedSitrep.snapshot.generatedAt < SITREP_TTL_MS &&
    !(cachedSitrep.populatedCount < 4 && populated >= 6)
  ) {
    return cachedSitrep.snapshot;
  }

  const liveVessels = getLiveVessels?.();
  const context = buildMonitorLiveContext(store, now, liveVessels);
  const llm = await callGroqChatCompletion(
    [
      {
        role: 'system',
        content:
          'Bạn là Sĩ quan Phân tích Tình báo Chiến lược của hệ thống World Monitor Việt Nam. Dựa TUYỆT ĐỐI vào dữ liệu thời gian thực được cung cấp (không bịa số liệu), hãy viết Bản tin Tình báo Tổng hợp (SITREP) bằng tiếng Việt thật sắc bén, cô đọng theo đúng định dạng 5 dòng sau:\nHEADLINE: <1 câu tóm tắt bức tranh nổi bật nhất dưới 26 từ>\n- [BIỂN ĐÔNG & AN NINH] <1 câu dưới 28 từ nêu số liệu tác chiến, tàu/máy bay, nhiễu GPS hoặc điểm nóng>\n- [THỊ TRƯỜNG & VÀNG SJC] <1 câu dưới 28 từ nêu Vàng SJC, VN-Index/VN30, USD/VND hoặc Polymarket>\n- [CHÍNH SÁCH & BỘ KH&CN] <1 câu dưới 28 từ nêu văn bản mới của Chính phủ, Bộ KH&CN hoặc NQ 57·59·66·68>\n- [CYBER & KHÍ TƯỢNG] <1 câu dưới 28 từ nêu cảnh báo CVE/C2 và thời tiết Hoàng Sa - Trường Sa / AQI VN>',
      },
      {
        role: 'user',
        content: `Dữ liệu Live RAM hiện tại:\n${context}`,
      },
    ],
    { maxTokens: 480, temperature: 0.2, timeoutMs: 8_500 },
  );

  if (llm) {
    const parsed = parseSitrepResponseText(llm.text);
    if (parsed.bullets.length >= 2) {
      const snap: AiSitrepSnapshot = {
        headline: parsed.headline,
        bullets: parsed.bullets,
        provider: llm.provider,
        model: llm.model,
        latencyMs: llm.latencyMs,
        generatedAt: now,
      };
      cachedSitrep = { snapshot: snap, populatedCount: populated };
      return snap;
    }
  }

  const fallback = buildDeterministicSitrep(store, now, liveVessels);
  cachedSitrep = { snapshot: fallback, populatedCount: populated };
  return fallback;
}

const askCooldownByIp = new Map<string, number>();

export async function answerMonitorQuestion(
  rawQuestion: string,
  store: SnapshotStore,
  clientIp = 'local',
  getLiveVessels?: () => GeoPointFeature[],
): Promise<AiAskResponse> {
  const question = rawQuestion.trim().slice(0, 400);
  if (!question) {
    throw new Error('Vui lòng nhập câu hỏi tình báo.');
  }

  const now = Date.now();
  const lastAsk = askCooldownByIp.get(clientIp) ?? 0;
  if (now - lastAsk < 1_500) {
    throw new Error('Vui lòng đợi 2 giây giữa các câu hỏi để bảo vệ hạn mức API.');
  }
  setBounded(askCooldownByIp, clientIp, now, 1_000);

  const liveVessels = getLiveVessels?.();
  const context = buildMonitorLiveContext(store, now, liveVessels);
  const llm = await callGroqChatCompletion(
    [
      {
        role: 'system',
        content:
          'Bạn là Trợ lý Tình báo AI (Ask Monitor Copilot) của bảng điều khiển World Monitor Việt Nam. Trả lời bằng tiếng Việt ngắn gọn, súc tích (tối đa 4–5 gạch đầu dòng ngắn), dẫn chứng ĐÚNG số liệu thời gian thực trong ngữ cảnh RAM bên dưới. Nếu thông tin không có trong dữ liệu live, hãy nói rõ chưa ghi nhận trên luồng trực tiếp thay vì suy đoán.',
      },
      {
        role: 'user',
        content: `DỮ LIỆU TRỰC TIẾP TRONG RAM:\n${context}\n\nCÂU HỎI NGƯỜI DÙNG: ${question}`,
      },
    ],
    { maxTokens: 520, temperature: 0.2, timeoutMs: 9_500 },
  );

  if (llm) {
    return {
      question,
      answer: llm.text,
      provider: llm.provider,
      model: llm.model,
      latencyMs: llm.latencyMs,
      answeredAt: Date.now(),
    };
  }

  const det = buildDeterministicSitrep(store, now, liveVessels);
  return {
    question,
    answer: det.bullets.map((b) => `• [${b.tag}] ${b.text}`).join('\n'),
    provider: 'deterministic',
    model: 'rule-engine-v1',
    latencyMs: 1,
    answeredAt: Date.now(),
  };
}
