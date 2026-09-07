/**
 * Marcode-owned identity values shared by the server and clients.
 *
 * Keep upstream compatibility identifiers out of this module. Values such as
 * package names, storage keys, URI schemes, and protocol names are deliberately
 * owned by their upstream compatibility surfaces and must not be renamed here.
 */
export const MARCODE_PRODUCT_NAME = "Marcode" as const;
export const MARCODE_HOME_ENV = "MARCODE_HOME" as const;
export const MARCODE_SERVICE_NAME = "marcode" as const;
export const MARCODE_SERVICE_UNIT_FILE = `${MARCODE_SERVICE_NAME}.service` as const;

export const MARCODE_FORK_IDENTITY = {
  productName: MARCODE_PRODUCT_NAME,
  homeEnvironmentVariable: MARCODE_HOME_ENV,
  serviceName: MARCODE_SERVICE_NAME,
  serviceUnitFile: MARCODE_SERVICE_UNIT_FILE,
} as const;

export type MarcodeForkIdentity = typeof MARCODE_FORK_IDENTITY;
