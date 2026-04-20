const DEV_SESSION_SECRET = "homelabshare-dev-secret-change-me";

export function getSessionSecret() {
  const configured = process.env.SESSION_SECRET;

  if (process.env.NODE_ENV === "production") {
    if (!configured || configured.length < 32) {
      throw new Error("SESSION_SECRET must be set and at least 32 characters in production.");
    }

    return configured;
  }

  return configured ?? DEV_SESSION_SECRET;
}
