Caracal
=======

Caracal is a light multimedia server designed as a service.

It provides a simple HTTP REST API and a HTML5 user interface.

### Installation
```npm install caracal```

_GraphicsMagick or ImageMagick is required. FFmpeg (not libav) is necessary for video resizing and converting._

### [Docker](https://registry.hub.docker.com/u/yellowiscool/caracal/)

```sh
docker pull yellowiscool/caracal

docker volume create --name caracal-data

docker run -d --restart=always \
  --name caracal \
  -v caracal-data:/usr/src/app/data \
  -e DELETIONS_KEY=secretkey \
  yellowiscool/caracal
```


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
 * Configurable generation of identifiers
  * human readable
  * adjective-adjective-animal
  * shortid
  * sha256

### Notes about the scalability

Caracal is designed to run as a single node on a single server. It does not support horizontal scaling. It is suitable for prototyping or simple non-critical multimedia applications, but it cannot be used to compete with Youtube or Imgur (yet). In case of a high load, a processing queue is used.

## Configuration

Caracal can be configured using environment variables.

|Environment Variable|Description|Default value|
|--------------------|-----------|-------------|
|DELETIONS_KEY|The required password/key to delete files.|*needs to be configured*|
|ALLOWED_DOMAINS|Optionnal JSON array of allowed domains, for [CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing)|`*` (all domains are allowed)|
|HTTP_PORT|Listening HTTP port|8075|
|DATAPATH|Location of the storage folder|`./data`|
|CACHE|[HTTP Cache-Control header](https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.9)|`max-age=29030400, public`|
|CONCURRENCY|Number of allowed concurrent image processing tasks|8|
|VIDEO_CONCURRENCY|Number of allowed concurrent video processing tasks|2|
|ALLOWED_SIZES|Array of allowed resizing sizes. If a requested size is not found, the closest size from this array is used instead. Set to `*` to allow every size, but it's not recommended since users can saturate the server by resizing the same image many times. The default configuration allows many sizes, you might want to use fewer sizes.|`[32, 64, 128, 256, 1024, 2048, 4096, 8192, 16384,	50, 100, 200, 400, 500, 600, 800, 1000, 1050, 1200, 1600, 120, 160, 240, 320, 480, 576, 640, 768, 854, 960, 1050, 1080, 1152, 1280, 1440, 1536,  1716, 1920, 2160, 2560, 3200,	3840, 3996, 4320, 4800, 5120, 6400, 6144, 7680, 12288]`|
|ALLOWED_VIDEO_SIZES|Array of allowed resizing sizes, for videos. Similar to ALLOWED_SIZES.|`[144, 240, 360, 480, 720, 1080, 3840]`|
|AUTHS|JSON association table (object) used for HTTP [basic access authentications](https://en.wikipedia.org/wiki/Basic_access_authentication#Client_side), when fetching distant files. keys are the host-names, values are the passwords.|`{}`|
|UA|The HTTP client user agent, to fetch distant files|~Firefox28-Win64|
|IDS_GENERATION|The algorithm used to generate identifiers. See the generation of identifiers section. Accepted values are sillyid, shortid, human-readable, bronze, and hash.|sillyid|

## API

#### GET /

HTML5 user interface.

#### GET /files

JSON list of files stored in the server
```json
[
 {
    "url": "http://upload.wikimedia.org/wikipedia/commons/d/d3/Veymont-aiguille_mg-k.jpg",
    "name": "Veymont-aiguille_mg-k.jpg",
    "id": "ElementaryPertinentWalleye",
    "size": 168454,
    "hash": "698baa587aef2a26bddd8461d6a4e132ae1dcbd5f58aa6e47c20bc703356a8ec",
    "extension": "jpeg",
    "type": "image/jpeg",    
    "mtime": "2014-04-09T11:36:05.145Z"
  },...
]
```

#### POST /upload

Save on the server the provided file
```json
{
  "name": "208T16-05E.jpg",
  "id": "HauntingWholeEsok",
  "size": 4700,
  "status": "ok",
  "hash": "7d15d97340aaf30e08baf92e9e3aa57b969f12540805be265dee44496f4b099f",
  "extension": "png",
  "type": "image/png",
  "mtime": "2017-02-25T11:49:29.002Z",
  "status": "ok"
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
  "url":"http://perdu.com",
  "name":"perdu.com",
  "id":"UnacceptableJoyfulLacewing",
  "size":204,
  "hash":"208e330c75ffd93949be0258660973bef8223917f036325020f3a4c51b4ca430",
  "extension":"html",
  "type":"text/html",
  "mtime":"2017-02-25T11:52:58.522Z",
  "status":"ok"
}
```

#### GET /remove/{hash}.{extension}
#### GET /remove/{id}

Remove the related files to the hash and the extension from the server.

Examples : 

 * ```GET /remove/698baa587aef2a26bddd8461d6a4e132ae1dcbd5f58aa6e47c20bc703356a8ec.jpeg```
 * ```GET /remove/ElementaryPertinentWalleye```

#### GET /thumbnail/{hash}.{extension}
#### GET /thumbnail/{id}

Create and return a 128x128 thumbnail of the given file. If the format is not supported by GraphicsMagic, an error is returned.

Examples :

 * ```GET /thumbnail/698baa587aef2a26bddd8461d6a4e132ae1dcbd5f58aa6e47c20bc703356a8ec.jpeg```
 * ```GET /thumbnail/ElementaryPertinentWalleye```

#### GET /resize/{max_width}/{max_height}/{hash}.{extension}
#### GET /resize/{max_width}/{max_height}/{id}

Resize the given image. The image aspect ratio is conserved.

The image format must be compatible with GraphicsMagick.

Examples :

 * ```GET /resize/1280/720/698baa587aef2a26bddd8461d6a4e132ae1dcbd5f58aa6e47c20bc703356a8ec.jpeg```
 * ```GET /resize/1280/720/ElementaryPertinentWalleye```

#### GET /resize/deform/{max_width}/{max_height}/{hash}.{extension}
#### GET /resize/deform/{max_width}/{max_height}/{id}

Same as resize but the ratio is not conserved.

#### GET /convert/{format}/{height}/{hash}.{extension}
#### GET /convert/{format}/{height}/{id}

Resize the given video. The video aspect ratio is conserved.

The input video format must be compatible with your FFmpeg installation.

Supported output formats : mp4 or webm
Supported output sizes : 240, 480, 720, 1080

Examples :

 * ```GET /convert/mp4/720/e7c7c984066753d5cc52e97f26f4f7892df67bacb.wmv```
 * ```GET /convert/mp4/720/WiryRosyQueensnake```

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
#### GET /{id}

Return the file :-)

