import {
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  ORCHESTRATION_PROTOCOL_VERSION,
  type ExecutionEnvironmentDescriptor,
} from "@t3tools/contracts";

import { ConnectionBlockedError } from "./model.ts";

export function orchestrationProtocolCompatibilityError(
  descriptor: ExecutionEnvironmentDescriptor,
): ConnectionBlockedError | null {
  // Servers shipped before negotiation use the original wire protocol.
  const serverProtocolVersion = descriptor.orchestrationProtocolVersion ?? 1;
  if (serverProtocolVersion === ORCHESTRATION_PROTOCOL_VERSION) {
    return null;
  }
<<<<<<< HEAD
  return new ConnectionBlockedError({
    reason: "unsupported",
    detail:
      serverProtocolVersion > ORCHESTRATION_PROTOCOL_VERSION
        ? `This client is not supported by this server. Update your app or use a compatible release to connect to ${descriptor.label}.`
        : `This client requires a newer server. Update Marcode on ${descriptor.label} to connect.`,
  });
=======
  return serverProtocolVersion > ORCHESTRATION_PROTOCOL_VERSION
    ? new ConnectionBlockedError({
        reason: "unsupported",
        detail: `This client is not supported by this server. Update your app or use a compatible release to connect to ${descriptor.label}.`,
      })
    : new ConnectionBlockedError({
        reason: "unsupported",
        detail: `This client requires a newer server. Update T3 Code on ${descriptor.label} to connect.`,
        ...(canSelfUpdate(descriptor) ? { serverUpdateRequired: true } : {}),
      });
}

function canSelfUpdate(descriptor: ExecutionEnvironmentDescriptor): boolean {
  const { serverSelfUpdate, desktopAppUpdate } = descriptor.capabilities;
  return (
    serverSelfUpdate !== undefined &&
    (serverSelfUpdate !== "desktop-managed" || desktopAppUpdate === true)
  );
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
}

export function appendOrchestrationProtocol(socketUrl: string): string {
  const url = new URL(socketUrl);
  url.searchParams.set(ORCHESTRATION_PROTOCOL_QUERY_PARAM, String(ORCHESTRATION_PROTOCOL_VERSION));
  return url.toString();
}
