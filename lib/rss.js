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

  if (book.hasCover) {
    const coverUrl = `${hostname}/books/${book.id}/cover`;
    doc.ele('image')
      .ele('url').txt(coverUrl).up()
      .ele('title').txt(book.title).up()
      .ele('link').txt(hostname).up()
    .up();
    doc.ele('itunes:image').att('href', coverUrl).up();
  }

  book.files.forEach((file, index) => {
    doc.ele('item')
      .ele('title').txt(file.title).up()
      .ele('description').up()
      .ele('guid').txt(`${book.id}-${index}`).up()
      .ele('enclosure')
        .att('url', `${hostname}/books/${book.id}/files/${index}`)
        .att('length', String(file.size))
        .att('type', file.type)
      .up()
    .up();
  });

  return doc.root().end({ prettyPrint: true });
}

module.exports = { buildFeed };
