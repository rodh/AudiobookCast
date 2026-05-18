const express = require('express');
const path = require('path');
const fs = require('fs');

const { scanLibrary } = require('./lib/library');
const { buildFeed } = require('./lib/rss');
const { buildNavigation, buildAllBooks, buildBookFeed } = require('./lib/opds');
const { loadCache, saveCache, mergeMetadata } = require('./lib/cache');
const { enrichBooks } = require('./lib/enrich');

const app = express();
const PORT = process.env.PORT || 4500;
const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || path.join(__dirname, 'audiobooks');
const HOSTNAME = process.env.HOSTNAME || `http://localhost:${PORT}`;
const DATA_DIR = path.join(__dirname, 'data');

let library = { books: {} };
let metadataCache = {};

// --- Startup ---

function writeLibraryJson() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_DIR, 'library.json'),
      JSON.stringify(library, null, 2)
    );
  } catch (err) {
    console.error('Failed to write library.json:', err.message);
  }
}

async function init() {
  library = await scanLibrary(AUDIOBOOKS_PATH);
  const count = Object.keys(library.books).length;
  console.log(`Scanned ${count} audiobook(s)`);

  // Load cache and merge metadata
  metadataCache = loadCache(DATA_DIR);
  const { cache, needsEnrichment } = mergeMetadata(library.books, metadataCache);
  metadataCache = cache;
  saveCache(DATA_DIR, metadataCache);

  writeLibraryJson();

  // Watch for top-level directory changes (debounced)
  let debounceTimer = null;
  try {
    fs.watch(AUDIOBOOKS_PATH, (eventType, filename) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        console.log('Audiobooks directory changed, rescanning...');
        library = await scanLibrary(AUDIOBOOKS_PATH);
        const { cache } = mergeMetadata(library.books, metadataCache);
        metadataCache = cache;
        saveCache(DATA_DIR, metadataCache);
        console.log(`Rescan complete: ${Object.keys(library.books).length} book(s)`);
        writeLibraryJson();
        enrichBooks(library.books, metadataCache, DATA_DIR).catch(() => {});
      }, 2000);
    });
  } catch (err) {
    console.error('Could not watch audiobooks directory:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`AudiobookCast running at ${HOSTNAME}`);
  });

  // Background enrichment for books missing metadata
  if (needsEnrichment.length) {
    enrichBooks(library.books, metadataCache, DATA_DIR).catch(err => {
      console.error('Enrichment error:', err.message);
    });
  }
}

// --- Static ---

app.use(express.static('public'));

// --- API ---

app.get('/api/books', (req, res) => {
  let books = Object.values(library.books)
    .map(b => ({
      id: b.id,
      title: b.title,
      author: b.author || null,
      tags: b.tags || [],
      year: b.year || null,
      totalDuration: b.totalDuration || 0,
      hasCover: b.hasCover,
      fileCount: b.files.length,
      addedAt: b.addedAt
    }));

  // Search filter
  const q = (req.query.q || '').toLowerCase().trim();
  if (q) {
    books = books.filter(b =>
      b.title.toLowerCase().includes(q) ||
      (b.author && b.author.toLowerCase().includes(q))
    );
  }

  // Tag filter
  const tag = req.query.tag;
  if (tag) {
    books = books.filter(b => b.tags.some(t => t.toLowerCase() === tag.toLowerCase()));
  }

  // Sort
  const sort = req.query.sort || 'added';
  if (sort === 'title') {
    books.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === 'duration') {
    books.sort((a, b) => b.totalDuration - a.totalDuration);
  } else {
    books.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  }

  res.json(books);
});

app.get('/api/tags', (req, res) => {
  const counts = {};
  for (const book of Object.values(library.books)) {
    for (const tag of (book.tags || [])) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  const tags = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  res.json(tags);
});

app.post('/api/rescan', async (req, res) => {
  library = await scanLibrary(AUDIOBOOKS_PATH);
  const { cache } = mergeMetadata(library.books, metadataCache);
  metadataCache = cache;
  saveCache(DATA_DIR, metadataCache);
  const count = Object.keys(library.books).length;
  console.log(`Manual rescan: ${count} book(s)`);
  writeLibraryJson();
  enrichBooks(library.books, metadataCache, DATA_DIR).catch(() => {});
  res.json({ ok: true, count });
});

// --- Book routes ---

app.get('/books/:id/feed', (req, res) => {
  const book = library.books[req.params.id];
  if (!book) return res.status(404).send('Book not found');

  const hostname = HOSTNAME.replace(/\/$/, '');
  res.set('Content-Type', 'text/xml');
  res.send(buildFeed(book, hostname));
});

app.get('/books/:id/cover', (req, res) => {
  const book = library.books[req.params.id];
  if (!book || !book.hasCover) return res.status(404).send('Cover not found');

  const coverPath = path.join(AUDIOBOOKS_PATH, book.coverFolder, book.coverFile);
  res.sendFile(coverPath);
});

app.get('/books/:id/files/:index', (req, res) => {
  const book = library.books[req.params.id];
  if (!book) return res.status(404).send('Book not found');

  const file = book.files[parseInt(req.params.index, 10)];
  if (!file) return res.status(404).send('File not found');

  const filePath = path.join(AUDIOBOOKS_PATH, file.folder, file.filename);
  res.sendFile(filePath);
});

// --- OPDS ---

app.get('/opds', (req, res) => {
  const hostname = HOSTNAME.replace(/\/$/, '');
  res.set('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=navigation');
  res.send(buildNavigation(hostname));
});

app.get('/opds/all', (req, res) => {
  const hostname = HOSTNAME.replace(/\/$/, '');
  res.set('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=acquisition');
  res.send(buildAllBooks(library.books, hostname));
});

app.get('/opds/books/:id', (req, res) => {
  const book = library.books[req.params.id];
  if (!book) return res.status(404).send('Book not found');

  const hostname = HOSTNAME.replace(/\/$/, '');
  res.set('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=acquisition');
  res.send(buildBookFeed(book, hostname));
});

// --- Start ---

init().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
