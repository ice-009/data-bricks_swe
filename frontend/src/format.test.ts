import { describe, expect, it } from "vitest";
import { gw, gwh, isoDateLabel, minutesBetween, shiftDate, signedGw, ukTime } from "./format";

describe("format", () => {
  it("renders UK local time across the clock change", () => {
    expect(ukTime("2026-01-15T09:20:00Z")).toBe("09:20"); // GMT
    expect(ukTime("2026-07-15T08:20:00Z")).toBe("09:20"); // BST
  });

  it("formats power and energy", () => {
    expect(gw(12345)).toBe("12.3 GW");
    expect(gwh(278630)).toBe("278.6 GWh");
    expect(gw(null)).toBe("–");
  });

  it("always signs a bias", () => {
    expect(signedGw(1745.9)).toBe("+1.7 GW");
    expect(signedGw(-500)).toBe("−0.5 GW");
  });

  it("shifts dates across month boundaries", () => {
    expect(shiftDate("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftDate("2026-01-02", -1)).toBe("2026-01-01");
  });

  it("labels dates and gaps", () => {
    expect(isoDateLabel("2026-01-15")).toBe("Thu 15 Jan");
    expect(minutesBetween("2026-01-14T09:20:00Z", "2026-01-14T09:30:00Z")).toBe(10);
  });
});
