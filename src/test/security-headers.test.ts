import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS, withSecurityHeaders } from "@/lib/security-headers";

describe("response security headers", () => {
  it("sets the required protections while keeping camera and Lovable previews available", async () => {
    const response = withSecurityHeaders(new Response("ok"));

    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toBe("camera=(self), microphone=(), geolocation=()");
    expect(response.headers.get("Content-Security-Policy")).toBe(SECURITY_HEADERS["Content-Security-Policy"]);
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'self' https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com");
    expect(response.headers.get("Content-Security-Policy")).not.toMatch(/script-src|style-src|img-src/);
    expect(response.headers.has("X-Frame-Options")).toBe(false);
    expect(await response.text()).toBe("ok");
  });

  it("preserves the application status and existing headers", () => {
    const response = withSecurityHeaders(new Response(null, {
      status: 204,
      headers: { "X-Existing": "kept" },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("X-Existing")).toBe("kept");
  });
});
