/**
 * Copyright (c) Veiss Comunicación.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Veiss Comunicación Service Worker controller tool. Designed to avoid
 * Service Worker modification when some functionality needs to be modified.
 * Handles link prefetching, image lazy loading and Service Worker post messages.
 *
 * @summary Veiss Comunicación plugin to configure and control a Service Worker.
 * @author Veiss Comunicación
 * @license MIT
 *
 * Created at     : 2019-08-16 09:47:00
 * Last modified  : 2019-08-16 12:22:32
 */

'use strict';

// Global Service Worker configuration.
var globalConfig = {
    version: 'v1.0.0',
    analytics: {
        store: 'analytics',
        version: 1
    }
};

// Editable configuration.
var config = {
    cache: {
        enabled: true
    },
    prefetch: {
        enabled: true
    },
    defer: {
        images: {
            color: '#D8D8D8'
        },
        youtube: {
            enabled: true
        }
    },
    analytics: {
        enabled: true,
        maxTime: 24 * 60 * 60 * 1000
    }
};

// Event listeners.
self.addEventListener('install', onInstall);
self.addEventListener('activate', onActivate);
self.addEventListener('fetch', onFetch);
self.addEventListener('message', onMessage);

/**
 * Service Worker installation.
 */
function onInstall() {
    self.skipWaiting();
}

/**
 * Service Worker activation.
 * Deletes old cache content.
 *
 * @param {object} event
 */
function onActivate(event) {
    event.waitUntil(
        caches.keys()
        .then(cacheKeys => {
            return Promise.all(cacheKeys
                .filter(key => (0 !== key.indexOf(globalConfig.version)))
                .map(oldKey => caches.delete(oldKey))
            );
        })
        .then(() => self.clients.claim())
    );
}

/**
 * URL fectch action.
 * If should handle fetch:
 *   - HTML. Download -> Fetch from cache -> Offline response.
 *   - Others. Fetch from cache -> Download -> Offline response.
 * Google Analytics requests:
 *   - Try requests -> When error, save to IndexedDB -> Retry later.
 *
 * @param {object} event
 */
function onFetch(event) {
    function shouldSaveData(event) {
        if (!config.saveDataItems) {
            return false;
        }

        var request = event.request;
        var url     = request.url;

        if (!request.headers.get('save-data')) {
            return false;
        }

        return config.saveDataItems.some(item => {
            return url.includes(item);
        });
    }

    function shouldHandleFetch(event) {
        var request            = event.request;
        var url                = new URL(request.url);
        var pathname           = url.pathname;
        var criteria           = {
            isSWjs        : 'sw.min.js' !== pathname,
            isGETRequest  : 'GET' === request.method,
            isFromMyOrigin: url.origin === self.location.origin
        };

        if (config.cache.noCachePatterns) {
            criteria.matchesPathPattern = !config.cache.noCachePatterns.some(pattern => {
                return pattern.test(pathname);
            });
        }

        if (config.cache.noCacheItems) {
            criteria.isNoCacheItem = !config.cache.noCacheItems.includes(pathname);
        }

        var failingCriteria = Object.keys(criteria)
        .filter(criteriaKey => !criteria[criteriaKey]);

        return !failingCriteria.length;
    }

    function doFetch(event) {
        var request      = event.request;
        var acceptHeader = request.headers.get('Accept');
        var resourceType = 'static';
        var cacheKey;

        if (-1 !== acceptHeader.indexOf('text/html')) {
            resourceType = 'content';
        } else if (-1 !== acceptHeader.indexOf('image')) {
            resourceType = 'image';
        }

        cacheKey = cacheName(resourceType);
        switch (resourceType) {
            case 'content':
                event.respondWith(
                    fetch(request)
                    .then(response => deferImages(response))
                    .then(response => deferYoutubeVideos(response))
                    .then(response => addToCache(cacheKey, request, response))
                    .catch(() => fetchFromCache(event))
                    .catch(() => offlineResponse(resourceType))
                );
                break;
            default:
                event.respondWith(
                    fetchFromCache(event)
                    .catch(() => fetch(request))
                    .then(response => addToCache(cacheKey, request, response))
                    .catch(() => offlineResponse(resourceType))
                );
                break;
        }
    }

    function analyticsFetch(event) {
        var request = event.request;
        var url     = new URL(request.url);

        if (
            ['www.google-analytics.com', 'ssl.google-analytics.com'].includes(url.hostname)
            && '/collect' === url.pathname
        ) {
            event.respondWith(
                fetch(request)
                .then(response => store(response, request.url))
                .catch(error => store(error, request.url))
            );
        }
    }

    if (shouldSaveData(event)) {
        event.respondWith(new Response('', {
            status    : 408,
            statusText: 'Ignore request to save data.'
        }));

        return;
    }

    if (shouldHandleFetch(event)) {
        doFetch(event);

        return;
    }

    if (config.analytics.enabled) {
        analyticsFetch(event);

        return;
    }
}

