import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import {
  addDevTicketAttachment,
  addDevTicketComment,
  createDevTicket,
  deleteDevTicket,
  DevTicketError,
  listDevTickets,
  listDevTicketHistory,
  moveDevTicket,
  ticketKey,
} from "@/services/dev-tickets";

const suffix = `dvt-${Math.random().toString(36).slice(2, 8)}`;
let rep: SessionUser;
let dev: SessionUser;
let merchantId: string;

beforeAll(async () => {
  const [r, d] = await Promise.all([
    db.user.create({ data: { name: "Dvt Rep", email: `rep-${suffix}@t.mv`, role: "SALES_REP" } }),
    db.user.create({ data: { name: "Dvt Dev", email: `dev-${suffix}@t.mv`, role: "DEVELOPER" } }),
  ]);
  rep = { id: r.id, role: "SALES_REP", name: r.name };
  dev = { id: d.id, role: "DEVELOPER", name: d.name };
  const m = await db.merchant.create({ data: { name: `Bugged Café ${suffix}`, ownerId: r.id } });
  merchantId = m.id;
});

afterAll(async () => {
  // Notifications are fire-and-forget; give in-flight sends a beat to land,
  // then clear the EmailMessage rows they logged (FK to the test users).
  await new Promise((r) => setTimeout(r, 400));
  await db.emailMessage.deleteMany({ where: { sentById: { in: [rep.id, dev.id] } } });
  await db.devTicket.deleteMany({ where: { title: { contains: suffix } } });
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [rep.id, dev.id] } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("dev tickets", () => {
  it("files with a PERX-n key, defaults to Backlog, and links the merchant", async () => {
    const t = await createDevTicket(rep, {
      title: `Portal upload broken ${suffix}`,
      description: "iOS Safari fails on reward image upload",
      type: "BUG",
      product: "MERCHANT_PORTAL",
      priority: "HIGH",
      merchantId,
      assigneeId: dev.id,
    });
    expect(t.number).toBeGreaterThan(0);
    expect(ticketKey(t.number)).toBe(`PERX-${t.number}`);
    expect(t.status).toBe("BACKLOG");
    expect(t.merchant?.name).toContain("Bugged Café");
    expect(t.assignee?.id).toBe(dev.id);
  });

  it("numbers are unique under concurrent filing", async () => {
    const made = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createDevTicket(rep, {
          title: `Race ${i} ${suffix}`,
          type: "IMPROVEMENT",
          product: "CRM",
          priority: "LOW",
        })
      )
    );
    const numbers = made.map((t) => t.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("walks the workflow, stamps resolvedAt only at the end, and records history", async () => {
    const t = await createDevTicket(rep, {
      title: `Workflow walk ${suffix}`,
      type: "FEATURE",
      product: "PERX_APP",
      priority: "MEDIUM",
    });
    await moveDevTicket(dev, t.id, "TODO");
    await moveDevTicket(dev, t.id, "IN_PROGRESS");
    const testing = await moveDevTicket(dev, t.id, "TESTING");
    expect(testing.resolvedAt).toBeNull();
    const done = await moveDevTicket(rep, t.id, "DONE");
    expect(done.resolvedAt).not.toBeNull();

    const history = await listDevTicketHistory(t.id);
    const statusMoves = history.filter((h) => h.action === "dev_ticket.status");
    expect(statusMoves.length).toBe(4);
  });

  it("comments attach to the ticket in order", async () => {
    const t = await createDevTicket(rep, {
      title: `Comment thread ${suffix}`,
      type: "BUG",
      product: "CRM",
      priority: "LOW",
    });
    await addDevTicketComment(dev, t.id, "Can you attach the console error?");
    await addDevTicketComment(rep, t.id, "Attached now.");
    const full = await db.devTicket.findUnique({
      where: { id: t.id },
      include: { comments: { orderBy: { createdAt: "asc" } } },
    });
    expect(full?.comments.map((c) => c.authorId)).toEqual([dev.id, rep.id]);
  });

  it("rejects oversized and wrong-type attachments, accepts a PNG", async () => {
    const t = await createDevTicket(rep, {
      title: `Attach ${suffix}`,
      type: "BUG",
      product: "MERCHANT_PORTAL",
      priority: "MEDIUM",
    });
    await expect(
      addDevTicketAttachment(rep, t.id, {
        filename: "huge.png",
        contentType: "image/png",
        data: Buffer.alloc(6 * 1024 * 1024),
      })
    ).rejects.toThrow(DevTicketError);
    await expect(
      addDevTicketAttachment(rep, t.id, {
        filename: "script.exe",
        contentType: "application/x-msdownload",
        data: Buffer.from("nope"),
      })
    ).rejects.toThrow(DevTicketError);
    const ok = await addDevTicketAttachment(rep, t.id, {
      filename: "shot.png",
      contentType: "image/png",
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    expect(ok.id).toBeTruthy();
  });

  it("only the reporter or an admin may delete; Won't do is the close path", async () => {
    const t = await createDevTicket(rep, {
      title: `Delete rights ${suffix}`,
      type: "IMPROVEMENT",
      product: "CRM",
      priority: "LOW",
    });
    await expect(deleteDevTicket(dev, t.id)).rejects.toThrow(DevTicketError);
    await deleteDevTicket(rep, t.id); // reporter can
  });

  it("the mine filter returns reported-by and assigned-to", async () => {
    const t = await createDevTicket(rep, {
      title: `Mine filter ${suffix}`,
      type: "BUG",
      product: "CRM",
      priority: "LOW",
      assigneeId: dev.id,
    });
    const repMine = await listDevTickets(rep, { mine: true });
    const devMine = await listDevTickets(dev, { mine: true });
    expect(repMine.some((x) => x.id === t.id)).toBe(true); // reporter
    expect(devMine.some((x) => x.id === t.id)).toBe(true); // assignee
  });
});
