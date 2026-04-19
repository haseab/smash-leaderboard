const LEGACY_APP_HOSTS = new Set([
  "smash-leaderboard-frontend.vercel.app",
  "smash-leaderboard-production.up.railway.app",
]);

function ensureProtocol(url: string): string {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url) ? url : `https://${url}`;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getSiteUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();

  return trimTrailingSlash(ensureProtocol(configuredUrl || "http://localhost:3000"));
}

export function normalizeAppUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const siteUrl = getSiteUrl();

  if (url.startsWith("/")) {
    return new URL(url, siteUrl).toString();
  }

  if (!/^https?:\/\//i.test(url)) {
    return new URL(`/${url.replace(/^\/+/, "")}`, siteUrl).toString();
  }

  try {
    const parsedUrl = new URL(url);
    if (LEGACY_APP_HOSTS.has(parsedUrl.hostname)) {
      return new URL(
        `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`,
        siteUrl
      ).toString();
    }
  } catch {
    return url;
  }

  return url;
}
