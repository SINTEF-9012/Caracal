Caracal
=======

Caracal is a light multimedia server designed as a service.

It provides a simple HTTP REST API and a HTML5 user interface.

### Installation
```npm install caracal```

_GraphicsMagick or ImageMagick is required. FFmpeg (not libav) is necessary for video resizing and converting._

### [Docker](https://registry.hub.docker.com/u/yellowiscool/caracal/)

```docker pull yellowiscool/caracal```

### Notes about the scalability

Caracal is designed to run as a single node on a single server. It does not support horizontal scaling. It is suitable for prototyping or simple non-critical multimedia applications, but it cannot be used to compete with Youtube or Imgur (yet).

### Features

 * File uploads
 * File suppressions
 * Picture and video thumbnails
 * Picture resizing
 * Video resizing and converting
  * Convert videos to H264 or Webm 
 * Can fetch distant HTTP files
  * Multimedia reverse proxy with a cache
  * Transparent resizing
  * Transparent video converting
  * Basic HTTP authentification support
 * Light HTML5 user interface
  * Drag and drop support
  * Progression bar for slow connexions
  * Thumbnails and pagination

## API

#### GET /

HTML5 user interface.

#### GET /files

JSON list of files stored in the server
```json
[
 {
    "size": 168454,
    "hash": "e8f8f15bfefafae3a19d845b9d5c42dc2014206f",
    "extension": "jpeg",
    "type": "image/jpeg",
    "name": "Veymont-aiguille_mg-k.jpg",
    "url": "http://upload.wikimedia.org/wikipedia/commons/d/d3/Veymont-aiguille_mg-k.jpg",
    "mtime": "2014-04-09T11:36:05.145Z",
    "_id": "sEHgLEvyYAkV94J8"
  },...
]
```

#### POST /upload

Save on the server the provided file
```json
{
  "name": "208T16-05E.jpg",
  "status": "ok",
  "hash": "f2a4b8f39e757e59e89c03f1ec36ada979f75203",
  "extension": "jpeg"
}
```

#### GET /{URL}

If the URL is not in the cache, fetch, save and return the content of the url.

Example : ```GET /http://perdu.com```

#### GET /fetch/{URL}

If the URL is not in the cache fetch and save the content of the url. Then return information about the URL.

Response example :
```json
{
  "status": "ok",
  "hash": "70aa99ede90f16ffbb7cbb66c8bde1a4e8d37383",
  "extension": "jpeg"
}
```

#### GET /remove/{hash}.{extension}

Remove the related files to the hash and the extension from the server.

Example : ```GET /remove/70aa99ede90f16ffbb7cbb66c8bde1a4e8d37383.jpeg```

#### GET /thumbnail/{hash}.{extension}

Create and return a 128x128 thumbnail of the given file. If the format is not supported by GraphicsMagic, an error is returned.

Example : ```GET /thumbnail/70aa99ede90f16ffbb7cbb66c8bde1a4e8d37383.jpeg``

#### GET /resize/{max_width}/{max_height}/{hash}.{extension}

Resize the given image. The image aspect ratio is conserved.

The image format must be compatible with GraphicsMagick.

Example : ```GET /resize/1280/720/70aa99ede90f16ffbb7cbb66c8bde1a4e8d37383.jpeg```

#### GET /resize/deform/{max_width}/{max_height}/{hash}.{extension}

Same as resize but the ratio is not conserved.

#### GET /convert/{format}/{height}/{hash}.{extension}

Resize the given video. The video aspect ratio is conserved.

The input video format must be compatible with your FFmpeg installation.

Supported output formats : mp4 or webm
Supported output sizes : 240, 480, 720, 1080

Example : ```GET /convert/mp4/720/e7c7c984066753d5cc52e97f26f4f7892df67bacb.wmv```

#### GET /thumbnail/{URL}

Create and return a 128x128 thumbnail of the distant image.

Example : ```GET /thumbnail/http://upload.wikimedia.org/wikipedia/commons/d/d3/Veymont-aiguille_mg-k.jpg```

#### GET /resize/{max_width}/{max_height}/{URL}

Resize the distant image. The image aspect ratio is conserved.

Example : ```GET /resize/1280/720/http://upload.wikimedia.org/wikipedia/commons/d/d3/Veymont-aiguille_mg-k.jpg```

#### GET /resize/deform/{max_width}/{max_height}/{URL}

Same as resize but the ratio is not conserved.

#### GET /convert/{format}/{height}/{URL}

Resize the distant video. The video ratio is conserved.

The input video format must be compatible with your FFmpeg installation.

Supported output formats : mp4 or webm
Supported output sizes : 240, 480, 720, 1080

Example : ```GET /convert/webm/480/http://example.net/video.flv```

#### GET /{hash}.{extension}

Return the file :-)

## Behind

 * [NodeJs](http://nodejs.org/)
 * [GraphicsMagick](http://www.graphicsmagick.org/) with [gm](http://aheckmann.github.io/gm/)
 * [FFmpeg](https://www.ffmpeg.org/) with [node-fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)
 * [Express](http://expressjs.com/)
 * [Bootstrap](http://getbootstrap.com)
 * [jQuery](http://jquery.com)
 * [jQuery File Upload](http://blueimp.github.io/jQuery-File-Upload/)
 * [NeDB](https://github.com/louischatriot/nedb)

## Configuration

You can change the http listening port, the user-agent and the list of basic http authentification username/password couples in the config.json file.

## Screenshot (work in progress)

![Old screenshot](http://i.imgur.com/vydii2e.png)

### Acknowledgements

This library is developed in context of the [BRIDGE](http://www.bridgeproject.eu/en) project.

### Licence

The source code of this library is licenced under the MIT License.
