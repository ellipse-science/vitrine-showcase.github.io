import { describe, expect, it } from "vitest";

import { GLOBAL_SHARE_SIZE, renderGlobalShareCard } from "@/lib/globalShareCard";

describe("renderGlobalShareCard", () => {
  it("génère une image PNG aux dimensions sociales", async () => {
    const response = await renderGlobalShareCard();
    const bytes = await response.arrayBuffer();

    expect(response.headers.get("content-type")).toBe("image/png");
    expect(GLOBAL_SHARE_SIZE).toEqual({ width: 1200, height: 630 });
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});
