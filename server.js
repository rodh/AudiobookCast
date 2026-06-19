const express = require('express');
const path = require('path');
const fs = require('fs');

// Load .env if present (env vars from Docker/Unraid take precedence)
const envPath = path.join(__dirname, '.env');
try {
  const envFile = fs.readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([^#=]+)=(.+)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
} catch {}

const { scanLibrary } = require('./lib/library');
const { buildFeed } = require('./lib/rss');
const { buildNavigation, buildAllBooks, buildBookFeed } = require('./lib/opds');
const { loadCache, saveCache, mergeMetadata, loadTags, mergeTags } = require('./lib/cache');
const { enrichBooks } = require('./lib/enrich');
const { categorizeBooks } = require('./lib/categorize');

const app = express();
app.use(express.json());
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

// Load the library persisted from a previous run so we can serve it immediately on
// startup, before the (potentially slow, network-mounted) filesystem scan finishes.
function loadPersistedLibrary() {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'library.json'), 'utf8'));
    if (saved && saved.books) {
      library = saved;
      console.log(`Loaded ${Object.keys(library.books).length} audiobook(s) from cache`);
    }
  } catch {
    // First run (or unreadable cache): start empty; the initial scan will populate it.
  }
}

// Full scan + metadata/tag merge, then atomically swap it in. Shared by the initial
// background scan, the directory watcher, and the manual /api/rescan endpoint.
async function refreshLibrary(reason) {
  const scanned = await scanLibrary(AUDIOBOOKS_PATH);
  const { cache, needsEnrichment } = mergeMetadata(scanned.books, metadataCache);
  metadataCache = cache;
  saveCache(DATA_DIR, metadataCache);
  mergeTags(scanned.books, loadTags(DATA_DIR));
  library = scanned;
  console.log(`${reason}: ${Object.keys(library.books).length} audiobook(s)`);
  writeLibraryJson();
  if (needsEnrichment && needsEnrichment.length) {
    enrichBooks(library.books, metadataCache, DATA_DIR).catch(err => {
      console.error('Enrichment error:', err.message);
    });
  }
}

async function init() {
  // Serve last-known data right away, then refresh in the background. A cold start —
  // including a scale-to-zero wake — answers immediately instead of blocking on a full
  // library scan over the network mount.
  loadPersistedLibrary();
  metadataCache = loadCache(DATA_DIR);

  app.listen(PORT, () => {
    console.log(`AudiobookCast running at ${HOSTNAME}`);
  });

  // Watch for top-level directory changes (debounced) and rescan in the background.
  let debounceTimer = null;
  try {
    fs.watch(AUDIOBOOKS_PATH, (eventType, filename) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshLibrary('Rescan complete').catch(err => console.error('Rescan failed:', err.message));
      }, 2000);
    });
  } catch (err) {
    console.error('Could not watch audiobooks directory:', err.message);
  }

  // Initial scan to pick up anything that changed while we were asleep/down.
  refreshLibrary('Scanned').catch(err => console.error('Initial scan failed:', err.message));
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

app.get('/api/categories', (req, res) => {
  const { CATEGORIES } = require('./lib/categorize');
  res.json(CATEGORIES);
});

app.put('/api/books/:id/tags', (req, res) => {
  const book = library.books[req.params.id];
  if (!book) return res.status(404).json({ error: 'Book not found' });

  const { tags } = req.body;
  if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });

  const { CATEGORIES, saveTagsFile } = require('./lib/categorize');
  const validCategories = new Set(CATEGORIES);
  const validTags = tags.filter(t => validCategories.has(t));

  // Update tags.json
  const allTags = loadTags(DATA_DIR);
  allTags[book.id] = { title: book.title, tags: validTags };
  saveTagsFile(DATA_DIR, allTags);

  // Update in-memory library
  book.tags = validTags;

  res.json({ ok: true, tags: validTags });
});

app.get('/api/categorize', async (req, res) => {
  if (!process.env.OMLX_API_KEY) {
    return res.status(500).json({ error: 'OMLX_API_KEY not configured' });
  }
  try {
    const force = req.query.force === '1';
    const result = await categorizeBooks(library.books, DATA_DIR, { force });
    // Reload tags into running library
    mergeTags(library.books, loadTags(DATA_DIR));
    res.json(result);
  } catch (err) {
    console.error('Categorization failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rescan', async (req, res) => {
  await refreshLibrary('Manual rescan');
  res.json({ ok: true, count: Object.keys(library.books).length });
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
