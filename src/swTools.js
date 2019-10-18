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
 * Created at     : 2019-08-16 09:41:53
 * Last modified  : 2019-10-18 08:21:00
 */
var swTools = (function() {
    'use strict';

    /**
     * Constructor.
     *
     * @param {string} jsFile
     * @param {object} swConfig
     */
	var swTools = function(jsFile, swConfig) {
        if (!('serviceWorker' in navigator)) {
            return;
        }

        this.jsFile   = jsFile;
        this.swConfig = swConfig;

        this.init();
    }

    swTools.prototype.init = function() {
        if (this.initialized) {
            return;
        }

        if ('' === this.jsFile) {
            return;
        }

        navigator.serviceWorker.register(this.jsFile);

        // Page load event listener.
        self.addEventListener('load', () => {
            if (!navigator.serviceWorker.controller) {
                return;
            }

            var module = self.swTools;

            // Message handle.
            module.postMessage({ 'command': 'setConfig', 'config': module.swConfig });
            module.addEventListener('message', event => {
                switch (event.data.message) {
                    case 'isConfigured':
                        startPrefetch();
                        deferredImages();
                        break;
                }
            });

            // Link prefetch handle.
            var linkEvents  = ['mouseover', 'touchstart'];
            var linkHandler = function(event) {
                var target = event.target;

                prefetch(target.href);
                linkEvents.forEach(eventType => target.removeEventListener(eventType, linkHandler));
            }

            function startPrefetch() {
                document.querySelectorAll('a').forEach(link => {
                    if (!isPrefetchable(link)) {
                        return;
                    }

                    // Link marked to prefetch at load.
                    if (link.hasAttribute('data-prefetch') && isNetworkValid()) {
                        prefetch(link.href);

                        return;
                    }

                    linkEvents.forEach(eventType => link.addEventListener(eventType, linkHandler));
                });
            }

            function isPrefetchable(link) {
                if (
                    0 != link.href.indexOf(location.origin)           // Other domain links.
                    || link.href === location.href                    // Current page.
                    || link.hasAttribute('data-no-prefetch')          // Marked not to prefetch.
                    || location.href.length == link.href.indexOf('#') // Anchors.
                    || link.target                                    // Links to destination.
                    || link.hasAttribute('download')                  // Downloads
                ) {
                    return false;
                }

                return true;
            }

            // It only works on some browsers (https://caniuse.com/#feat=netinfo).
            function isNetworkValid() {
                var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

                if (!connection) {
                    return true;
                }

                if (
                    ['slow-2g', '2g'].includes(connection.effectiveType)
                    || 0 == connection.downlink
                ) {
                    return false;
                }

                return true;
            }

            function prefetch(url) {
                module.postMessage({ 'command': 'prefetch', 'urls': [url] });
            }

            self.addEventListener('online', () => module.postMessage({ 'command': 'reconnected' }));

            // Image defer handle.
            var imgEvents = ['resize', 'scroll'];
            var imgHandler = function() {
                document.querySelectorAll('img.pending').forEach(img => {
                    if (!isElementInViewport(img)) {
                        return;
                    }

                    img.classList.remove('pending');
                    if (!img.hasAttribute('data-defer-src')) {
                        return;
                    }

                    img.src = img.getAttribute('data-defer-src');
                    img.removeAttribute('data-defer-src');
                });
            }

            function deferredImages() {
                document.querySelectorAll('img').forEach(img => img.classList.add('pending'));
                imgEvents.forEach(eventType => self.addEventListener(eventType, imgHandler));

                imgHandler();
            }

            function isElementInViewport(element) {
                var rect = element.getBoundingClientRect();

                return (
                    rect.top <= (self.innerHeight || document.documentElement.clientHeight) &&
                    rect.left <= (self.innerWidth || document.documentElement.clientWidth) &&
                    rect.right >= 0 &&
                    rect.bottom >= 0
                );
            }

            // YouTube defer handle.
            var videoEvents = ['resize', 'scroll'];
            var videoHandler = function() {
                document.querySelectorAll('iframe').forEach(iframe => {
                    if (!isElementInViewport(iframe)) {
                        return;
                    }

                    if (!iframe.hasAttribute('data-yt-src')) {
                        return;
                    }

                    iframe.src = iframe.getAttribute('data-yt-src');
                    iframe.removeAttribute('data-yt-src');
                });
            }

            videoEvents.forEach(eventType => self.addEventListener(eventType, videoHandler));
            videoHandler();
        });

        this.initialized = true;
    };

    swTools.prototype.postMessage = function(data) {
        navigator.serviceWorker.controller.postMessage(data);

        return this;
    };

    swTools.prototype.addEventListener = function(event, callback) {
        navigator.serviceWorker.addEventListener(event, callback);

        return this;
    };

    swTools.jsFile      = '';
    swTools.swConfig    = {};
    swTools.initialized = false;

    return swTools;
})();