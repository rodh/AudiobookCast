const fs = require('fs');
const path = require('path');

const TAGS_FILE = 'tags.json';

const CATEGORIES = [
  'Science Fiction', 'Fantasy', 'Mystery & Thriller', 'Horror',
  'Literary Fiction', 'Historical Fiction', 'Romance',
  'History', 'Biography & Memoir', 'Science & Nature',
  'Business & Finance', 'Self-Help', 'Philosophy',
  'True Crime', 'Politics & Society', 'Humor'
];

function loadTagsFile(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, TAGS_FILE), 'utf8'));
  } catch {
    return {};
  }
}

function saveTagsFile(dataDir, tags) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, TAGS_FILE), JSON.stringify(tags, null, 2));
}

async function categorizeBooks(books, dataDir, { force = false } = {}) {
  const apiKey = process.env.OMLX_API_KEY;
  const apiUrl = process.env.OMLX_URL || 'https://omlx.howlab.us/v1';
  const model = process.env.OMLX_MODEL || '';

  if (!apiKey) {
    throw new Error('OMLX_API_KEY environment variable not set');
  }

  const bookList = Object.values(books);
  if (!bookList.length) {
    return { categorized: 0, total: 0, message: 'No books in library' };
  }

  let existing = force ? {} : loadTagsFile(dataDir);
  const uncategorized = bookList.filter(b => !existing[b.id] || !existing[b.id].tags.length);

  if (!uncategorized.length) {
    return { categorized: 0, total: bookList.length, message: 'All books already categorized' };
  }

  console.log(`Categorizing ${uncategorized.length} book(s) via LLM...`);

  const titles = uncategorized.map(b => `- [${b.id}] ${b.title}`).join('\n');

  const prompt = `You are a librarian categorizing audiobooks. For each book below, assign 1-2 categories. You MUST only use categories from this exact list — do NOT invent new ones:

${CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

If a book doesn't fit any category well, use the closest match from the list above.

Books:
${titles}

Respond with ONLY a JSON object mapping each book ID to an array of categories. No explanation, no markdown, no extra text, just valid JSON. Example:
{"abc12345": ["Science Fiction"], "def67890": ["History", "Biography & Memoir"]}`;

  const body = {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  };
  if (model) body.model = model;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  let response;
  try {
    response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Empty response from LLM');
  }

  // Extract JSON object from response — handle code fences, trailing tokens, etc.
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON object found in LLM response.\nRaw: ${content}`);
  }

  let categories;
  try {
    categories = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(`Failed to parse LLM response: ${err.message}\nRaw: ${content}`);
  }

  // Validate and merge
  const validCategories = new Set(CATEGORIES);
  let categorized = 0;

  for (const [id, tags] of Object.entries(categories)) {
    const book = bookList.find(b => b.id === id);
    if (!book) continue;

    const validTags = (Array.isArray(tags) ? tags : []).filter(t => validCategories.has(t));
    existing[id] = { title: book.title, tags: validTags };
    if (validTags.length) categorized++;
  }

  // Ensure all books present in file
  for (const book of bookList) {
    if (!existing[book.id]) {
      existing[book.id] = { title: book.title, tags: [] };
    }
  }

  saveTagsFile(dataDir, existing);
  console.log(`Categorized ${categorized}/${uncategorized.length} books.`);

  return { categorized, total: uncategorized.length, message: 'Done' };
}

module.exports = { categorizeBooks, CATEGORIES };
