const express = require('express');
const path = require('path');
const fs = require('fs');

const { scanLibrary } = require('./lib/library');
const { buildFeed } = require('./lib/rss');
const { buildNavigation, buildAllBooks, buildBookFeed } = require('./lib/opds');

const app = express();
const PORT = process.env.PORT || 4500;
const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || path.join(__dirname, 'audiobooks');
const HOSTNAME = process.env.HOSTNAME || `http://localhost:${PORT}`;
const DATA_DIR = path.join(__dirname, 'data');

let library = { books: {} };

// --- Startup ---

async function init() {
  library = await scanLibrary(AUDIOBOOKS_PATH);
  const count = Object.keys(library.books).length;
  console.log(`Scanned ${count} audiobook(s)`);

  // Write index for debugging
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_DIR, 'library.json'),
      JSON.stringify(library, null, 2)
    );
  } catch (err) {
    console.error('Failed to write library.json:', err.message);
  }

  // Watch for top-level directory changes (debounced)
  let debounceTimer = null;
  try {
    fs.watch(AUDIOBOOKS_PATH, (eventType, filename) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        console.log('Audiobooks directory changed, rescanning...');
        library = await scanLibrary(AUDIOBOOKS_PATH);
        console.log(`Rescan complete: ${Object.keys(library.books).length} book(s)`);
        try {
          fs.writeFileSync(
            path.join(DATA_DIR, 'library.json'),
            JSON.stringify(library, null, 2)
          );
        } catch {}
      }, 2000);
    });
  } catch (err) {
    console.error('Could not watch audiobooks directory:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`AudiobookCast running at ${HOSTNAME}`);
  });
}

// --- Static ---

app.use(express.static('public'));

// --- API ---

app.get('/api/books', (req, res) => {
  const books = Object.values(library.books)
    .map(b => ({
      id: b.id,
      title: b.title,
      hasCover: b.hasCover,
      fileCount: b.files.length,
      addedAt: b.addedAt
    }))
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

  res.json(books);
});

app.post('/api/rescan', async (req, res) => {
  library = await scanLibrary(AUDIOBOOKS_PATH);
  const count = Object.keys(library.books).length;
  console.log(`Manual rescan: ${count} book(s)`);
  try {
    fs.writeFileSync(
      path.join(DATA_DIR, 'library.json'),
      JSON.stringify(library, null, 2)
    );
  } catch {}
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
