const { create } = require('xmlbuilder2');

function buildFeed(book, hostname) {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rss', {
      version: '2.0',
      'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd'
    })
      .ele('channel')
        .ele('title').txt(book.title).up()
        .ele('link').txt(hostname).up()
        .ele('description').txt(`Feed for the audiobook ${book.title}.`).up()
        .ele('language').txt('en-us').up();

  if (book.author) {
    doc.ele('itunes:author').txt(book.author).up();
  }
  if (book.description) {
    doc.ele('itunes:summary').txt(book.description).up();
  }

  if (book.hasCover) {
    const coverUrl = `${hostname}/books/${book.id}/cover`;
    doc.ele('image')
      .ele('url').txt(coverUrl).up()
      .ele('title').txt(book.title).up()
      .ele('link').txt(hostname).up()
    .up();
    doc.ele('itunes:image').att('href', coverUrl).up();
  }

  const totalFiles = book.files.length;
  book.files.forEach((file, index) => {
    const itemTitle = `Part ${index + 1} of ${totalFiles} - ${file.title}`;
    const item = doc.ele('item')
      .ele('title').txt(itemTitle).up()
      .ele('description').up()
      .ele('guid').txt(`${book.id}-${index}`).up()
      .ele('enclosure')
        .att('url', `${hostname}/books/${book.id}/files/${index}`)
        .att('length', String(file.size))
        .att('type', file.type)
      .up();
    if (file.duration) {
      item.ele('itunes:duration').txt(String(file.duration)).up();
    }
    item.up();
  });

  return doc.root().end({ prettyPrint: true });
}

module.exports = { buildFeed };
