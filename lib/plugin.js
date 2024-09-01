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

	#selectRandom(items) {
		return items[Math.floor(Math.random() * items.length)];
	}

	async #makeRequest(uri, {url, ...options}, eventEmitter) {
		eventEmitter.emit('counter', 'http.requests', 1);
		eventEmitter.emit('rate', 'http.request_rate');

		try {
			const response = await get(new URL(uri, url), options);

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
		} catch (error) {
			eventEmitter.emit('error', error.code || error.message);
			throw error;
		}
	}

	async #handleResponse(
		{agent, retry, timeout, headers, decompress, followRedirect, throwHttpErrors},
		{url, body},
		eventEmitter,
	) {
		const {isMasterPlaylist, variants, segments} = parse(body);
		const requestParameters = {
			url, agent, retry, timeout, headers, decompress, followRedirect, throwHttpErrors,
		};

		if (isMasterPlaylist) {
			const randomVariant = this.#selectRandom(variants);
			debug('variant selected', randomVariant);
			return this.#handleResponse(
				requestParameters,
				await this.#makeRequest(randomVariant.uri, requestParameters, eventEmitter),
				eventEmitter,
			);
		}

		const mediaFiles = segments.map(segment => this.#limit(
			async () => this.#makeRequest(segment.uri, requestParameters, eventEmitter),
		));

		return Promise.all(mediaFiles);
	}

	async afterResponse(requestParameters, response, _context, eventEmitter) {
		if (response.headers['content-type'] !== 'application/vnd.apple.mpegurl') {
			debug('not M3U8 playlist');
			return;
		}

		try {
			await this.#handleResponse(requestParameters, response, eventEmitter);
		} catch (error) {
			debug('error', error);
		}
	}
}

module.exports = {Plugin: PluginM3U8};
