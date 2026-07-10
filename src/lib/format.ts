import type { Currency } from "@prisma/client";

// Deal values arrive as Prisma Decimal (object), string, or number.
export function formatMoney(value: unknown, currency: Currency): string {
  const num = Number(value);
  return `${currency} ${num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
