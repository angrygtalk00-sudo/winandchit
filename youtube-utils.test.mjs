import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeYouTubeEmbedUrl } from './frontend/src/utils/youtube.mjs';

test('normalizes standard YouTube watch URLs to embed URLs', () => {
  assert.equal(
    normalizeYouTubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0'
  );
});

test('normalizes youtu.be share URLs to embed URLs', () => {
  assert.equal(
    normalizeYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=10'),
    'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0'
  );
});

test('returns null for non-YouTube values', () => {
  assert.equal(normalizeYouTubeEmbedUrl('https://example.com/video'), null);
  assert.equal(normalizeYouTubeEmbedUrl(''), null);
});
