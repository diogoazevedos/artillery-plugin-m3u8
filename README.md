# HTTP Live Streaming (HLS) for Artillery

Load test HLS endpoints using [Artillery](https://artillery.io). The plugin parses the manifest, pick a random variant, and download all its segments.

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

Add the URL to the `.m3u8` manifest.

```yaml
scenarios:
  - flow:
      - get:
          url: '/path/to/.m3u8'
```

> **Note**: Media playlist is **NOT** supported.
