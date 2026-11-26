// Tuổi Trẻ and the government portals publish "11/27/2026 12:28:00 AM": Vietnam time with no zone.
const ZONELESS_VN_DATE = /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2} [AP]M$/i;

export function parseFeedDate(raw: string): number {
  const text = raw.trim();
  if (!text) return Number.NaN;
  return Date.parse(ZONELESS_VN_DATE.test(text) ? `${text} +0700` : text);
}
