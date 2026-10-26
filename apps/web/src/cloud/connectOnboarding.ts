import * as Schema from "effect/Schema";

<<<<<<< HEAD
/**
 * Accounts that opted out of the post-sign-in T3 Connect onboarding wizard
 * ("Don't show this again"). The wizard otherwise shows on every sign-in,
 * since sign-out clears the connected environments.
 */
export const CONNECT_ONBOARDING_OPT_OUT_STORAGE_KEY = "marcode:connect-onboarding-opt-out:v1";
=======
// Sign-out clears environments, so the wizard opt-out must persist separately.
export const CONNECT_ONBOARDING_OPT_OUT_STORAGE_KEY = "t3code:connect-onboarding-opt-out:v1";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7

export const ConnectOnboardingOptOutSchema = Schema.Struct({
  optOutAccounts: Schema.Array(Schema.String),
});

export type ConnectOnboardingOptOutState = typeof ConnectOnboardingOptOutSchema.Type;

export const EMPTY_CONNECT_ONBOARDING_OPT_OUT_STATE: ConnectOnboardingOptOutState = {
  optOutAccounts: [],
};
