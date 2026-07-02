const SYMBOLS: Record<string, string> = {
  USD: "$",
  BDT: "৳",
  EUR: "€",
  GBP: "£",
  INR: "₹",
};

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

export function formatCents(cents: number, currencyCode: string): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100).toLocaleString("en-US");
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${currencySymbol(currencyCode)}${units}.${fraction}`;
}

/** Format hours for display: 7.25 → "7.25h", 8 → "8h". */
export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(2))}h`;
}
