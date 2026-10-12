const IMAGE_HOST_BASE_URL = (process.env.IMAGE_HOST_BASE_URL || 'https://cloud.allinonechat.website').replace(/\/+$/, '');

function getApiKey() {
  const apiKey = (process.env.IMAGE_HOST_API_KEY || '').trim();
  if (!apiKey) throw new Error('Image hosting is not configured');
  return apiKey;
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Image hosting request failed (${response.status})`);
  }
  return body;
}

async function uploadImage({ buffer, filename, mimetype, folder }) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Invalid image buffer');

  const form = new FormData();
  form.append('image', new Blob([buffer], { type: mimetype || 'application/octet-stream' }), filename || 'image');
  const url = new URL(`${IMAGE_HOST_BASE_URL}/api/upload`);
  if (folder) url.searchParams.set('folder', folder);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-API-Key': getApiKey() },
    body: form
  });
  const result = await readResponse(response);
  if (typeof result.url !== 'string' || !result.url) {
    throw new Error('Image hosting response did not include a URL');
  }
  return result;
}

async function listImages({ folder, skip = 0, limit = 50 } = {}) {
  const url = new URL(`${IMAGE_HOST_BASE_URL}/api/images`);
  if (folder) url.searchParams.set('folder', folder);
  url.searchParams.set('skip', String(skip));
  url.searchParams.set('limit', String(Math.min(100, limit)));
  const response = await fetch(url, { headers: { 'X-API-Key': getApiKey() } });
  return readResponse(response);
}

async function listFolders() {
  const response = await fetch(`${IMAGE_HOST_BASE_URL}/api/folders`, {
    headers: { 'X-API-Key': getApiKey() }
  });
  return readResponse(response);
}

function getImageId(imageUrlOrId) {
  if (typeof imageUrlOrId !== 'string' || !imageUrlOrId.trim()) return null;
  const value = imageUrlOrId.trim();
  if (/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) return value;

  try {
    const url = new URL(value, IMAGE_HOST_BASE_URL);
    const match = url.pathname.match(/\/api\/files\/([^/]+)\/?$/i);
    return match ? decodeURIComponent(match[1]) : null;
  } catch (err) {
    return null;
  }
}

async function deleteImage(imageUrlOrId) {
  const id = getImageId(imageUrlOrId);
  if (!id) return { deleted: false, skipped: true };

  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await fetch(`${IMAGE_HOST_BASE_URL}/api/images/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': getApiKey() }
      });
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise(resolve => setTimeout(resolve, attempt * 250));
      continue;
    }

    const body = await response.json().catch(() => ({}));
    if (response.status === 404) return { id, deleted: false, notFound: true };
    if (response.status >= 500 && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, attempt * 250));
      continue;
    }
    if (!response.ok) {
      throw new Error(body.error || `Image deletion failed (${response.status})`);
    }
    return { id, deleted: true, ...body };
  }
  throw new Error('Image deletion failed after retries');
}

async function deleteImages(imageUrlsOrIds) {
  const uniqueIds = [...new Set((imageUrlsOrIds || []).map(getImageId).filter(Boolean))];
  const results = await Promise.allSettled(uniqueIds.map(deleteImage));
  return results.map((result, index) => ({
    id: uniqueIds[index],
    ...(result.status === 'fulfilled'
      ? result.value
      : { deleted: false, error: result.reason?.message || 'Image deletion failed' })
  }));
}

module.exports = { uploadImage, listImages, listFolders, getImageId, deleteImage, deleteImages };