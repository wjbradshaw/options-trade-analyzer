export const safeRedirectUrl = (
  requestedPath: string | null,
  trustedOrigin: string,
): URL => {
  const trustedUrl = new URL(trustedOrigin);
  const fallback = new URL("/", trustedUrl.origin);

  if (!requestedPath) return fallback;

  try {
    const candidate = new URL(requestedPath, trustedUrl.origin);
    return candidate.origin === trustedUrl.origin ? candidate : fallback;
  } catch {
    return fallback;
  }
};
