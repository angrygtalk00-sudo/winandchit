export function normalizeYouTubeEmbedUrl(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  const iframeMatch = trimmed.match(/src\s*=\s*["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1]) {
    candidate = iframeMatch[1];
  }

  let url;
  try {
    url = new URL(candidate);
  } catch (error) {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const youtubeHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'];

  if (!youtubeHosts.includes(host) && !host.endsWith('.youtube.com') && !host.endsWith('.youtu.be')) {
    return null;
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);
  let videoId = url.searchParams.get('v') || '';

  if (!videoId && pathSegments.length > 0) {
    const embedIndex = pathSegments.findIndex(segment => segment === 'embed' || segment === 'shorts' || segment === 'live');
    if (embedIndex >= 0 && pathSegments[embedIndex + 1]) {
      videoId = pathSegments[embedIndex + 1];
    } else if (host === 'youtu.be' || host === 'www.youtu.be') {
      videoId = pathSegments[0] || '';
    }
  }

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return null;
  }

  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
  embedUrl.searchParams.set('rel', '0');
  return embedUrl.toString();
}
