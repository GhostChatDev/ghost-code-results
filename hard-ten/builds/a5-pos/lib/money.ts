export type MoneyLine = {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  taxRateBp: number;
};

export type CalculatedLine = MoneyLine & {
  grossCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};

export type SaleTotals = {
  lines: CalculatedLine[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};

function cents(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents`);
  }
  return value;
}

export function parseCents(value: string, label = "Amount"): number {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{0,2})?$/.test(trimmed)) {
    throw new Error(`${label} must be a positive amount with at most two decimal places`);
  }
  const [dollars, fraction = ""] = trimmed.split(".");
  const result = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return cents(result, label);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

/** Round a non-negative rational cent value to the nearest cent, halves up. */
export function roundedTax(netCents: number, taxRateBp: number): number {
  cents(netCents, "Net amount");
  if (!Number.isInteger(taxRateBp) || taxRateBp < 0 || taxRateBp > 10000) {
    throw new Error("Tax rate must be between 0 and 100 percent");
  }
  // Numerators for realistic register amounts stay exact in a double; cap them explicitly.
  const numerator = netCents * taxRateBp;
  if (!Number.isSafeInteger(numerator)) throw new Error("Amount is too large");
  return Math.floor((numerator + 5000) / 10000);
}

export function calculateSale(lines: MoneyLine[], requestedDiscountCents = 0): SaleTotals {
  cents(requestedDiscountCents, "Discount");
  if (lines.length === 0) throw new Error("Add at least one product");
  const subtotalCents = lines.reduce((sum, line) => {
    cents(line.unitPriceCents, "Unit price");
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 9999) {
      throw new Error("Quantity must be between 1 and 9999");
    }
    const gross = line.quantity * line.unitPriceCents;
    cents(gross, "Line subtotal");
    return sum + gross;
  }, 0);
  cents(subtotalCents, "Subtotal");
  if (requestedDiscountCents > subtotalCents) throw new Error("Discount cannot exceed the subtotal");

  let remaining = requestedDiscountCents;
  let totalTax = 0;
  const calculated = lines.map((line, index): CalculatedLine => {
    const grossCents = line.quantity * line.unitPriceCents;
    // Floor each proportional share, then put the remaining cents on the final line.
    const discountCents = index === lines.length - 1
      ? remaining
      : Math.min(grossCents, Math.floor((requestedDiscountCents * grossCents) / subtotalCents));
    remaining -= discountCents;
    const taxCents = roundedTax(grossCents - discountCents, line.taxRateBp);
    totalTax += taxCents;
    return { ...line, grossCents, discountCents, taxCents, totalCents: grossCents - discountCents + taxCents };
  });
  return {
    lines: calculated,
    subtotalCents,
    discountCents: requestedDiscountCents,
    taxCents: totalTax,
    totalCents: subtotalCents - requestedDiscountCents + totalTax,
  };
}
