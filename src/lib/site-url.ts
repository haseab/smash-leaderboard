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

export function getSiteUrl(): string | null {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();

  if (!configuredUrl) {
    return null;
  }

  return trimTrailingSlash(ensureProtocol(configuredUrl));
}

export function normalizeAppUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const siteUrl = getSiteUrl();
  if (!/^https?:\/\//i.test(url)) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    if (siteUrl && LEGACY_APP_HOSTS.has(parsedUrl.hostname)) {
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
