const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4500;

const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || path.join(__dirname, 'audiobooks');

const HOSTNAME = process.env.HOSTNAME || 'http://localhost:4500';

app.use(express.static('public'));

function cleanInput(input) {
  const search = [
    /<script[^>]*?>.*?<\/script>/si,
    /<[\/\!]*?[^<>]*?>/si,
    /<style[^>]*?>.*?<\/style>/si,
    /<![\s\S]*?--[ \t\n\r]*>/g
  ];
  return search.reduce((out, reg) => out.replace(reg, ''), input);
}

function clean(string) {
  return string.replace(/[^A-Za-z0-9\-]/g, '');
}

function createPermalink(title) {
  return title
    .trim()
    .replace(/ /g, '-')
    .replace(/[^A-Za-z0-9\-()\[\]]/g, '')
    .toLowerCase();
}

function collapseSpacesBeforeBracket(str) {
  return str.replace(/\s+\[/g, ' [');
}

function normalizeFileName(str) {
  return str.replace(/\s+\[/g, ' [');
}

function getAudioFiles(dirPath) {
  const allowedExt = ['.mp4', '.MP4', '.mp3', '.MP3'];
  const files = [];

  if (!fs.existsSync(dirPath)) return files;

  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const ext = path.extname(item);
    if (!allowedExt.includes(ext)) continue;
    files.push({ name: item });
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

app.get('/feed/:book', (req, res) => {
  const safeName = cleanInput(req.params.book);
  let actualBookName = null;

  const items = fs.readdirSync(AUDIOBOOKS_PATH);
  for (const item of items) {
    const itemPath = path.join(AUDIOBOOKS_PATH, item);
    if (fs.statSync(itemPath).isDirectory() && createPermalink(item) === safeName) {
      actualBookName = item;
      break;
    }
  }

  if (!actualBookName) {
    return res.status(404).send('Book not found');
  }

  const bookPath = path.join(AUDIOBOOKS_PATH, actualBookName);

  res.set('Content-Type', 'text/xml');

  const feedTitle = safeName
    .replace(/\(Unabridged\)/gi, '')
    .replace(/\[/g, '')
    .replace(/\]/g, '')
    .replace(/- MP3/gi, '')
    .replace(/File/gi, '-')
    .trim();

  const coverName = safeName + '.jpg';
  const files = getAudioFiles(bookPath);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${feedTitle}</title>
    <link>${HOSTNAME}</link>
    <description>Feed created to sync the audio book ${feedTitle}.</description>
    <language>en-us</language>
    <image>
      <url>${HOSTNAME}/audiobooks/${encodeURIComponent(actualBookName).replace(/\[/g, '%5B').replace(/\]/g, '%5D')}/cover.jpg</url>
      <title>Podcast Generator Demo</title>
      <link>${HOSTNAME}</link>
    </image>
`;

  for (const file of files) {
    const cleanName = file.name
      .replace(/\(Unabridged\)/gi, '')
      .replace(/\.mp3/gi, '')
      .replace(/\[/g, '')
      .replace(/\]/g, '')
      .replace(/File/gi, '-')
      .trim();

    const urlString = `${HOSTNAME}/audiobooks/${encodeURIComponent(actualBookName).replace(/\[/g, '%5B').replace(/\]/g, '%5D')}/${encodeURIComponent(normalizeFileName(file.name)).replace(/\[/g, '%5B').replace(/\]/g, '%5D')}`;
    const guid = Buffer.from(file.name).toString('base64');

    xml += `    <item>
      <title>${cleanName}</title>
      <description></description>
      <guid>${guid}</guid>
      <enclosure url="${urlString}" length="0" type="audio/mpeg"/>
    </item>
`;
  }

  xml += `  </channel>
</rss>`;

  res.send(xml);
});

app.get('/covers/:name', (req, res) => {
  const safeName = req.params.name.replace('.jpg', '');
  const items = fs.readdirSync(AUDIOBOOKS_PATH);

  for (const item of items) {
    const itemPath = path.join(AUDIOBOOKS_PATH, item);
    if (fs.statSync(itemPath).isDirectory() && createPermalink(item) === safeName) {
      const coverInFolder = path.join(itemPath, 'cover.jpg');
      if (fs.existsSync(coverInFolder)) {
        res.sendFile(coverInFolder);
        return;
      }
    }
  }

  res.status(404).send('Cover not found');
});

app.get('/api/books', (req, res) => {
  if (!fs.existsSync(AUDIOBOOKS_PATH)) {
    return res.json([]);
  }

  const books = [];
  const items = fs.readdirSync(AUDIOBOOKS_PATH);

  for (const item of items) {
    const itemPath = path.join(AUDIOBOOKS_PATH, item);
    if (fs.statSync(itemPath).isDirectory()) {
      const mtime = fs.statSync(itemPath).mtime.getTime();
      books.push({
        name: item,
        safename: createPermalink(item),
        mtime: mtime
      });
    }
  }

  books.sort((a, b) => b.mtime - a.mtime);
  res.json(books);
});

app.use('/audiobooks', express.static(AUDIOBOOKS_PATH));

app.listen(PORT, () => {
  console.log(`Audiobook server running at ${HOSTNAME}`);
});