/**
 * Actions based on the message received from the DOM.
 *   - trimCaches. Limit different cache types.
 *   - prefetch. Prefetch a grup of URLs.
 *   - reconnected. Retry Google Analytics requests.
 *
 * @param {object} event
 */
function onMessage(event) {
    switch (event.data.command) {
        case 'setConfig':
            setConfig(event.data.config);
            break;
        case 'prefetch':
            prefetch(event.data.urls);
            break;
        case 'reconnected':
            retryAnalyticsRequests();
            break;
    }
}

/**
 * Add a response to cache.
 *
 * @param {string} cacheKey
 * @param {object} request
 * @param {object} response
 *
 * @return {object}
 */
function addToCache(cacheKey, request, response) {
    if (response.ok && config.cache.enabled) {
        var copy = response.clone();

        caches.open(cacheKey)
        .then(cache => cache.put(request, copy));
    }

    return response;
}

/**
 * Generate a cache name.
 *
 * @param {string} key
 *
 * @return {string}
 */
function cacheName(key) {
    return globalConfig.version + ':sw-cache::' + key;
}

/**
 * Prepare images for delayed loading.
 *
 * @param {object} response
 *
 * @return {object}
 */
function deferImages(response) {
    var copy = response.clone();

    return copy.text().then(body => {
        body = changeImages(body);

        return new Response(body, {
            headers: copy.headers
        });
    });
}

/**
 * Prepare YouTube videos for delayed loading.
 *
 * @param {object} response
 *
 * @return {object}
 */
function deferYoutubeVideos(response) {
    var copy = response.clone();

    return copy.text().then(body => {
        if (config.defer.youtube.enabled) {
            body = body.replace(/<iframe (.*) src="https:\/\/www.youtube.com\/embed\/([a-z0-9\-]+)" (.*)><\/iframe>/gi, '<div style="overflow:hidden;padding-top:56.25%;position:relative;"><iframe style="border:0;height:100%;left:0;position:absolute;top:0;width:100%;" $1 src="https://www.youtube.com/embed/$2" srcdoc="<style>*{padding:0;margin:0;overflow:hidden}html,body{height:100%}img,span{position:absolute;width:100%;top:0;bottom:0;margin:auto}span{height:1.5em;text-align:center;font:48px/1.5 sans-serif;color:white;text-shadow:0 0 0.5em black}</style><a href=https://www.youtube.com/embed/$2?autoplay=1><img src=https://img.youtube.com/vi/$2/hqdefault.jpg><span>▶</span></a>" $3></iframe></div>');
        }

        return new Response(body, {
            headers: copy.headers
        });
    })
}

/**
 * Get from cache.
 *
 * @param {object} event
 *
 * @return {Promise}
 */
function fetchFromCache(event) {
    return caches.match(event.request)
    .then(response => {
        if (!response) {
            throw Error(event.request.url + ' not found in cache');
        }

        return response;
    });
}

/**
 * Get IndexedDB store.
 *
 * @param {string} storeName
 * @param {string} mode
 *
 * @return {IDBObjectStore}
 */
function getObjectStore(storeName, mode) {
    return globalConfig.analytics.database.transaction(storeName, mode).objectStore(storeName);
}

/**
 * Check if item is object.
 *
 * @param {object} item
 *
 * @return {object}
 */
function isObject(item) {
    return (item && 'object' === typeof item && !Array.isArray(item) && null !== item);
}

/**
 * Deep merge of two objects.
 *
 * @param {object} target
 * @param {object} source
 *
 * @return {object}
 */
function mergeDeep(target, source) {
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!target[key]) {
                    Object.assign(target, { [key]: {} });
                }

                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        });
    }

    return target;
}

/**
 * Offline response.
 *
 * @param {string} resourceType
 *
 * @return {object}
 */
function offlineResponse(resourceType) {
    var response = undefined;

    if (!config.offline) {
        return response;
    }

    switch (resourceType) {
        case 'image':
            if (config.offline.image) {
                response = new Response(config.offline.image, {
                    headers: { 'Content-Type': 'image/svg+xml' }
                });
            }
            break;
        case 'content':
            if (config.offline.page) {
                response = caches.match(config.offline.page);
            }
            break;
    }

    return response;
}

/**
 * Connect to IndexedDB.
 */
function openDatabase() {
    var indexedDBOpenRequest = indexedDB.open('offline-analytics', globalConfig.analytics.version);

    indexedDBOpenRequest.onerror = function(error) {
        console.error('IndexedDB error:', error);
    };

    indexedDBOpenRequest.onupgradeneeded = function() {
        this.result.createObjectStore(globalConfig.analytics.store, { keyPath: 'url' });
    };

    indexedDBOpenRequest.onsuccess = function() {
        globalConfig.analytics.database = this.result;

        retryAnalyticsRequests();
    };
}

