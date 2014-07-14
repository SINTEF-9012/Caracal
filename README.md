Caracal
=======

Caracal is a light files and images server.

It is a HTTP REST server, with a HTML5 user interface.

### Features

 * Files upload !
 * Drag and drop support
 * Progression bar for slow connexions
 * File suppressions
 * Thumbnails (for pictures and videos)
 * Resizing
 * Can fetch HTTP files
  * With a cache
  * Transparent resizing
  * Basic HTTP authentification support

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

Resize the given file. The image ratio is conserved.

Example : ```GET /resize/1280/720/70aa99ede90f16ffbb7cbb66c8bde1a4e8d37383.jpeg```

#### GET /thumbnail/{URL}

Create and return a 128x128 thumbnail of the distant image.

Example : ```GET /thumbnail/http://upload.wikimedia.org/wikipedia/commons/d/d3/Veymont-aiguille_mg-k.jpg```

#### GET /resize/{max_width}/{max_height}/{URL}

Resize the distant image. The image ratio is conserved.

Example : ```GET /resize/1280/720/http://upload.wikimedia.org/wikipedia/commons/d/d3/Veymont-aiguille_mg-k.jpg```

#### GET /{hash}.{extension}

Return the file :-)

## Behind

 * [NodeJs](http://nodejs.org/)
 * [GraphicsMagick](http://www.graphicsmagick.org/) with [gm](http://aheckmann.github.io/gm/)
 * [Express](http://expressjs.com/)
 * [Bootstrap](http://getbootstrap.com)
 * [jQuery](http://jquery.com)
 * [jQuery File Upload](http://blueimp.github.io/jQuery-File-Upload/)
 * [NeDB](https://github.com/louischatriot/nedb)

## Usage

```
$ git clone https://github.com/SINTEF-9012/Caracal.git
$ cd Caracal
$ npm install
$ bower install
$ node server.js
```

## Configuration

You can change the http listening port, the user-agent and the list of basic http authentification username/password couples in the config.json file.

## Screenshot (work in progress)

![Old screenshot](http://i.imgur.com/vydii2e.png)
