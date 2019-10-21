# Service Worker tools

[![GitHub license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/veiss-com/sw-tools/blob/master/LICENSE) [![npm (scoped)](https://img.shields.io/npm/v/@veiss-com/sw-tools)](https://www.npmjs.com/package/@veiss-com/sw-tools)

Dependency free Service Worker helper library to simplify the usage of some of its most common features. Includes tools such as: cache management, prefetching, offline responses, deferring, ...

Developed and maintained by [Veiss Comunicación].

## Index

* [Installation](#installation)
* [Features](#features)
  * [Cache management](#cache-management)
    * [Cache types](#cache-types)
    * [Excluding elements](#excluding-elements)
    * [Limiting the cache size](#limiting-the-cache-size)
  * [Content loading policies](#content-loading-policies)
    * [HTML](#html)
    * [Static content](#static-content)
  * [Prefetch](#prefetch)
    * [Slow connections](#slow-connections)
  * [The save-data header](#the-save-data-header)
  * [Offline](#offline)
  * [Content deferring](#content-deferring)
    * [Image defer](#image-defer)
    * [Lazy loading YouTube videos](#lazy-loading-youtube-videos)
  * [Google Analytics events](#google-analytics-events)
* [Configuration example](#configuration-example)
* [License](#license)

## Installation

1. Install the library via NPM.

    ```bash
    npm install @veiss-com/sw-tools --save-dev
    ```

2. Copy **sw.min.js** from lib folder to the web root.

3. Include **swTools.min.js** from lib folder in your website.

4. Add the library configuration to your JavaScript.

    ```js
    var swTools = new swTools('/sw.min.js');
    ```

## Features

### Cache management

#### Cache types

The library divides cache elements in 3 different caches:

* static: css, js, json, video, ...
* content: HTML pages.
* image

#### Excluding elements

Form pages and administrations should be excluded to avoid unwanted behaviors.

##### 1. Disable the entire cache

```js
cache: {
    enabled: false
}
```

##### 2. Adding exceptions

```js
cache: {
    noCacheItems: [
        '/no-cache-page'
    ]
}
```

##### 3. With regular expressions

```js
cache: {
    noCachePatterns: [
        /^(\/){1}no-cache-page$/
    ]
}
```

#### Limiting the cache size

The Service Worker also allows you to specify the maximum number of items to be saved in each of the caches. This way, you can prevent them from growing out of control.

```js
cache: {
    maxItems: 40
}
```

### Content loading policies

#### HTML

Since the HTML could change more often, we get it using a *network-first* policy. This allows the user to always have the latest version.

#### Static content

Static content (images, styles, JavaScript, ...) is loaded using the *cache-first* policy. Since these resources do not usually change, we try to accelerate their acquisition, avoiding long waits for the user.

### Prefetch

The library allows you to [prefetch the links of the page]. When one of these links is visited, the load is made from the cache. It can be done in three different ways, depending on the situation.

1. URLs specified in the library configuration are prefetched on Service Worker installation.

    ```js
    prefetch: {
        items: [
            'offline'
        ]
    }
    ```

2. Once the DOM has been loaded. The library seeks the links with the attribute *data-prefetch* and sends them to the Service Worker to preload and cache them.

3. Hovering over the links. We assume that the user is quite likely to click on them, so the content is preloaded and left in the cache.

    > **Note:** It is possible to avoid prefetch on a link by adding the attribute *data-no-prefetch*.

You can fully disable prefetching from configuration.

```js
prefetch: {
    enabled: false
}
```

> **Note:** Forms and administrations should be excluded from being prefetched to avoid unwanted behaviors.

#### Slow connections

To avoid problems with the prefetch in slow connections, use the api [Network Information]. Although it is under development, it is already available in some of the most used mobile browsers ([see caniuse]). Whenever the user is browsing through a slow connection, URL prefetch will be avoided.

### The save-data header

In some mobile browsers it is possible to include the header _[save-data]_ to indicate that the user prefers a lighter version of the web application.

In the library it is possible to block some requests when this mode is active.

```js
// Block requests to Google fonts if save-data header is present.
saveDataItems: [
    'fonts.googleapis.com'
]
```

### Offline

This library can register an specific page to be used as safe net when no internet connection is found and the requested page is not in cache.

```js
offline: {
    page: 'offline'
}
```

In addition, for those images that cannot be displayed, it allows you to replace them with an svg.

```js
offline: {
    image: '<svg role="img" aria-labelledby="offline-title"'
        + ' viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">'
        + '<title id="offline-title">Offline</title>'
        + '<g fill="none" fill-rule="evenodd"><path fill="#D8D8D8" d="M0 0h400v300H0z"/>'
        + '<text fill="#9B9B9B" font-family="Times New Roman,Times,serif" font-size="72" font-weight="bold">'
        + '<tspan x="93" y="172">offline</tspan></text></g></svg>'
}
```

### Content deferring

#### Image defer

One of the main causes of a website to load slowly are images. Not all images are visible when the user enters a page.

The library allows replacing the images with svgs of the same size and loading the original as the user scrolls the page.

For that, simply add the _data-defer_ attribute to the images that you wish to postpone.

In addition, you have to add the width and height attributes to the image to create a svg of the same dimensions as the original.

```html
<img src="SRC" width="XXX" height="YYY">
```

In the library configuration you can specify the background color of the svg.

```js
defer: {
    // Supports all CSS color nomenclatures.
    imgages: {
        color: '#D8D8D8'
    }
}
```

#### Lazy loading YouTube videos

When the user enters a page that includes an iframe with a YouTube video, the browser downloads different javascripts and styles to display the player. To save these unnecessary requests, the possibility of replacing the player with a thumbnail of the video ([original idea]) has been added to the library. When clicked, it will load the player with the video.

To achieve this functionality, simply replace the _src_ attribute of the iframe with _data-yt-src_.

```html
<iframe data-yt-src="https://www.youtube.com/embed/XXXXXXXXX"></iframe>
```

This functionality is enabled by default and can be disabled from the configuration.

```js
defer: {
    youtube: {
        enabled: false
    }
}
```

### Google Analytics events

If the registration of a Google Analytics event throws an error (connection problems, problems with the Google server, ...), the request is stored in the database browser ([IndexedDB]) for a later retry when the connection is restore or another page is visited.

In the library configuration you can specify a maximum lifetime of the links in the database. Once exceeded, the link will be deleted and will not be retried again.

```js
// 1 day lifetime in milliseconds.
analytics: {
    maxTime: 24 * 60 * 60 * 1000
}
```

This functionality is enabled by default and can be disabled from the configuration.

```js
analytics: {
    enabled: false
}
```

## Configuration example

```js
var swTools = new swTools('/sw.min.js', {
    cache: {
        enabled: false,
        maxItems: 40,
        noCacheItems: [
            '/no-cache-page'
        ],
        noCachePatterns: [
            /^(\/){1}no-cache-page$/
        ]
    },
    prefetch: {
        enabled: false,
        items: [
            'offline'
        ]
    },
    saveDataItems: [
        'fonts.googleapis.com'
    ],
    offline: {
        page: 'offline',
        image: '<svg role="img" aria-labelledby="offline-title"'
            + ' viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">'
            + '<title id="offline-title">Offline</title>'
            + '<g fill="none" fill-rule="evenodd"><path fill="#D8D8D8" d="M0 0h400v300H0z"/>'
            + '<text fill="#9B9B9B" font-family="Times New Roman,Times,serif" font-size="72" font-weight="bold">'
            + '<tspan x="93" y="172">offline</tspan></text></g></svg>'
    },
    defer: {
        images: {
            color: '#D8D8D8'
        },
        youtube: {
            enabled: false
        }
    },
    analytics: {
        enabled: false,
        maxTime: 24 * 60 * 60 * 1000
    }
});
```

## License

Service Worker helper library is [MIT licensed].

[Veiss Comunicación]: https://www.veiss.com/
[prefetch the links of the page]: https://css-tricks.com/prefetching-preloading-prebrowsing/#article-header-id-2
[Network Information]: https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
[see caniuse]: https://caniuse.com/#feat=netinfo
[save-data]: https://developers.google.com/web/fundamentals/performance/optimizing-content-efficiency/save-data/
[original idea]: https://dev.to/haggen/lazy-load-embedded-youtube-videos-520g
[IndexedDB]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
[MIT licensed]: ./LICENSE
