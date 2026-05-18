const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const AUDIO_EXTS = ['.mp3', '.mp4', '.m4b'];
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg'];

function groupingKey(folderName) {
  return folderName
    .replace(/\(Unabridged\)/gi, '')
    .replace(/\[File \d+ of \d+.*?\]/gi, '')
    .replace(/- MP3/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function generateId(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
}

function extractTitle(folderName) {
  return folderName
    .replace(/\(Unabridged\)/gi, '')
    .replace(/\[File \d+ of \d+.*?\]/gi, '')
    .replace(/- MP3/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFileTitle(filename) {
  return filename
    .replace(/\.\w+$/i, '')
    .replace(/\(Unabridged\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/- MP3/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPartNumber(folderName) {
  const match = folderName.match(/\[File (\d+) of (\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}

async function findCover(folderPath) {
  for (const name of COVER_NAMES) {
    try {
      await fs.access(path.join(folderPath, name));
      return name;
    } catch {}
  }
  return null;
}

async function scanLibrary(audiobooksPath) {
  const books = {};

  let entries;
  try {
    entries = await fs.readdir(audiobooksPath, { withFileTypes: true });
  } catch {
    return { books };
  }

  const folders = entries.filter(e => e.isDirectory()).map(e => e.name);

  // Group folders by grouping key
  const groups = {};
  for (const folder of folders) {
    const key = groupingKey(folder);
    if (!groups[key]) groups[key] = [];
    groups[key].push(folder);
  }

  // Sort each group by part number
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => extractPartNumber(a) - extractPartNumber(b));
  }

  for (const [key, groupFolders] of Object.entries(groups)) {
    const id = generateId(key);
    const title = extractTitle(groupFolders[0]);

    const files = [];
    let coverFile = null;
    let coverFolder = null;
    let addedAt = null;

    for (const folder of groupFolders) {
      const folderPath = path.join(audiobooksPath, folder);

      // Check for cover image (use first one found across folders)
      if (!coverFile) {
        const found = await findCover(folderPath);
        if (found) {
          coverFile = found;
          coverFolder = folder;
        }
      }

      // Track oldest folder mtime as addedAt
      const folderStat = await fs.stat(folderPath);
      if (!addedAt || folderStat.mtime < addedAt) {
        addedAt = folderStat.mtime;
      }

      // Scan audio files
      const items = await fs.readdir(folderPath);
      for (const item of items) {
        const ext = path.extname(item).toLowerCase();
        if (!AUDIO_EXTS.includes(ext)) continue;

        const filePath = path.join(folderPath, item);
        const stat = await fs.stat(filePath);

        files.push({
          filename: item,
          folder,
          title: extractFileTitle(item),
          size: stat.size,
          type: ext === '.mp3' ? 'audio/mpeg' : 'audio/mp4'
        });
      }
    }

    // Sort: folder part number first, then filename within folder
    files.sort((a, b) => {
      const partA = extractPartNumber(a.folder);
      const partB = extractPartNumber(b.folder);
      if (partA !== partB) return partA - partB;
      return a.filename.localeCompare(b.filename);
    });

    books[id] = {
      id,
      title,
      folders: groupFolders,
      hasCover: !!coverFile,
      coverFile,
      coverFolder,
      files,
      addedAt: addedAt ? addedAt.toISOString() : new Date().toISOString()
    };
  }

  return { books };
}

module.exports = { scanLibrary, generateId, groupingKey, extractTitle };
