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

const loopbackHostname = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

export const callbackOrigin = (
  requestUrl: string,
  host: string | null,
): string => {
  const requestOrigin = new URL(requestUrl);
  if (requestOrigin.hostname !== "localhost" || host === null) {
    return requestOrigin.origin;
  }

  try {
    const browserOrigin = new URL(`${requestOrigin.protocol}//${host}`);
    return loopbackHostname.test(browserOrigin.hostname)
      ? browserOrigin.origin
      : requestOrigin.origin;
  } catch {
    return requestOrigin.origin;
  }
};
