import { jest, test, expect } from "@jest/globals";

test("Jest ESM mock boundary", async () => {
  jest.unstable_mockModule("../value.mjs", () => ({ value: 4 }));
  const { value } = await import("../value.mjs");
  expect(value).toBe(4);
});
