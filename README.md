# HTTP Live Streaming (HLS) for Artillery

Load test HLS endpoints using [Artillery](https://artillery.io). The plugin parses the playlist and download all its segments. A random variant is selected for master playlist.

## Usage

```yaml
config:
  target: 'https://example.com'
  plugins:
    m3u8:
      concurrency: 3
```

### Configuration

- `concurrency` - number of segments downloaded in concurrency, defaults to `5`.

### Setup

Add the URL to the `.m3u8` playlist.

```yaml
scenarios:
  - flow:
      - get:
          url: '/path/to/.m3u8'
```
