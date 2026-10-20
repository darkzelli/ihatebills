import { describe, expect, it } from "vitest";
import { updateEndpoint } from "./updates";

const FEED = "https://github.com/me/ihatebills/releases/latest/download/latest.json";

describe("updateEndpoint", () => {
  it("accepts the usual ways of writing a GitHub repo", () => {
    for (const s of [
      "me/ihatebills",
      "github.com/me/ihatebills",
      "https://github.com/me/ihatebills",
      "https://www.github.com/me/ihatebills/",
      "https://github.com/me/ihatebills.git",
      "https://github.com/me/ihatebills/tree/main/src",
      "  https://github.com/me/ihatebills/releases  ",
    ]) expect(updateEndpoint(s), s).toBe(FEED);
  });

  it("passes a direct https latest.json link through", () => {
    expect(updateEndpoint("https://example.com/app/latest.json")).toBe("https://example.com/app/latest.json");
  });

  it("rejects things that aren't a repo", () => {
    for (const s of ["", "me", "http://example.com/latest.json", "https://gitlab.com/me/app", "me/bad name", "../x/y"]) {
      expect(updateEndpoint(s), s).toBeNull();
    }
  });
});
