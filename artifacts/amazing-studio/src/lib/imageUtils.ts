const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function getImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/objects/") || url.startsWith("/public-objects/")) {
    return `${BASE}/api/storage${url}`;
  }
  return url;
}
