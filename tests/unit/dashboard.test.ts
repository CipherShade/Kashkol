import { describe, expect, it } from "vitest";
import { dashboardFilterSchema } from "@/modules/dashboard/schemas";

describe("dashboardFilterSchema", () => {
  it("defaults period to this_month", () => {
    const result = dashboardFilterSchema.parse({});
    expect(result.period).toBe("this_month");
  });

  it("accepts valid periods", () => {
    expect(dashboardFilterSchema.parse({ period: "today" }).period).toBe("today");
    expect(dashboardFilterSchema.parse({ period: "this_week" }).period).toBe("this_week");
    expect(dashboardFilterSchema.parse({ period: "this_month" }).period).toBe("this_month");
    expect(dashboardFilterSchema.parse({ period: "all" }).period).toBe("all");
  });

  it("rejects invalid period", () => {
    expect(() => dashboardFilterSchema.parse({ period: "invalid_period" })).toThrow();
  });

  it("accepts optional groupId uuid", () => {
    const uuid = "018d4567-e89b-7123-a456-426614174000";
    expect(dashboardFilterSchema.parse({ groupId: uuid }).groupId).toBe(uuid);
  });
});
