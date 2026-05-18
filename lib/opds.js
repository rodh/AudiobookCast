const { create } = require('xmlbuilder2');

const NAVIGATION_TYPE = 'application/atom+xml;profile=opds-catalog;kind=navigation';
const ACQUISITION_TYPE = 'application/atom+xml;profile=opds-catalog;kind=acquisition';
const ATOM_NS = 'http://www.w3.org/2005/Atom';

function buildNavigation(hostname) {
  const now = new Date().toISOString();

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele(ATOM_NS, 'feed')
      .ele(ATOM_NS, 'id').txt(`${hostname}/opds`).up()
      .ele(ATOM_NS, 'title').txt('AudiobookCast').up()
      .ele(ATOM_NS, 'updated').txt(now).up()
      .ele(ATOM_NS, 'link')
        .att('rel', 'self')
        .att('href', `${hostname}/opds`)
        .att('type', NAVIGATION_TYPE)
      .up()
      .ele(ATOM_NS, 'link')
        .att('rel', 'start')
        .att('href', `${hostname}/opds`)
        .att('type', NAVIGATION_TYPE)
      .up()
      .ele(ATOM_NS, 'entry')
        .ele(ATOM_NS, 'id').txt(`${hostname}/opds/all`).up()
        .ele(ATOM_NS, 'title').txt('All Audiobooks').up()
        .ele(ATOM_NS, 'updated').txt(now).up()
        .ele(ATOM_NS, 'content').att('type', 'text').txt('Browse all audiobooks').up()
        .ele(ATOM_NS, 'link')
          .att('rel', 'subsection')
          .att('href', `${hostname}/opds/all`)
          .att('type', ACQUISITION_TYPE)
        .up()
      .up();

  return doc.root().end({ prettyPrint: true });
}

function buildAllBooks(books, hostname) {
  const now = new Date().toISOString();
  const bookList = Object.values(books).sort((a, b) =>
    new Date(b.addedAt) - new Date(a.addedAt)
  );

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele(ATOM_NS, 'feed')
      .ele(ATOM_NS, 'id').txt(`${hostname}/opds/all`).up()
      .ele(ATOM_NS, 'title').txt('All Audiobooks').up()
      .ele(ATOM_NS, 'updated').txt(now).up()
      .ele(ATOM_NS, 'link')
        .att('rel', 'self')
        .att('href', `${hostname}/opds/all`)
        .att('type', ACQUISITION_TYPE)
      .up()
      .ele(ATOM_NS, 'link')
        .att('rel', 'up')
        .att('href', `${hostname}/opds`)
        .att('type', NAVIGATION_TYPE)
      .up();

  for (const book of bookList) {
    const entry = doc.ele(ATOM_NS, 'entry')
      .ele(ATOM_NS, 'id').txt(`${hostname}/books/${book.id}`).up()
      .ele(ATOM_NS, 'title').txt(book.title).up()
      .ele(ATOM_NS, 'updated').txt(book.addedAt).up();

    if (book.hasCover) {
      entry.ele(ATOM_NS, 'link')
        .att('rel', 'http://opds-spec.org/image')
        .att('href', `${hostname}/books/${book.id}/cover`)
        .att('type', 'image/jpeg')
      .up();
    }

    entry.ele(ATOM_NS, 'link')
      .att('rel', 'subsection')
      .att('href', `${hostname}/opds/books/${book.id}`)
      .att('type', ACQUISITION_TYPE)
    .up();

    entry.up();
  }

  return doc.root().end({ prettyPrint: true });
}

function buildBookFeed(book, hostname) {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele(ATOM_NS, 'feed')
      .ele(ATOM_NS, 'id').txt(`${hostname}/opds/books/${book.id}`).up()
      .ele(ATOM_NS, 'title').txt(book.title).up()
      .ele(ATOM_NS, 'updated').txt(book.addedAt).up()
      .ele(ATOM_NS, 'link')
        .att('rel', 'self')
        .att('href', `${hostname}/opds/books/${book.id}`)
        .att('type', ACQUISITION_TYPE)
      .up()
      .ele(ATOM_NS, 'link')
        .att('rel', 'up')
        .att('href', `${hostname}/opds/all`)
        .att('type', ACQUISITION_TYPE)
      .up();

  const totalFiles = book.files.length;
  book.files.forEach((file, index) => {
    const itemTitle = `Part ${index + 1} of ${totalFiles} - ${file.title}`;
    doc.ele(ATOM_NS, 'entry')
      .ele(ATOM_NS, 'id').txt(`${hostname}/books/${book.id}/files/${index}`).up()
      .ele(ATOM_NS, 'title').txt(itemTitle).up()
      .ele(ATOM_NS, 'updated').txt(book.addedAt).up()
      .ele(ATOM_NS, 'link')
        .att('rel', 'http://opds-spec.org/acquisition')
        .att('href', `${hostname}/books/${book.id}/files/${index}`)
        .att('type', file.type)
        .att('length', String(file.size))
      .up()
    .up();
  });

  return doc.root().end({ prettyPrint: true });
}

module.exports = { buildNavigation, buildAllBooks, buildBookFeed };
