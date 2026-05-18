#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const TAGS_FILE = path.join(DATA_DIR, 'tags.json');

const OMLX_URL = process.env.OMLX_URL || 'https://omlx.howlab.us/v1';
const OMLX_API_KEY = process.env.OMLX_API_KEY;
const OMLX_MODEL = process.env.OMLX_MODEL || '';

const CATEGORIES = [
  'Science Fiction', 'Fantasy', 'Mystery & Thriller', 'Horror',
  'Literary Fiction', 'Historical Fiction', 'Romance',
  'History', 'Biography & Memoir', 'Science & Nature',
  'Business & Finance', 'Self-Help', 'Philosophy',
  'True Crime', 'Politics & Society', 'Humor'
];

async function main() {
  if (!OMLX_API_KEY) {
    console.error('Set OMLX_API_KEY environment variable (or in .env file)');
    process.exit(1);
  }

  // Load .env if present
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }

  // Read library
  if (!fs.existsSync(LIBRARY_FILE)) {
    console.error('data/library.json not found. Start the server first to generate it.');
    process.exit(1);
  }

  const library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
  const books = Object.values(library.books);

  if (!books.length) {
    console.error('No books found in library.');
    process.exit(1);
  }

  // Load existing tags to skip already-categorized books
  let existing = {};
  if (fs.existsSync(TAGS_FILE)) {
    existing = JSON.parse(fs.readFileSync(TAGS_FILE, 'utf8'));
  }

  const uncategorized = books.filter(b => !existing[b.id] || !existing[b.id].tags.length);

  if (!uncategorized.length) {
    console.log('All books already categorized. Delete data/tags.json to re-categorize.');
    return;
  }

  console.log(`Categorizing ${uncategorized.length} book(s) via LLM...`);

  const bookList = uncategorized.map(b => `- [${b.id}] ${b.title}`).join('\n');

  const prompt = `You are a librarian categorizing audiobooks. For each book below, assign 1-2 categories from this exact list:

${CATEGORIES.join(', ')}

Books:
${bookList}

Respond with ONLY a JSON object mapping each book ID to an array of categories. No explanation, no markdown, just the JSON. Example format:
{"abc12345": ["Science Fiction"], "def67890": ["History", "Biography & Memoir"]}`;

  const body = {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  };
  if (OMLX_MODEL) body.model = OMLX_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  let response;
  try {
    response = await fetch(`${OMLX_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OMLX_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    console.error('API request failed:', err.message);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(`API error ${response.status}: ${text}`);
    process.exit(1);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.error('Empty response from LLM');
    process.exit(1);
  }

  // Parse JSON — strip markdown code fences if present
  const jsonStr = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();

  let categories;
  try {
    categories = JSON.parse(jsonStr);
  } catch (err) {
    console.error('Failed to parse LLM response as JSON:', err.message);
    console.error('Raw response:', content);
    process.exit(1);
  }

  // Validate and merge into tags file
  const validCategories = new Set(CATEGORIES);
  let categorized = 0;

  for (const [id, tags] of Object.entries(categories)) {
    const book = books.find(b => b.id === id);
    if (!book) continue;

    const validTags = (Array.isArray(tags) ? tags : []).filter(t => validCategories.has(t));

    existing[id] = {
      title: book.title,
      tags: validTags
    };

    if (validTags.length) categorized++;
  }

  // Ensure all books are in the file (even uncategorized ones)
  for (const book of books) {
    if (!existing[book.id]) {
      existing[book.id] = { title: book.title, tags: [] };
    }
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TAGS_FILE, JSON.stringify(existing, null, 2));

  console.log(`Done. ${categorized}/${uncategorized.length} books categorized.`);
  console.log(`Tags saved to data/tags.json — review and edit as needed.`);
  console.log('Restart the server to pick up the changes.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
