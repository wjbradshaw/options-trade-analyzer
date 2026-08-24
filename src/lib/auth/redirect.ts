export const safeRedirectPath = (requestedPath: string | null): string =>
  requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath
    : "/";
