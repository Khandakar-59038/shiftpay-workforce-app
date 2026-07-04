import { describe, expect, it } from "vitest";
import { leaveDaysInRange, paidLeaveBalance, validateLeaveRequest } from "./leave";

describe("paidLeaveBalance", () => {
  it("subtracts used days from the annual allowance", () => {
    expect(paidLeaveBalance(15, 4)).toBe(11);
  });
  it("never goes below zero", () => {
    expect(paidLeaveBalance(15, 20)).toBe(0);
  });
});

describe("leaveDaysInRange", () => {
  it("counts weekdays only", () => {
    // Fri Jul 3 → Mon Jul 6 2026
    expect(leaveDaysInRange("2026-07-03", "2026-07-06")).toBe(2);
  });
  it("clips to a period window", () => {
    expect(
      leaveDaysInRange("2026-06-29", "2026-07-03", "2026-07-01", "2026-07-31"),
    ).toBe(3); // Jul 1, 2, 3
  });
  it("returns zero when fully outside the window", () => {
    expect(
      leaveDaysInRange("2026-06-01", "2026-06-05", "2026-07-01", "2026-07-31"),
    ).toBe(0);
  });
});

describe("validateLeaveRequest", () => {
  const existing = [
    { startDate: "2026-07-06", endDate: "2026-07-07", status: "APPROVED" },
    { startDate: "2026-07-20", endDate: "2026-07-21", status: "REJECTED" },
  ];

  it("rejects end before start", () => {
    const r = validateLeaveRequest({
      type: "PAID",
      startDate: "2026-07-10",
      endDate: "2026-07-09",
      existing,
      balance: 10,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects overlap with pending/approved leave", () => {
    const r = validateLeaveRequest({
      type: "UNPAID",
      startDate: "2026-07-07",
      endDate: "2026-07-08",
      existing,
      balance: 10,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/overlap/i);
  });

  it("ignores rejected leave when checking overlap", () => {
    const r = validateLeaveRequest({
      type: "UNPAID",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
      existing,
      balance: 0,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects paid leave exceeding the balance", () => {
    const r = validateLeaveRequest({
      type: "PAID",
      startDate: "2026-07-13", // Mon–Wed = 3 weekdays
      endDate: "2026-07-15",
      existing,
      balance: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/balance/i);
  });

  it("allows unpaid leave regardless of balance", () => {
    const r = validateLeaveRequest({
      type: "UNPAID",
      startDate: "2026-07-13",
      endDate: "2026-07-17",
      existing,
      balance: 0,
    });
    expect(r.ok).toBe(true);
  });

  it("checks sick leave against its own balance", () => {
    const r = validateLeaveRequest({
      type: "SICK",
      startDate: "2026-07-13",
      endDate: "2026-07-15", // 3 weekdays
      existing,
      balance: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sick/i);
  });

  it("allows valid paid leave within balance", () => {
    const r = validateLeaveRequest({
      type: "PAID",
      startDate: "2026-07-13",
      endDate: "2026-07-14",
      existing,
      balance: 2,
    });
    expect(r.ok).toBe(true);
  });
});
