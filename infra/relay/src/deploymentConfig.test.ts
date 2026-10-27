import { describe, expect, it } from "vite-plus/test";

import {
  managedEndpointHostname,
  isManagedEndpointHostname,
  relayOwnsManagedEndpointZone,
} from "./deploymentConfig.ts";

describe("relayOwnsManagedEndpointZone", () => {
  it("keeps the shared Cloudflare zone owned by production", () => {
    expect(relayOwnsManagedEndpointZone("prod")).toBe(true);
    expect(relayOwnsManagedEndpointZone("dev_julius")).toBe(false);
  });
});

describe("managed endpoint names", () => {
<<<<<<< HEAD
  it("uses the stage slug and a stable stage-scoped digest suffix", () => {
    const hash = "ABCDEF0123456789ABCDEF0123456789";

    expect(managedEndpointDigestInput("dev_julius", "user_123", "env_123")).toBe(
      "dev_julius:user_123:env_123",
    );
    expect(managedEndpointHostname("dev_julius", ".example.com.", hash)).toBe(
      "dev-julius-abcdef0123456789.example.com",
    );
    expect(managedEndpointHostname("prod", "marcoderelay.com", hash)).toBe(
      "prod-abcdef0123456789.marcoderelay.com",
    );
    expect(managedEndpointTunnelName("dev_julius", hash)).toBe(
      "marcoderelay-managedendpoint-dev-julius-abcdef0123456789",
    );
    // -- Marcode fork seam --
    // Marcode deploys the relay under its own name, so every managed endpoint
    // tunnel is `marcoderelay-managedendpoint-*`. Upstream's literal is
    // `t3coderelay-*`; taking it here would assert a prefix that
    // MANAGED_ENDPOINT_TUNNEL_PREFIX no longer produces.
    expect(managedEndpointTunnelNamePrefix("dev_julius")).toBe(
      "marcoderelay-managedendpoint-dev-julius-",
    );
  });

=======
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  it("keeps the DNS label within the provider limit for long stage names", () => {
    const hostname = managedEndpointHostname(
      "dev_" + "x".repeat(100),
      "example.com",
      "a".repeat(64),
    );

    expect(hostname.split(".")[0]?.length).toBeLessThanOrEqual(63);
    expect(hostname).toMatch(/-a{16}\.example\.com$/);
  });

  it("rejects hostnames outside the relay zone", () => {
    expect(isManagedEndpointHostname("internal.example.net", "example.com")).toBe(false);
    expect(isManagedEndpointHostname("example.com.attacker.test", "example.com")).toBe(false);
    expect(isManagedEndpointHostname("dev-julius.example.com.", "example.com")).toBe(false);
  });
});
