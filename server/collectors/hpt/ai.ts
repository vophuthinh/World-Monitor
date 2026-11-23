import type { HptCompanyItem, HptSentiment } from '@shared/types';
import { setBounded } from '../../lib/bounded-map';
import { callGroqChatCompletion } from '../../lib/groq-intel';

export interface ParsedHptAiVerdict {
  isHpt: boolean;
  sentiment: HptSentiment;
  summary: string;
}

export function parseGroqHptSentimentBatch(rawText: string): Map<number, ParsedHptAiVerdict> {
  const map = new Map<number, ParsedHptAiVerdict>();
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/^[-*•\s]+/, '').trim();
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length < 4) continue;
    const idx = Number.parseInt(parts[0], 10);
    if (!Number.isFinite(idx)) continue;

    const isHpt = /^YES$/i.test(parts[1]);
    const sentCode = parts[2].toUpperCase();
    const sentiment: HptSentiment =
      sentCode === 'POSITIVE' ? 'positive' : sentCode === 'NEGATIVE' ? 'negative' : 'neutral';
    const summary = parts.slice(3).join(' | ').replace(/\*\*/g, '').trim();

    map.set(idx, { isHpt, sentiment, summary });
  }
  return map;
}

export const aiHptCache = new Map<string, ParsedHptAiVerdict>();

export async function maybeEnrichHptWithGroqSentiment(items: HptCompanyItem[]): Promise<{
  items: HptCompanyItem[];
  aiEnabled: boolean;
}> {
  const hasKey = Boolean(process.env.GROQ_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim());
  if (!hasKey || items.length === 0) {
    return { items, aiEnabled: false };
  }

  const uncached = items.filter((i) => !aiHptCache.has(i.id)).slice(0, 8);
  if (uncached.length > 0) {
    const numbered = uncached.map((it, idx) => `${idx} | [${it.source}] ${it.title}`).join('\n');
    const llm = await callGroqChatCompletion(
      [
        {
          role: 'system',
          content:
            'Bạn là Chuyên gia Phân tích Chứng khoán & Đấu thầu CNTT Việt Nam. Với mỗi dòng tiêu đề dưới đây, hãy xác nhận xem tin đó có đang nói về Công ty Cổ phần Dịch vụ Công nghệ Tin học HPT (mã HPT sàn UPCoM, MST 0301447436, tích hợp hệ thống & an toàn thông tin) hay không. Lưu ý: nếu HPT trượt thầu/thua thầu thì đánh giá NEGATIVE; trúng thầu/chia cổ tức/đạt giải thưởng đối tác thì POSITIVE. Trả lời ĐÚNG định dạng mỗi dòng 4 trường cách nhau bởi dấu | (không thêm chữ thừa):\n<chỉ_số>|YES hoặc NO|POSITIVE hoặc NEGATIVE hoặc NEUTRAL|<Tóm tắt tác động 1 câu tiếng Việt ngắn dưới 20 từ>',
        },
        {
          role: 'user',
          content: numbered,
        },
      ],
      { maxTokens: 460, temperature: 0.1, timeoutMs: 7_500 },
    );

    if (llm) {
      const parsed = parseGroqHptSentimentBatch(llm.text);
      for (const [idx, verdict] of parsed.entries()) {
        const target = uncached[idx];
        if (target) {
          setBounded(aiHptCache, target.id, verdict, 500);
        }
      }
    }
  }

  const filtered: HptCompanyItem[] = [];
  for (const item of items) {
    const cached = aiHptCache.get(item.id);
    if (!cached) {
      filtered.push(item);
      continue;
    }
    if (!cached.isHpt && item.source !== 'HNX / UBCKNN (qua CafeF)') {
      continue;
    }
    filtered.push({
      ...item,
      sentiment: cached.sentiment,
      aiSummary: cached.summary || item.aiSummary,
      aiVerified: true,
    });
  }

  return { items: filtered, aiEnabled: true };
}

// ============================================================================
// 4. Live HPT UPCoM Stock + Simplize Fundamentals + Independent Multi-Source Collector
// ============================================================================

