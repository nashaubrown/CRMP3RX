import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const DEMO_PASSWORD = "perx1234";

async function main() {
  console.log("Seeding Perx CRM…");

  // Idempotent: wipe app data first (order matters for FKs).
  await db.chatMessage.deleteMany();
  await db.conversation.deleteMany();
  await db.auditLog.deleteMany();
  await db.meeting.deleteMany();
  await db.availabilityRule.deleteMany();
  await db.availabilitySchedule.deleteMany();
  await db.smsMessage.deleteMany();
  await db.emailMessage.deleteMany();
  await db.messageTemplate.deleteMany();
  await db.smsOptOut.deleteMany();
  await db.activity.deleteMany();
  await db.deal.deleteMany();
  await db.lead.deleteMany();
  await db.contact.deleteMany();
  await db.merchant.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();

  const passwordHash = await hash(DEMO_PASSWORD, 10);

  const admin = await db.user.create({
    data: {
      name: "Aisha Rasheed",
      email: "admin@perx.mv",
      passwordHash,
      role: "ADMIN",
      bookingSlug: "aisha",
    },
  });
  const rep1 = await db.user.create({
    data: {
      name: "Hassan Naeem",
      email: "hassan@perx.mv",
      passwordHash,
      role: "SALES_REP",
      bookingSlug: "hassan",
    },
  });
  const rep2 = await db.user.create({
    data: {
      name: "Mariyam Shifa",
      email: "mariyam@perx.mv",
      passwordHash,
      role: "SALES_REP",
      bookingSlug: "mariyam",
    },
  });

  // Default availability: Sun–Thu 09:00–17:00 MV time (Maldives work week).
  for (const user of [admin, rep1, rep2]) {
    await db.availabilitySchedule.create({
      data: {
        userId: user.id,
        timezone: "Indian/Maldives",
        slotDurationMins: 30,
        bufferMins: 10,
        rules: {
          create: [0, 1, 2, 3, 4].map((dayOfWeek) => ({
            dayOfWeek,
            startMinutes: 9 * 60,
            endMinutes: 17 * 60,
          })),
        },
      },
    });
  }

  type MerchantSeed = {
    name: string;
    category: string;
    status: "PROSPECT" | "ACTIVE" | "CHURNED";
    posSystem: string | null;
    monthlyTxnVolume: number;
    loyaltyLive: boolean;
    owner: string;
    phone: string;
    email: string;
    address: string;
    website?: string;
  };

  const merchantSeeds: MerchantSeed[] = [
    { name: "Seagull Café House", category: "Restaurants & Cafés", status: "ACTIVE", posSystem: "Ewity", monthlyTxnVolume: 4200, loyaltyLive: true, owner: rep1.id, phone: "+9603323332", email: "hello@seagull.mv", address: "Fareedhee Magu, Malé", website: "https://seagull.mv" },
    { name: "Meraki Coffee Roasters", category: "Restaurants & Cafés", status: "ACTIVE", posSystem: "Ewity", monthlyTxnVolume: 3100, loyaltyLive: true, owner: rep2.id, phone: "+9607771234", email: "team@meraki.mv", address: "Boduthakurufaanu Magu, Malé" },
    { name: "Lily Retail Group", category: "Supermarkets", status: "PROSPECT", posSystem: "Custom", monthlyTxnVolume: 18000, loyaltyLive: false, owner: rep1.id, phone: "+9603334455", email: "info@lily.mv", address: "Orchid Magu, Malé", website: "https://lily.mv" },
    { name: "Sonee Sports", category: "Sporting Goods", status: "PROSPECT", posSystem: "Odoo", monthlyTxnVolume: 6500, loyaltyLive: false, owner: rep2.id, phone: "+9603312345", email: "sales@soneesports.mv", address: "Majeedhee Magu, Malé" },
    { name: "Hulhumalé Pharmacy Plus", category: "Pharmacies", status: "PROSPECT", posSystem: "Ewity", monthlyTxnVolume: 5200, loyaltyLive: false, owner: rep1.id, phone: "+9607789900", email: "contact@pharmacyplus.mv", address: "Nirolhu Magu, Hulhumalé" },
    { name: "The Kaffu Kitchen", category: "Restaurants & Cafés", status: "PROSPECT", posSystem: null, monthlyTxnVolume: 900, loyaltyLive: false, owner: rep2.id, phone: "+9609112233", email: "bookings@kaffukitchen.mv", address: "Kaafu Atoll, Thulusdhoo" },
    { name: "Velana Duty Free Collective", category: "Retail", status: "ACTIVE", posSystem: "Oracle Micros", monthlyTxnVolume: 22000, loyaltyLive: true, owner: rep1.id, phone: "+9603337788", email: "partners@vdfc.mv", address: "Velana International Airport" },
    { name: "Coral Divers Maldives", category: "Tourism & Activities", status: "PROSPECT", posSystem: "Ewity", monthlyTxnVolume: 1400, loyaltyLive: false, owner: rep2.id, phone: "+9607945566", email: "dive@coraldivers.mv", address: "Maafushi, Kaafu Atoll" },
    { name: "Island Bakery & Sweets", category: "Bakeries", status: "CHURNED", posSystem: "Ewity", monthlyTxnVolume: 800, loyaltyLive: false, owner: rep1.id, phone: "+9603301122", email: "orders@islandbakery.mv", address: "Ameenee Magu, Malé" },
    { name: "Ocean Blue Water Sports", category: "Tourism & Activities", status: "PROSPECT", posSystem: "Square", monthlyTxnVolume: 2600, loyaltyLive: false, owner: rep2.id, phone: "+9609556677", email: "info@oceanblue.mv", address: "Hulhumalé Beach Front" },
  ];

  // Spread record creation over the past couple of months so the dashboard's
  // week-over-week trends and sparklines reflect a CRM that's been in use.
  const DAY = 24 * 60 * 60 * 1000;
  const seedNow = Date.now();
  const daysAgo = (d: number) => new Date(seedNow - d * DAY);
  const spreadDate = (i: number, total: number, spanDays: number) =>
    daysAgo(Math.round(((total - 1 - i) / Math.max(1, total - 1)) * spanDays));

  const plans = ["Starter", "Growth", "Enterprise"];
  const merchants = [] as { id: string; name: string; ownerId: string }[];
  for (const [i, m] of merchantSeeds.entries()) {
    // Spread demo pins around Malé so the map view has something to show.
    const lat = 4.1755 + (i - merchantSeeds.length / 2) * 0.0045;
    const lng = 73.5093 + ((i % 3) - 1) * 0.006;
    const created = await db.merchant.create({
      data: {
        name: m.name,
        category: m.category,
        status: m.status,
        posSystem: m.posSystem,
        monthlyTxnVolume: m.monthlyTxnVolume,
        loyaltyLive: m.loyaltyLive,
        subscriptionPlan: plans[i % plans.length],
        beta: i % 4 === 0,
        latitude: lat,
        longitude: lng,
        ownerId: m.owner,
        phone: m.phone,
        email: m.email,
        address: m.address,
        website: m.website,
        createdAt: spreadDate(i, merchantSeeds.length, 63),
      },
    });

    // Outlets drive branch count + the map. One merchant gets 3 to demo the
    // multi-outlet case; the rest have a single primary outlet.
    const outlets = [{ name: m.name, address: m.address, latitude: lat, longitude: lng, isPrimary: true }];
    if (i === 2) {
      outlets.push(
        { name: `${m.name} — Hulhumalé`, address: "Hulhumalé", latitude: lat + 0.03, longitude: lng + 0.012, isPrimary: false },
        { name: `${m.name} — Villimalé`, address: "Villimalé", latitude: lat - 0.02, longitude: lng - 0.01, isPrimary: false }
      );
    }
    for (const o of outlets) await db.outlet.create({ data: { merchantId: created.id, ...o } });
    await db.merchant.update({ where: { id: created.id }, data: { branches: outlets.length } });

    merchants.push({ id: created.id, name: created.name, ownerId: created.ownerId });
  }

  // Two contacts per merchant (first is primary) → 20 contacts.
  const firstNames = ["Ibrahim", "Fathimath", "Mohamed", "Aminath", "Ali", "Khadeeja", "Ahmed", "Zulaikha", "Yoosuf", "Leela", "Adam", "Neeza", "Shafiu", "Rifga", "Naseem", "Shazna", "Firag", "Eanash", "Sobah", "Muna"];
  const lastNames = ["Waheed", "Saeed", "Latheef", "Rasheed", "Manik", "Didi", "Fulhu", "Zahir", "Nasih", "Shareef", "Hameed", "Ismail", "Alim", "Riza", "Sattar", "Wafir", "Azlif", "Samah", "Firaq", "Anil"];
  const titles = ["Owner", "General Manager", "Operations Manager", "Finance Manager", "Marketing Lead"];

  const contacts: { id: string; merchantId: string; ownerId: string | null }[] = [];
  for (let i = 0; i < merchants.length; i++) {
    const merchant = merchants[i];
    for (let j = 0; j < 2; j++) {
      const idx = i * 2 + j;
      const contact = await db.contact.create({
        data: {
          firstName: firstNames[idx],
          lastName: lastNames[idx],
          title: titles[idx % titles.length],
          email: `${firstNames[idx].toLowerCase()}.${lastNames[idx].toLowerCase()}@${merchant.name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10)}.mv`,
          phone: `+9607${String(100000 + idx * 137).slice(0, 6)}`,
          isPrimary: j === 0,
          merchantId: merchant.id,
          ownerId: merchant.ownerId,
        },
      });
      // Tag the contact to its home merchant (mirrors the app's create flow).
      await db.contactMerchant.create({
        data: { contactId: contact.id, merchantId: merchant.id },
      });
      contacts.push({ id: contact.id, merchantId: contact.merchantId, ownerId: contact.ownerId });
    }
  }

  // Demo the multi-merchant tagging: the first contact also covers merchant #2.
  if (contacts[0] && merchants[1]) {
    await db.contactMerchant.create({
      data: { contactId: contacts[0].id, merchantId: merchants[1].id },
    });
  }

  // Leads across statuses.
  const leadSeeds = [
    { source: "WEBSITE", status: "NEW", name: "Ismail Naji", company: "Malé Fresh Mart", email: "ismail@freshmart.mv", phone: "+9607441122", message: "Interested in loyalty for our two outlets", owner: rep1.id },
    { source: "REFERRAL", status: "NEW", name: "Aishath Vidhaa", company: "Bliss Salon", email: "vidhaa@blisssalon.mv", phone: "+9609887766", message: "Referred by Seagull Café", owner: rep2.id },
    { source: "EVENT", status: "CONTACTED", name: "Hussain Areef", company: "Areef Motors", email: "areef@areefmotors.mv", phone: "+9607665544", message: "Met at Maldives SME Expo", owner: rep1.id },
    { source: "WEBSITE", status: "CONTACTED", merchantIdx: 3, owner: rep2.id },
    { source: "COLD_OUTREACH", status: "QUALIFIED", merchantIdx: 2, contactIdx: 4, owner: rep1.id },
    { source: "WEBSITE", status: "QUALIFIED", merchantIdx: 7, contactIdx: 14, owner: rep2.id },
    { source: "COLD_OUTREACH", status: "UNQUALIFIED", name: "Test Enquiry", company: "N/A", email: "spam@example.com", message: "Not a real business", owner: rep2.id },
  ] as const;

  for (const [i, l] of leadSeeds.entries()) {
    const merchant = "merchantIdx" in l && l.merchantIdx !== undefined ? merchants[l.merchantIdx] : undefined;
    const contact = "contactIdx" in l && l.contactIdx !== undefined ? contacts[l.contactIdx] : undefined;
    await db.lead.create({
      data: {
        source: l.source,
        status: l.status,
        // Simple placeholder score; real rule-based scoring lands in Phase 2.
        score: l.status === "QUALIFIED" ? 80 : l.status === "CONTACTED" ? 50 : l.status === "NEW" ? 30 : 0,
        name: "name" in l ? l.name : undefined,
        company: "company" in l ? l.company : undefined,
        email: "email" in l ? l.email : undefined,
        phone: "phone" in l ? (l as { phone?: string }).phone : undefined,
        message: "message" in l ? l.message : undefined,
        merchantId: merchant?.id,
        contactId: contact?.id,
        ownerId: l.owner,
        createdAt: spreadDate(i, leadSeeds.length, 49),
      },
    });
  }

  // Deals across all stages.
  const now = new Date();
  const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
  const dealSeeds = [
    { title: "Lily Retail — loyalty rollout (12 outlets)", merchantIdx: 2, stage: "PROPOSAL", value: 240000, currency: "MVR", close: inDays(20), owner: rep1.id },
    { title: "Sonee Sports — points program", merchantIdx: 3, stage: "QUALIFIED", value: 85000, currency: "MVR", close: inDays(35), owner: rep2.id },
    { title: "Pharmacy Plus — starter plan", merchantIdx: 4, stage: "NEW", value: 3000, currency: "USD", close: inDays(45), owner: rep1.id },
    { title: "Kaffu Kitchen — café loyalty pilot", merchantIdx: 5, stage: "NEW", value: 18000, currency: "MVR", close: inDays(60), owner: rep2.id },
    { title: "VDFC — airport-wide expansion", merchantIdx: 6, stage: "NEGOTIATION", value: 48000, currency: "USD", close: inDays(12), owner: rep1.id },
    { title: "Coral Divers — activity rewards", merchantIdx: 7, stage: "QUALIFIED", value: 22000, currency: "MVR", close: inDays(28), owner: rep2.id },
    { title: "Seagull Café — plan upgrade", merchantIdx: 0, stage: "WON", value: 36000, currency: "MVR", close: inDays(-5), owner: rep1.id },
    { title: "Meraki — second outlet add-on", merchantIdx: 1, stage: "WON", value: 1500, currency: "USD", close: inDays(-12), owner: rep2.id },
    { title: "Island Bakery — renewal", merchantIdx: 8, stage: "LOST", value: 12000, currency: "MVR", close: inDays(-20), owner: rep1.id, lostReason: "Closed shop relocation; budget cut" },
    { title: "Ocean Blue — seasonal promo pack", merchantIdx: 9, stage: "PROPOSAL", value: 9500, currency: "MVR", close: inDays(15), owner: rep2.id },
  ] as const;

  const deals: { id: string; ownerId: string }[] = [];
  for (const [i, d] of dealSeeds.entries()) {
    const closed = d.stage === "WON" || d.stage === "LOST";
    // Closed deals were created ~4 weeks before they closed; open deals are
    // spread over the last six weeks.
    const createdAt = closed
      ? new Date(d.close.getTime() - 28 * DAY)
      : spreadDate(i, dealSeeds.length, 42);
    const deal = await db.deal.create({
      data: {
        title: d.title,
        merchantId: merchants[d.merchantIdx].id,
        contactId: contacts[d.merchantIdx * 2].id,
        stage: d.stage,
        value: d.value,
        currency: d.currency,
        expectedCloseDate: d.close,
        lostReason: "lostReason" in d ? d.lostReason : undefined,
        closedAt: closed ? d.close : undefined,
        position: i,
        ownerId: d.owner,
        createdAt,
      },
    });
    deals.push({ id: deal.id, ownerId: deal.ownerId });
  }

  // A few activities: notes, calls, tasks (some overdue).
  const activitySeeds = [
    { type: "NOTE", subject: "Intro call summary", body: "Walked through Perx cashback flows; they want Ewity integration details.", entityType: "MERCHANT", entityIdx: 2, owner: rep1.id },
    { type: "CALL", subject: "Follow-up call with GM", body: "Discussed pricing tiers.", entityType: "MERCHANT", entityIdx: 3, owner: rep2.id, completedAt: inDays(-2) },
    { type: "TASK", subject: "Send proposal deck to Lily Retail", dueAt: inDays(2), entityType: "DEAL", dealIdx: 0, owner: rep1.id },
    { type: "TASK", subject: "Chase VDFC procurement for contract", dueAt: inDays(-1), entityType: "DEAL", dealIdx: 4, owner: rep1.id },
    { type: "TASK", subject: "Prepare demo store for Coral Divers", dueAt: inDays(5), entityType: "DEAL", dealIdx: 5, owner: rep2.id },
    { type: "MEETING", subject: "On-site walkthrough at Sonee Sports", dueAt: inDays(3), entityType: "MERCHANT", entityIdx: 3, owner: rep2.id },
  ] as const;

  for (const a of activitySeeds) {
    await db.activity.create({
      data: {
        type: a.type,
        subject: a.subject,
        body: "body" in a ? a.body : undefined,
        dueAt: "dueAt" in a ? a.dueAt : undefined,
        completedAt: "completedAt" in a ? a.completedAt : undefined,
        entityType: a.entityType,
        entityId: a.entityType === "DEAL" ? deals[(a as { dealIdx: number }).dealIdx].id : merchants[(a as { entityIdx: number }).entityIdx].id,
        ownerId: a.owner,
      },
    });
  }

  // Sample shares (hybrid model): Hassan collaborates with Mariyam.
  await db.merchantShare.create({
    data: { merchantId: merchants[2].id, userId: rep2.id, permission: "EDIT" }, // Lily Retail Group
  });
  await db.merchantShare.create({
    data: { merchantId: merchants[6].id, userId: rep2.id, permission: "VIEW" }, // Velana Duty Free
  });

  // Audit trail for seeded records so History isn't empty on first run.
  await db.auditLog.createMany({
    data: [
      ...merchants.map((m) => ({
        actorId: m.ownerId,
        action: "merchant.create",
        entityType: "MERCHANT",
        entityId: m.id,
        merchantId: m.id,
      })),
      {
        actorId: rep1.id,
        action: "merchant.share",
        entityType: "MERCHANT",
        entityId: merchants[2].id,
        merchantId: merchants[2].id,
        diff: { userId: rep2.id, userName: rep2.name, permission: "EDIT" },
      },
      {
        actorId: rep1.id,
        action: "merchant.share",
        entityType: "MERCHANT",
        entityId: merchants[6].id,
        merchantId: merchants[6].id,
        diff: { userId: rep2.id, userName: rep2.name, permission: "VIEW" },
      },
    ],
  });

  // Message templates.
  await db.messageTemplate.createMany({
    data: [
      {
        name: "Intro — Perx loyalty overview",
        channel: "EMAIL",
        subject: "Grow repeat customers at {{merchant_name}} with Perx",
        body: "<p>Hi {{contact_first_name}},</p><p>Thanks for your interest in Perx! We help merchants like {{merchant_name}} turn walk-ins into regulars with a digital loyalty program that works with your existing POS.</p><p>Would you be open to a quick 30-minute walkthrough this week?</p><p>Best,<br/>{{sender_name}}<br/>Perx Technologies</p>",
      },
      {
        name: "Proposal follow-up",
        channel: "EMAIL",
        subject: "Following up on the Perx proposal for {{merchant_name}}",
        body: "<p>Hi {{contact_first_name}},</p><p>Just checking in on the proposal we shared for {{merchant_name}}. Happy to answer any questions or adjust the package.</p><p>Best,<br/>{{sender_name}}</p>",
      },
      {
        name: "Meeting reminder (SMS)",
        channel: "SMS",
        body: "Hi {{contact_first_name}}, reminder of your meeting with {{sender_name}} from Perx tomorrow. Reply STOP to opt out.",
      },
      {
        name: "Booking confirmation (SMS)",
        channel: "SMS",
        body: "Hi {{booker_name}}, your meeting with {{host_name}} (Perx) is confirmed for {{meeting_time}}. Reply STOP to opt out.",
      },
    ],
  });

  console.log("Seed complete.");
  console.log(`  Users: admin@perx.mv, hassan@perx.mv, mariyam@perx.mv (password: ${DEMO_PASSWORD})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