/**
 * Prefetch the URLs that are most likely to be visited by the user.
 *
 * @param {Array} urls
 *
 * @return {Promise}
 */
function prefetch(urls) {
    if (!config.prefetch.enabled) {
        return;
    }

    return Promise.all(urls.map(url => {
        var cacheKey = cacheName('content');

        return fetch(url)
            .then(response => addToCache(cacheKey, url, response));
    }));
}

/**
 * Retry Google Analytics requests.
 */
function retryAnalyticsRequests() {
    getObjectStore(globalConfig.analytics.store).getAll().onsuccess = function(event) {
        event.target.result.forEach(request => {
            var queueTime = Date.now() - request.timestamp;
            if (queueTime > config.analytics.maxTime) {
                getObjectStore(globalConfig.analytics.store, 'readwrite').delete(request.url);

                return;
            }

            // The qt= URL parameter specifies the time delta in between right now, and when the
            // /collect request was initially intended to be sent. See
            // https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters#qt
            var requestUrl = request.url + '&qt=' + queueTime;

            fetch(requestUrl)
            .then(response => {
                if (400 <= response.status) {
                    return;
                }

                getObjectStore(globalConfig.analytics.store, 'readwrite').delete(request.url);
            });
        });
    };
}

/**
 * Send message to the client.
 *
 * @param {string} message
 */
function sendMessage(message) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                message: message
            });
        });
    });
}

/**
 * Merge default configuration with user provided configuration.
 *
 * @param {object} newConfig
 */
function setConfig(newConfig) {
    config = mergeDeep(config, newConfig);

    trimCaches();

    if (config.prefetch.enabled && config.prefetch.items) {
        prefetch(config.prefetch.items);
    }

    openDatabase();
    sendMessage('isConfigured');
}

/**
 * Save URL to IndexedDB.
 *
 * @param {object} error
 * @param {string} url
 *
 * @return {object}
 */
function store(error, url) {
    getObjectStore(globalConfig.analytics.store, 'readwrite').add({
        url: url,
        timestamp: Date.now()
    });

    return error;
}

/**
 * Limit number of cache elements.
 */
function trimCaches() {
    if (!config.cache.enabled || !config.cache.maxItems) {
        return;
    }

    caches.keys()
    .then(cacheKeys => {
        cacheKeys
        .map(cacheName => {
            trimCache(cacheName);
        });
    });
}

/**
 * Limit number of elements in a cache.
 *
 * @param {string} cacheName
 */
function trimCache(cacheName) {
    caches.open(cacheName)
    .then(cache => {
        cache.keys()
        .then(keys => {
            if (keys.length <= config.cache.maxItems) {
                return;
            }

            cache.delete(keys[0])
            .then(() => trimCache(cacheName));
        });
    });
}

/**
 * Change image sources to be base64.
 *
 * @param {string} html
 *
 * @return {string}
 */
function changeImages(html) {
    var cloned = html;
        origin = html.indexOf('<img');

    while (-1 != origin) {
        var oldImage = getTextPart(cloned, '<img', '>');

        if (-1 < oldImage.indexOf('data-defer')) {
            var newImage = setImage(oldImage);
            html = html.replace(oldImage, newImage);
        }

        cloned = cloned.substr(cloned.indexOf(oldImage) + 1, cloned.length);
        origin = cloned.indexOf('<img');
    }

    return html;
}

/**
 * Set image based on the actual img object size.
 *
 * @param {string} image
 *
 * @return {string}
 */
function setImage(image) {
    var width  = (image.match(/width="(\d+)"/)) ? image.match(/width="(\d+)"/)[1] : false;
    var height = (image.match(/height="(\d+)"/)) ? image.match(/height="(\d+)"/)[1] : false;

    if (!width || !height) {
        return image;
    }

    return image.replace(/src="(.*)(\?[0-9]+)*"/gi, 'src="' + newBase64Image(width, height) + '" data-defer-src="$1"');
}

/**
 * Split text to get content.
 *
 * @param {string} text
 * @param {string} start
 * @param {string} end
 *
 * @return {string}
 */
function getTextPart(text, start, end) {
    text = text.substr(text.indexOf(start), text.length);
    text = text.substr(0, text.indexOf(end) + 1);

    return text;
}

/**
 * Get new base64 image given a size and color.
 *
 * @param {integer} width
 * @param {integer} height
 *
 * @return {string}
 */
function newBase64Image(width, height) {
    var element = '<svg role="img" aria-labelledby="offline-title" viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd"><path fill="' + config.defer.images.color + '" d="M0 0h' + width + 'v' + height + 'H0z"/></g></svg>';

    return 'data:image/svg+xml;base64,' + btoa(element);
}