## Behind

 * [NodeJs](http://nodejs.org/)
 * [GraphicsMagick](http://www.graphicsmagick.org/) or [ImageMagick](https://www.imagemagick.org/) with [gm](http://aheckmann.github.io/gm/)
 * [FFmpeg](https://www.ffmpeg.org/) with [node-fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)
 * [Express](http://expressjs.com/)
 * [Bootstrap](http://getbootstrap.com)
 * [jQuery](http://jquery.com)
 * [jQuery File Upload](http://blueimp.github.io/jQuery-File-Upload/)
 * [NeDB](https://github.com/louischatriot/nedb)


## Generation of Identifiers

|Name|Description|Example|
|----|-----------|-------|
|[sillyid](https://github.com/Jamesford/SillyId) *(default)*|Generation of fun gfycat like identifiers, following the AdjectiveAdjectiveAnimal pattern.|`HairyOrangeGeckos`|
|[shortid](https://github.com/dylang/shortid)|Short url-friendly identifiers.|`PPBqWA9`|
|[human-readable](https://github.com/coolaj86/human-readable-ids-js)|Easy to spell identifiers, following the adjective-noun-# pattern.|`tricky-chicken-23`
|[bronze](https://github.com/altusaero/bronze)|Collision-resistant ids for distributed systems.|`1482810226160-0-14210-example-1a`|
|hash|Use the sha256 checksum as id.|`698baa587aef2a26bddd8461d6a4e132ae1dcbd5f58aa6e47c20bc703356a8ec`|

## Screenshot (work in progress)

![Old screenshot](http://i.imgur.com/vydii2e.png)

### Acknowledgements

Caracal is developed in context of the [BRIDGE](http://www.bridgeproject.eu/en) and [HUMANE](https://humane2020.eu/) European research projects.

### Licence

The source code of this library is licenced under the MIT License.
