# Tag Editing Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to edit book tags/categories via a modal UI triggered from each book card.

**Architecture:** Add a PUT endpoint for updating tags per book. Add a GET endpoint to serve the valid categories list. Add a modal to the frontend with toggleable category pills. Pencil icon on each card opens the modal.

**Tech Stack:** Express.js backend, vanilla JS + Bootstrap 4 frontend, CSS

---

### Task 1: Backend — Add JSON body parser and categories endpoint

**Files:**
- Modify: `server.js:24` (add middleware after `const app`)
- Modify: `server.js` (add new endpoint near other API routes)

**Step 1: Add express.json() middleware**

After line 24 (`const app = express();`), add:

```js
app.use(express.json());
```

**Step 2: Add GET /api/categories endpoint**

After the existing `/api/tags` endpoint (~line 155), add:

```js
app.get('/api/categories', (req, res) => {
  const { CATEGORIES } = require('./lib/categorize');
  res.json(CATEGORIES);
});
```

**Step 3: Verify manually**

Run: `node -e "require('./server')"` — confirm no startup errors, then `curl localhost:4500/api/categories` returns the JSON array.

**Step 4: Commit**

```bash
git add server.js
git commit -m "Add JSON body parser and /api/categories endpoint"
```

---

### Task 2: Backend — Add PUT /api/books/:id/tags endpoint

**Files:**
- Modify: `server.js` (add new endpoint near other API routes)
- Uses: `lib/cache.js` (loadTags/saveTags via categorize.js saveTagsFile)

**Step 1: Add the PUT endpoint**

After the `/api/categories` endpoint, add:

```js
app.put('/api/books/:id/tags', (req, res) => {
  const book = library.books[req.params.id];
  if (!book) return res.status(404).json({ error: 'Book not found' });

  const { tags } = req.body;
  if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });

  const { CATEGORIES } = require('./lib/categorize');
  const validCategories = new Set(CATEGORIES);
  const validTags = tags.filter(t => validCategories.has(t));

  // Update tags.json
  const { loadTags } = require('./lib/cache');
  const allTags = loadTags(DATA_DIR);
  allTags[book.id] = { title: book.title, tags: validTags };

  const { saveTagsFile } = require('./lib/categorize');
  saveTagsFile(DATA_DIR, allTags);

  // Update in-memory library
  book.tags = validTags;

  res.json({ ok: true, tags: validTags });
});
```

**Step 2: Export saveTagsFile from categorize.js**

Check `lib/categorize.js` — `saveTagsFile` is already a local function but needs to be exported. Update the module.exports line:

```js
module.exports = { categorizeBooks, CATEGORIES, saveTagsFile };
```

**Step 3: Verify manually**

```bash
curl -X PUT localhost:4500/api/books/308826d6/tags \
  -H 'Content-Type: application/json' \
  -d '{"tags":["Self-Help","UX Design & Research"]}'
```

Expected: `{"ok":true,"tags":["Self-Help","UX Design & Research"]}`

Verify tags.json was updated and `/api/tags` reflects the change.

**Step 4: Commit**

```bash
git add server.js lib/categorize.js
git commit -m "Add PUT /api/books/:id/tags endpoint for tag editing"
```

---

### Task 3: Frontend — Add modal HTML and CSS

**Files:**
- Modify: `public/index.html` (add modal markup before `</body>`)
- Modify: `public/assets/css/style.css` (add modal styles)

**Step 1: Add modal HTML**

Before the `<script>` tag in `index.html`, add:

```html
<div class="modal-overlay" id="tag-modal" style="display:none">
  <div class="modal-dialog">
    <div class="modal-header">
      <h5 class="modal-title" id="tag-modal-title"></h5>
      <button class="modal-close" onclick="closeTagModal()">&times;</button>
    </div>
    <div class="modal-body" id="tag-modal-body"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary btn-sm" onclick="closeTagModal()">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="saveBookTags()">Save</button>
    </div>
  </div>
</div>
```

**Step 2: Add modal CSS**

Append to `style.css`:

