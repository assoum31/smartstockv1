import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  const router = () => createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it("matches a page for / instead of falling back to not found", () => {
    expect(router().matchRoutes("/").at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it.each(["/login", "/master", "/manager", "/worker"])("serves the public page %s", (path) => {
    expect(router().matchRoutes(path).at(-1)?.routeId).toBe(path);
  });

  it("has no public master sign-up page", () => {
    expect(router().matchRoutes("/setup").at(-1)?.routeId).not.toBe("/setup");
  });

  it("keeps the master's store view behind sign-in", () => {
    expect(router().matchRoutes("/stores/abc").at(-1)?.routeId).toBe(
      "/_authenticated/stores/$storeId",
    );
  });

  it.each(["/scan", "/dashboard", "/team", "/products", "/admin", "/settings"])(
    "keeps %s behind sign-in",
    (path) => {
      expect(router().matchRoutes(path).at(-1)?.routeId).toBe(`/_authenticated${path}`);
    },
  );
});
