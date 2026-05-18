#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { categorizeBooks } = require('../lib/categorize');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

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

async function main() {
  if (!fs.existsSync(LIBRARY_FILE)) {
    console.error('data/library.json not found. Start the server first to generate it.');
    process.exit(1);
  }

  const library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
  const force = process.argv.includes('--force');

  const result = await categorizeBooks(library.books, DATA_DIR, { force });
  console.log(result.message);
  if (result.categorized) {
    console.log('Restart the server to pick up the changes.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
