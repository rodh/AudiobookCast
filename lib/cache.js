const fs = require('fs');
const path = require('path');

const CACHE_FILE = 'metadata-cache.json';

function loadCache(dataDir) {
  try {
    const raw = fs.readFileSync(path.join(dataDir, CACHE_FILE), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCache(dataDir, cache) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, CACHE_FILE),
    JSON.stringify(cache, null, 2)
  );
}

function mergeMetadata(books, cache) {
  const needsEnrichment = [];

  for (const book of Object.values(books)) {
    const cached = cache[book.id];

    if (cached) {
      // Cache wins for non-null fields
      if (cached.author && !book.author) book.author = cached.author;
      if (cached.tags && cached.tags.length && !book.tags.length) book.tags = cached.tags;
      if (cached.year && !book.year) book.year = cached.year;
    } else if (book.author || book.tags.length || book.year) {
      // Populate cache from ID3 data
      cache[book.id] = {
        author: book.author,
        tags: book.tags,
        year: book.year,
        source: 'id3',
        enrichedAt: new Date().toISOString()
      };
    }

    if (!book.author) {
      needsEnrichment.push(book.id);
    }
  }

  return { books, cache, needsEnrichment };
}

module.exports = { loadCache, saveCache, mergeMetadata };
