const debug = require('debug')('plugin:m3u8');
const {parse, setOptions} = require('hls-parser');
const {get} = require('got');
const limit = require('p-limit');

class PluginM3U8 {
	#config;
	#limit;

	constructor({config, scenarios}) {
		this.#config = config.plugins?.m3u8 ?? {};
		this.#limit = limit(this.#config.concurrency ?? 5);

		setOptions({silent: true, strictMode: true, allowClosedCaptionsNone: true});

		config.processor ||= {};
		config.processor.pluginM3U8AfterResponseHook = this.afterResponse.bind(this);

		for (const scenario of scenarios) {
			scenario.afterResponse ||= [];
			scenario.afterResponse.push('pluginM3U8AfterResponseHook');
		}

		debug('Initialized');
	}

	selectRandom(items) {
		return items[Math.floor(Math.random() * items.length)];
	}

	async #makeRequest(url, {headers, timeout}, eventEmitter) {
		eventEmitter.emit('counter', 'http.requests', 1);
		eventEmitter.emit('rate', 'http.request_rate');

		const response = await get(url, {
			headers, timeout, retry: 0, throwHttpErrors: false,
		});

		eventEmitter.emit('counter', 'http.downloaded_bytes', response.body.length);
		eventEmitter.emit('counter', 'http.responses', 1);
		eventEmitter.emit('counter', `http.codes.${response.statusCode}`, 1);
		eventEmitter.emit('histogram', 'http.response_time', response.timings.phases.firstByte);

		if (response.statusCode >= 500) {
			eventEmitter.emit('histogram', 'http.response_time.5xx', response.timings.phases.firstByte);
		} else if (response.statusCode >= 400) {
			eventEmitter.emit('histogram', 'http.response_time.4xx', response.timings.phases.firstByte);
		} else if (response.statusCode >= 300) {
			eventEmitter.emit('histogram', 'http.response_time.3xx', response.timings.phases.firstByte);
		} else if (response.statusCode >= 200) {
			eventEmitter.emit('histogram', 'http.response_time.2xx', response.timings.phases.firstByte);
		}

		return response;
	}

	async afterResponse(request, manifest, _context, eventEmitter) {
		try {
			const {variants, isMasterPlaylist} = parse(manifest.body);
			if (!isMasterPlaylist) {
				debug('Not a master playlist');
				return;
			}

			const randomVariant = this.selectRandom(variants);
			debug('Selected variant', randomVariant);
			const variantUrl = new URL(randomVariant.uri, request.url);

			const playlist = await this.#makeRequest(variantUrl, request, eventEmitter);

			const {segments} = parse(playlist.body);

			const mediaFiles = segments.map(segment => this.#limit(async () => {
				const segmentUrl = new URL(segment.uri, variantUrl);

				return this.#makeRequest(segmentUrl, request, eventEmitter);
			}));

			await Promise.all(mediaFiles);
		} catch (error) {
			debug('Error', error);
		}
	}
}

module.exports = {Plugin: PluginM3U8};