```css
/* Tag edit modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.5);
  z-index: 1050;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-dialog {
  background: #fff;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #dee2e6;
}

.modal-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  color: #6c757d;
  cursor: pointer;
  padding: 0;
}

.modal-close:hover {
  color: #212529;
}

.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: .5rem;
  padding: .75rem 1.25rem;
  border-top: 1px solid #dee2e6;
}

.modal-footer .btn-primary {
  background: #495057;
  border: none;
}

.modal-footer .btn-primary:hover {
  background: #212529;
}

.cat-pill {
  padding: .35rem .75rem;
  font-size: .82rem;
  border-radius: 1rem;
  border: 1px solid #dee2e6;
  background: #fff;
  color: #495057;
  cursor: pointer;
  transition: all .15s;
  user-select: none;
}

.cat-pill:hover {
  background: #e9ecef;
  border-color: #adb5bd;
}

.cat-pill.selected {
  background: #495057;
  color: #fff;
  border-color: #495057;
}

/* Edit icon on cards */
.card-edit-btn {
  position: absolute;
  top: .5rem;
  right: .5rem;
  background: rgba(0,0,0,.5);
  border: none;
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: .8rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity .2s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.card:hover .card-edit-btn {
  opacity: 1;
}

.card-edit-btn:hover {
  background: rgba(0,0,0,.75);
}
```

Also add `position: relative;` to the existing `.card` rule (needed for absolute-positioned edit icon).

**Step 3: Commit**

```bash
git add public/index.html public/assets/css/style.css
git commit -m "Add tag editing modal markup and styles"
```

---

### Task 4: Frontend — Add pencil icon to cards and modal JS logic

**Files:**
- Modify: `public/index.html` (update renderBooks function, add modal JS functions)

**Step 1: Update renderBooks to include edit icon**

In the `renderBooks()` function, update the card template to include the edit button. Add it as the first child inside the `.card` div:

```js
<div class="card">
  <button class="card-edit-btn" onclick="event.stopPropagation(); openTagModal('${book.id}')" title="Edit tags">&#9998;</button>
  <img ...
```

The `&#9998;` is a pencil character. `event.stopPropagation()` prevents any card click events.

**Step 2: Add modal JS functions**

Add these functions inside the `<script>` tag:

```js
let allCategories = [];
let editingBookId = null;
let editingTags = [];

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    allCategories = await res.json();
  } catch (e) {
    console.error('Failed to load categories:', e);
  }
}

function openTagModal(bookId) {
  const book = allBooks.find(b => b.id === bookId);
  if (!book) return;

  editingBookId = bookId;
  editingTags = [...(book.tags || [])];

  document.getElementById('tag-modal-title').textContent = book.title;
  renderModalPills();
  document.getElementById('tag-modal').style.display = 'flex';
}

function renderModalPills() {
  const body = document.getElementById('tag-modal-body');
  body.innerHTML = allCategories.map(cat =>
    `<button class="cat-pill${editingTags.includes(cat) ? ' selected' : ''}" onclick="toggleCat(this, '${cat.replace(/'/g, "\\'")}')">${cat}</button>`
  ).join('');
}

function toggleCat(el, cat) {
  const idx = editingTags.indexOf(cat);
  if (idx >= 0) {
    editingTags.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    editingTags.push(cat);
    el.classList.add('selected');
  }
}

function closeTagModal() {
  document.getElementById('tag-modal').style.display = 'none';
  editingBookId = null;
  editingTags = [];
}

async function saveBookTags() {
  if (!editingBookId) return;

  try {
    const res = await fetch(`/api/books/${editingBookId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: editingTags })
    });
    const data = await res.json();
    if (data.ok) {
      // Update local data
      const book = allBooks.find(b => b.id === editingBookId);
      if (book) book.tags = data.tags;

      // Refresh tags sidebar
      const tagsRes = await fetch('/api/tags');
      allTags = await tagsRes.json();
      renderTags();
      renderBooks();
    }
  } catch (e) {
    console.error('Failed to save tags:', e);
  }

  closeTagModal();
}

// Close modal on overlay click
document.getElementById('tag-modal').addEventListener('click', function(e) {
  if (e.target === this) closeTagModal();
});
```

**Step 3: Load categories on startup**

Update the `loadBooks()` function to also load categories:

```js
async function loadBooks() {
  const booksRes = await fetch('/api/books');
  allBooks = await booksRes.json();
  renderBooks();

  try {
    const tagsRes = await fetch('/api/tags');
    allTags = await tagsRes.json();
    renderTags();
  } catch (e) {
    console.error('Failed to load tags:', e);
  }

  loadCategories();
}
```

**Step 4: Verify end-to-end**

1. Load the page — cards should show pencil icon on hover
2. Click pencil — modal opens with book title and category pills
3. Toggle categories — pills highlight/unhighlight
4. Click Save — modal closes, tags sidebar updates, card remains
5. Refresh page — changes persist

**Step 5: Commit**

```bash
git add public/index.html
git commit -m "Add tag editing UI — pencil icon on cards, modal with category pills"
```
