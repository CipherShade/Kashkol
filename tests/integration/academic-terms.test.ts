import { afterAll, afterEach, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import { createTerm, deleteTerm, getTerm, getTerms, updateTerm } from "@/modules/terms/service";
import { currentTerm, previousTerm } from "@/modules/terms/resolution";
import { DELTA, DELTA_OWNER, NILE, ownerScope } from "./helpers";

const scope: Scope = ownerScope("Term owner");
const otherScope: Scope = {
  ...ownerScope("Other owner"),
  workspaceId: DELTA,
  actorUserId: DELTA_OWNER,
};
const createdIds: string[] = [];

function input(overrides: Partial<Parameters<typeof createTerm>[1]> = {}) {
  return {
    name: "Autumn term",
    grade: null,
    startDate: "2026-09-01",
    endDate: "2026-12-20",
    ...overrides,
  };
}

afterEach(async () => {
  for (const id of createdIds.splice(0)) {
    await withScope({ workspaceId: NILE }, (tx) =>
      tx.academicTerm.deleteMany({ where: { id, workspaceId: NILE } }),
    );
  }
});

afterAll(async () => {
  await disconnectDb();
});

describe("academic terms against PostgreSQL RLS", () => {
  it("stores workspace-wide and grade-specific terms and hides them from another workspace", async () => {
    const workspaceTerm = await createTerm(scope, input());
    const gradeTerm = await createTerm(scope, input({ name: "1A term", grade: "1A" }));
    createdIds.push(workspaceTerm.id, gradeTerm.id);

    expect(workspaceTerm.grade).toBeNull();
    expect(workspaceTerm.startDate).toBe("2026-09-01");
    expect(gradeTerm.grade).toBe("1A");

    const listed = await getTerms(scope);
    expect(listed.map((term) => term.id)).toEqual(expect.arrayContaining([workspaceTerm.id, gradeTerm.id]));
    expect(await getTerms(otherScope)).toEqual([]);

    expect(await getTerm(scope, workspaceTerm.id)).toMatchObject({ id: workspaceTerm.id });
    await expect(getTerm(otherScope, workspaceTerm.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteTerm(otherScope, workspaceTerm.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects overlapping terms in the same scope but allows a different grade", async () => {
    const first = await createTerm(scope, input());
    createdIds.push(first.id);

    await expect(
      createTerm(scope, input({ name: "Overlap", startDate: "2026-12-01", endDate: "2027-01-15" })),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "AcademicTerms.errors.overlap",
    });

    const otherGrade = await createTerm(
      scope,
      input({ name: "Different scope", grade: "2B", startDate: "2026-12-01", endDate: "2027-01-15" }),
    );
    createdIds.push(otherGrade.id);
    expect(otherGrade.grade).toBe("2B");
  });

  it("updates and deletes a term with an audited, tenant-scoped write", async () => {
    const created = await createTerm(scope, input());
    createdIds.push(created.id);

    const updated = await updateTerm(scope, created.id, input({ name: "Renamed term" }));
    expect(updated.name).toBe("Renamed term");

    const terms = await getTerms(scope);
    expect(currentTerm(terms, "2026-10-05")?.id).toBe(created.id);
    expect(previousTerm(terms, currentTerm(terms, "2026-10-05"))).toBeNull();

    await deleteTerm(scope, created.id);
    const index = createdIds.indexOf(created.id);
    if (index >= 0) createdIds.splice(index, 1);
    await expect(getTerm(scope, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await getTerms(scope).then((rows) => rows.some((row) => row.id === created.id))).toBe(false);
  });
});
