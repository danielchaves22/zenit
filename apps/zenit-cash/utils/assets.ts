import api from '@/lib/api';

export function buildPublicAssetUrl(assetPath?: string | null) {
  if (!assetPath) {
    return null;
  }

  if (/^(https?:)?\/\//i.test(assetPath) || assetPath.startsWith('data:')) {
    return assetPath;
  }

  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  const baseUrl =
    typeof api.defaults.baseURL === 'string' && api.defaults.baseURL.length > 0
      ? api.defaults.baseURL
      : '/api';

  if (baseUrl.startsWith('/') && typeof window === 'undefined') {
    return normalizedPath;
  }

  try {
    const fallbackOrigin =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const resolvedBaseUrl = new URL(baseUrl, fallbackOrigin);
    return `${resolvedBaseUrl.origin}${normalizedPath}`;
  } catch {
    return normalizedPath;
  }
}
