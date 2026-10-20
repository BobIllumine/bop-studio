import { describe, expect, it } from "vitest";

import { safeReturnPath } from "../auth";

describe("the page a sign-in returns to", () => {
  const origin = "https://studio.example";

  it("keeps paths on this origin", () => {
    expect(safeReturnPath("/jobs/abc?tab=files", origin)).toBe("/jobs/abc?tab=files");
  });

  it.each(["//evil.example/x", "/\\evil.example", "https://evil.example/", "javascript:alert(1)"])(
    "refuses %s",
    (returnTo) => expect(safeReturnPath(returnTo, origin)).toBe("/"),
  );

  it("falls back to the start page without a target", () => {
    expect(safeReturnPath(undefined, origin)).toBe("/");
  });
});
