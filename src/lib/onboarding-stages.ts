import type { OnboardingOwnerRole, OnboardingStageKey } from "@prisma/client";

// Stage vocabulary, shared by the service (server) and the board (client).
// Kept free of any database import so a client component can pull it in.

// The order a merchant walks the stages. This array is the source of truth for
// "what comes next" — nothing else may hard-code an ordering.
export const ONBOARDING_STAGES: OnboardingStageKey[] = [
  "PAPERWORK",
  "ACCOUNT",
  "INTEGRATION",
  "REWARDS",
  "TRAINING",
  "GO_LIVE",
  "POST_LAUNCH",
];

export const STAGE_LABELS: Record<OnboardingStageKey, string> = {
  PAPERWORK: "Paperwork",
  ACCOUNT: "Account",
  INTEGRATION: "Integration",
  REWARDS: "Rewards",
  TRAINING: "Training",
  GO_LIVE: "Go-live",
  POST_LAUNCH: "Post-launch",
};

// What actually happens in each stage, for the empty states and tooltips.
export const STAGE_BLURBS: Record<OnboardingStageKey, string> = {
  PAPERWORK: "Agreement signed, documents collected, billing agreed.",
  ACCOUNT: "The merchant account, its outlets and the portal login.",
  INTEGRATION: "Connecting the POS — or confirming none is needed.",
  REWARDS: "The first offers, created by the merchant and verified live.",
  TRAINING: "Owner and counter staff know scan-and-redeem.",
  GO_LIVE: "Collateral out, listed in the app, first real transaction watched.",
  POST_LAUNCH: "7-day and 30-day checks before the launch is called done.",
};

// One dot colour per stage, matching the board's columns.
export const STAGE_DOT: Record<OnboardingStageKey, string> = {
  PAPERWORK: "bg-slate-400",
  ACCOUNT: "bg-indigo-500",
  INTEGRATION: "bg-sky-500",
  REWARDS: "bg-amber-500",
  TRAINING: "bg-purple-500",
  GO_LIVE: "bg-emerald-600",
  POST_LAUNCH: "bg-teal-700",
};

export const OWNER_ROLE_LABELS: Record<OnboardingOwnerRole, string> = {
  REP: "Perx rep",
  DEVELOPER: "Developer",
  MERCHANT: "Merchant",
};

export function stageIndex(stage: OnboardingStageKey): number {
  return ONBOARDING_STAGES.indexOf(stage);
}

export function nextStage(stage: OnboardingStageKey): OnboardingStageKey | null {
  const i = stageIndex(stage);
  return i >= 0 && i < ONBOARDING_STAGES.length - 1 ? ONBOARDING_STAGES[i + 1] : null;
}
