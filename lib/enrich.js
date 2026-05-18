const { saveCache } = require('./cache');

const NOISE_SUBJECTS = new Set([
  'accessible book', 'protected daisy', 'in library', 'lending library',
  'internet archive wishlist', 'long now', 'overdrive', 'fiction',
  'nonfiction', 'large type books', 'audiobooks', 'audiobook',
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOpenLibrary(title) {
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.docs || !data.docs.length) return null;

    const doc = data.docs[0];
    const author = doc.author_name ? doc.author_name[0] : null;
    const year = doc.first_publish_year || null;
    const tags = (doc.subject || [])
      .filter(s => !NOISE_SUBJECTS.has(s.toLowerCase()))
      .slice(0, 5);

    return { author, tags, year };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichBooks(books, cache, dataDir) {
  const ids = Object.values(books)
    .filter(b => !b.author && (!cache[b.id] || cache[b.id].source !== 'not-found'))
    .map(b => b.id);

  if (!ids.length) return;

  console.log(`Enriching ${ids.length} book(s) via Open Library...`);

  for (const id of ids) {
    const book = books[id];
    if (!book) continue;

    const result = await fetchOpenLibrary(book.title);

    if (result && result.author) {
      book.author = result.author;
      if (result.tags.length && !book.tags.length) book.tags = result.tags;
      if (result.year && !book.year) book.year = result.year;

      cache[id] = {
        author: result.author,
        tags: result.tags,
        year: result.year,
        source: 'openlibrary',
        enrichedAt: new Date().toISOString()
      };
      console.log(`  Enriched: ${book.title} -> ${result.author}`);
    } else {
      cache[id] = {
        author: null,
        tags: [],
        year: null,
        source: 'not-found',
        enrichedAt: new Date().toISOString()
      };
      console.log(`  Not found: ${book.title}`);
    }

    saveCache(dataDir, cache);
    await sleep(500);
  }

  console.log('Enrichment complete.');
}

module.exports = { enrichBooks };
