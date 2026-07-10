// Rule-based lead scoring (0–100). Deliberately simple and explainable:
// each rule adds points; the UI shows the band (Hot/Warm/Cold).

export type LeadScoringInput = {
  source: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  message?: string | null;
  // Enrichment when the lead is linked to a known merchant
  merchantMonthlyTxnVolume?: number | null;
};

const SOURCE_POINTS: Record<string, number> = {
  REFERRAL: 25,
  WEBSITE: 15,
  EVENT: 15,
  COLD_OUTREACH: 5,
  OTHER: 5,
};

export function computeLeadScore(input: LeadScoringInput): number {
  let score = SOURCE_POINTS[input.source] ?? 5;

  if (input.phone) score += 15;
  if (input.email) score += 10;
  if (input.company) score += 10;
  // A written message signals real intent
  if (input.message && input.message.trim().length >= 20) score += 10;

  // Known merchant: transaction volume is the best Perx fit signal
  const volume = input.merchantMonthlyTxnVolume;
  if (volume != null) {
    if (volume >= 5000) score += 30;
    else if (volume >= 1000) score += 20;
    else score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

export type ScoreBand = "HOT" | "WARM" | "COLD";

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "HOT";
  if (score >= 40) return "WARM";
  return "COLD";
}
