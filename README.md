# AudiobookCast

An audiobook RSS feed server that serves audio files and generates podcast-compatible RSS feeds for syncing with your devices.

## Purpose

This project serves DRM-free audiobooks (e.g., purchased from Downpour) and generates podcast-compatible RSS feeds so you can subscribe to a specific audiobook in any podcast app. Once subscribed, your podcast app downloads all chapters for offline listening.

## Key Aspects

### Audiobook Directory Structure

Audiobooks are served from the `audiobooks/` directory (configurable via `AUDIOBOOKS_PATH`). Each audiobook should be in its own folder with:
- Cover image: `cover.jpg`
- Audio files: `.mp3` or `.mp4` files

```
audiobooks/
├── The Great Gatsby/
│   ├── cover.jpg
│   ├── 01.mp3
│   ├── 02.mp3
│   └── ...
└── Another Book/
    ├── cover.jpg
    └── 01.mp3
```

### Web Interface

Browse audiobooks at `http://localhost:4500` (or your configured hostname). Each book shows as a card with:
- Cover image
- Title
- RSS feed button (copies feed URL to clipboard)

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/books` | Returns list of all audiobooks (name, safename, mtime) |
| `GET /feed/:book` | Returns RSS XML feed for the specified audiobook |
| `GET /covers/:name` | Serves cover image by permalink name |
| `GET /audiobooks/*` | Serves audio files statically |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4500` | Server port |
| `AUDIOBOOKS_PATH` | `./audiobooks` | Path to audiobooks directory |
| `HOSTNAME` | `http://localhost:4500` | Base URL for RSS feeds |

### Running Locally

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### Running with Docker

```bash
docker build -t audiobookcast .
docker run -p 4500:4500 -v /path/to/audiobooks:/app/audiobooks audiobookcast
```

Mount your audiobooks directory to expose them to the container.

## Dependencies

- **express**: Web server framework
- **nodemon**: Development auto-reload (dev dependency)