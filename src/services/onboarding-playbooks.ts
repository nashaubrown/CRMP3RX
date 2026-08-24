import type { OnboardingOwnerRole, OnboardingStageKey } from "@prisma/client";

// The checklists a new onboarding starts from. Admins edit them in the CRM
// afterwards; these are only the shape of a first run, seeded once so nobody
// faces an empty board. Offsets are days from the moment that stage starts —
// not from the project, since a stage can wait weeks for a merchant.

export type PlaybookTaskSeed = {
  stage: OnboardingStageKey;
  title: string;
  description?: string;
  dueOffsetDays?: number;
  ownerRole?: OnboardingOwnerRole;
};

export type PlaybookSeed = {
  name: string;
  description: string;
  planLabel: string | null;
  isDefault?: boolean;
  tasks: PlaybookTaskSeed[];
};

const paperwork = (extra: PlaybookTaskSeed[] = []): PlaybookTaskSeed[] => [
  { stage: "PAPERWORK", title: "Signed agreement received", dueOffsetDays: 2 },
  {
    stage: "PAPERWORK",
    title: "Business registration & owner ID collected",
    description: "Company registration certificate and the signatory's ID card.",
    dueOffsetDays: 2,
    ownerRole: "MERCHANT",
  },
  { stage: "PAPERWORK", title: "Billing contact and payment method confirmed", dueOffsetDays: 3 },
  ...extra,
];

const account: PlaybookTaskSeed[] = [
  { stage: "ACCOUNT", title: "Create the merchant account and plan", dueOffsetDays: 1 },
  { stage: "ACCOUNT", title: "Add outlets and their addresses", dueOffsetDays: 1 },
  {
    stage: "ACCOUNT",
    title: "Send portal login to the merchant",
    description: "Owner logs in once and sets their own password.",
    dueOffsetDays: 2,
  },
];

const rewards: PlaybookTaskSeed[] = [
  {
    stage: "REWARDS",
    title: "Pick the starter rewards with the merchant",
    description: "Use the curated ideas on the merchant's page — one of each mechanic.",
    dueOffsetDays: 1,
  },
  {
    stage: "REWARDS",
    title: "Merchant creates the rewards in the portal",
    dueOffsetDays: 3,
    ownerRole: "MERCHANT",
  },
  { stage: "REWARDS", title: "Check every reward is live and redeemable", dueOffsetDays: 4 },
];

const training: PlaybookTaskSeed[] = [
  { stage: "TRAINING", title: "Walk the owner through the Merchant Portal", dueOffsetDays: 2 },
  {
    stage: "TRAINING",
    title: "Train counter staff on scan-and-redeem",
    description: "Whoever is on the till at the busiest hour, not just the manager.",
    dueOffsetDays: 3,
  },
];

const goLive: PlaybookTaskSeed[] = [
  { stage: "GO_LIVE", title: "Deliver standee, stickers and QR collateral", dueOffsetDays: 2 },
  { stage: "GO_LIVE", title: "Announce the merchant in the Perx App", dueOffsetDays: 2 },
  {
    stage: "GO_LIVE",
    title: "Watch the first real customer earn and redeem",
    description: "Stand at the counter for it — this is where setup mistakes surface.",
    dueOffsetDays: 3,
  },
];

const postLaunch: PlaybookTaskSeed[] = [
  { stage: "POST_LAUNCH", title: "7-day check: transactions flowing?", dueOffsetDays: 7 },
  {
    stage: "POST_LAUNCH",
    title: "30-day review with the owner",
    description: "Redemption numbers, staff friction, what to change in the offers.",
    dueOffsetDays: 30,
  },
];

export const DEFAULT_PLAYBOOKS: PlaybookSeed[] = [
  {
    name: "Starter",
    description: "A single outlet on the Starter plan — no POS integration.",
    planLabel: "Starter",
    tasks: [
      ...paperwork(),
      ...account,
      {
        stage: "INTEGRATION",
        title: "Confirm no POS integration is needed",
        description: "Starter merchants run on the Perx App alone; skip the stage if so.",
        dueOffsetDays: 1,
      },
      ...rewards,
      ...training.slice(0, 1),
      ...goLive.slice(0, 2),
      postLaunch[0],
    ],
  },
  {
    name: "Growth",
    description: "Two to four outlets, usually with a POS to connect.",
    planLabel: "Growth",
    isDefault: true,
    tasks: [
      ...paperwork(),
      ...account,
      { stage: "INTEGRATION", title: "Confirm POS system and version", dueOffsetDays: 1 },
      { stage: "INTEGRATION", title: "Request API credentials from the POS vendor", dueOffsetDays: 3 },
      { stage: "INTEGRATION", title: "Connect the first outlet and test in sandbox", dueOffsetDays: 5 },
      { stage: "INTEGRATION", title: "Roll out to the remaining outlets", dueOffsetDays: 7 },
      ...rewards,
      ...training,
      ...goLive,
      ...postLaunch,
    ],
  },
  {
    name: "Enterprise",
    description: "Five or more outlets, or a resort — staged rollout and a named contact.",
    planLabel: "Enterprise",
    tasks: [
      ...paperwork([
        {
          stage: "PAPERWORK",
          title: "Agree the rollout order across outlets",
          description: "Which location goes first, and who signs off each one.",
          dueOffsetDays: 4,
        },
        { stage: "PAPERWORK", title: "Name a day-to-day contact on the merchant side", dueOffsetDays: 3 },
      ]),
      ...account,
      { stage: "ACCOUNT", title: "Set per-outlet managers in the portal", dueOffsetDays: 3 },
      { stage: "INTEGRATION", title: "Confirm POS system and version at each outlet", dueOffsetDays: 2 },
      { stage: "INTEGRATION", title: "Send the integration brief to the vendor", dueOffsetDays: 3 },
      {
        stage: "INTEGRATION",
        title: "Receive API credentials",
        dueOffsetDays: 7,
        ownerRole: "MERCHANT",
      },
      {
        stage: "INTEGRATION",
        title: "Connect the pilot outlet in sandbox",
        dueOffsetDays: 10,
        ownerRole: "DEVELOPER",
      },
      {
        stage: "INTEGRATION",
        title: "Test earn and redeem on a real bill",
        dueOffsetDays: 12,
        ownerRole: "DEVELOPER",
      },
      { stage: "INTEGRATION", title: "Roll out to the remaining outlets", dueOffsetDays: 18 },
      ...rewards,
      {
        stage: "REWARDS",
        title: "Agree which offers differ by outlet",
        dueOffsetDays: 4,
      },
      ...training,
      {
        stage: "TRAINING",
        title: "Train each outlet manager separately",
        dueOffsetDays: 6,
      },
      { stage: "TRAINING", title: "Leave a one-page cheat sheet at every till", dueOffsetDays: 6 },
      ...goLive,
      { stage: "GO_LIVE", title: "Joint launch post on the merchant's socials", dueOffsetDays: 4 },
      ...postLaunch,
      {
        stage: "POST_LAUNCH",
        title: "Compare outlet performance and fix the laggard",
        dueOffsetDays: 30,
      },
    ],
  },
];
