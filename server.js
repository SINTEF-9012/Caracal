var express = require('express'),
	compression = require('compression'),
	morgan = require('morgan'),
	formidable = require('formidable'),
	mime = require('mime'),
	fs = require('fs'),
	url = require('url'),
	http = require('http'),
	https = require('https'),
	crypto = require('crypto'),
	temp = require('temp'),
	gm = require('gm'),
	Nedb = require('nedb'),
	retricon = require('retricon'),
	ffmpeg = require('fluent-ffmpeg');

var config = require('./config.json');

var filesDb = new Nedb({filename: 'files.db', autoload:true}),
	picturesSizeDb = new Nedb({filename: 'picturesSizes.db', autoload:true});

filesDb.ensureIndex({ fieldName: 'url', unique: true, sparse: true });

var app = express();

app.use(compression());
app.use(morgan('short'));

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	next();
});

app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/uploads'));

app.get('/files', function(req, res) {
	filesDb.find({}).sort({mtime: -1}).exec(function(err, docs) {
		res.send(docs);
	});
});

app.get(/^\/resize\/(\d+)\/(\d+)\/([a-fA-F0-9]{40}\.[a-zA-Z0-9]+)$/, function(req, res) {
	var path = req.params[2],
		width = parseInt(req.params[0]),
		height = parseInt(req.params[1]);
	
	sendResizedImage(path, width, height, res);
});

app.get(/^\/thumbnail\/([a-fA-F0-9]{40}\.[a-zA-Z0-9]+)$/, function(req, res) {
	var path = req.params[0];
	sendThumbnail(path, res);
});

app.post('/upload', function(req, res) {
	var form = new formidable.IncomingForm();
	form.uploadDir = "./uploads";
	form.keepExtensions = true;
	form.hash = 'sha1';

	form.parse(req, function(err, fields, files) {
		if (err || !files) {
			console.log("File upload error", err);
			res.send(500, "Sorry, file upload error");
			return;
		}

		for (var key in files) {
			var f = files[key];

			var extension = mime.extension(f.type);

			var path = "./uploads/"+f.hash+"."+extension;

			fs.exists(path, function(exists) {
				if (exists) {
					fs.unlink(f.path);
					res.send({name: f.name, status: 'exists', hash: f.hash, extension: extension});
				} else {

					fs.rename(f.path, path, function() {
						filesDb.insert({
							size: f.size,
							hash: f.hash,
							extension: extension,
							type: f.type,
							name: f.name,
							mtime: f.lastModifiedDate
						}, function() {
							res.send({name: f.name, status: 'ok', hash: f.hash, extension: extension});
						});
				
					});
				}
			});
			return;
		};


	})
});

app.get(/^\/remove\/([a-fA-F0-9]{40}\.[a-zA-Z0-9]+)$/, function(req, res) {
	var path = req.params[0];


	var	uploadPath = "./uploads/"+path;

	fs.unlink(uploadPath);

	var hash = path.slice(0, 40),
		extension = path.slice(41);

	picturesSizeDb.find({path: path}, function(err, docs) {
		if (err) {
			res.send(500, err);
			return;
		}
	
		docs.forEach(function(doc) {
			fs.unlink(doc.unlink);
		});

		picturesSizeDb.remove({path: path});
		
		filesDb.remove({hash: hash, extension:extension}, {}, function(err, numRemoved) {
			if (err) {
				res.send(500, err);
				return;
			}

			res.send({numRemoved:numRemoved});
		});
	});
});

function createThumbnail(path, uploadPath, thumbnailPath, res) {
	gm(uploadPath).autoOrient().thumb(128,128,thumbnailPath, 90, function(err) {
		if (err) {
			res.redirect('/broken_thumbnail.png');
			console.log(err);
			return;
		}

		picturesSizeDb.insert({unlink: thumbnailPath, path:path});
		res.header('Cache-Control', config.cache);
		res.sendfile(thumbnailPath);
	});
}

function sendThumbnail(path, res) {
	var thumbnailPath = "./uploads/thumbnail-"+path,
		uploadPath = "./uploads/"+path;

	fs.exists(thumbnailPath, function(exists) {
		if (exists) {
			res.header('Cache-Control', config.cache);
			res.sendfile(thumbnailPath);
		} else {
			fs.exists(uploadPath, function(exists) {
				if (!exists) {
					res.send(404, "File not found, sorry");
					return;
				}

				// If the file is a video
				if (/^video\//.test(mime.lookup(path))) {
					ffmpeg(uploadPath).on('error', function(err,stdout,stderr) {
						console.log(err);
						res.redirect('/broken_thumbnail.png');
					}).on('end', function() {
						var ffmpegPath = './uploads/ffmpeg-1-'+path+'.png'
						picturesSizeDb.insert({unlink: ffmpegPath, path:path});
						createThumbnail(path, ffmpegPath, thumbnailPath, res);
					}).takeScreenshots({
						count: 1,
						timemarks: ['0.1'],
						filename: 'ffmpeg-%i-%f'
					}, './uploads');

				// If it's not a video, imagemagick will do the job
				// We don't check the filetype, the error callback is triggered if
				// imagemagick can't create a thumbnail
				} else {
					createThumbnail(path, uploadPath, thumbnailPath, res);
				}

			});
		}
	});
}

function sendResizedImage(path, width, height, res) {
	var resizedPath = "/"+width+"x"+height+"-"+path,
		fullResizedPath = "./uploads"+resizedPath,
		uploadPath = "./uploads/"+path;

	fs.exists(fullResizedPath, function(exists) {
		if (exists) {
			res.header('Cache-Control', config.cache);
			res.sendfile(fullResizedPath);
		} else {
			fs.exists(uploadPath, function(exists) {
				if (!exists) {
					res.send(404, "File not found, sorry");
					return;
				}

				gm(uploadPath).autoOrient().resize(width,height, '>')
					.noProfile().write(fullResizedPath, function(err) {
						if (err) {
							console.log(err);
							res.redirect('/broken_thumbnail.png');
							return;
						}

						picturesSizeDb.insert({unlink: fullResizedPath, path:path});

						res.header('Cache-Control', config.cache);
						res.sendfile(fullResizedPath);
				});
			});

		}
	});
}

function fetchDistantFile(u2, res, callback, reserror) {
	// Outlook doesn't like the http://
	// It's maybe the same for some other softwares
	u2 = u2.replace(/^http(s?):\/([^\/])/,'http$1://$2');

	filesDb.find({url:u2}, function(err, docs) {
		if (docs.length) {
			var file = docs[0];

			var path = './uploads/'+file.hash+'.'+file.extension;
		
			if (res) {
				res.sendfile(path);
			}

			if (callback) {
				callback(path, file.hash, file.extension);
			}
		} else {

			var u = url.parse(u2);

			if (!u.auth && config.auths[u.hostname]) {
				u.auth = config.auths[u.hostname];
			}

			u.headers = {
				'User-Agent': config['User-Agent'],
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': 'fr,en-US;q=0.8,en;q=0.6'
			};

			(u.protocol === 'https:' ? https : http).get(u, function(httpres) {
			
				var type = httpres.headers['content-type'];

				if (res) {
					res.status(httpres.statusCode);
					res.type(type);
					res.header('Cache-Control', config.cache);
					httpres.pipe(res);	
				}


				var extension = mime.extension(type);

				var temppath = temp.path({suffix: '.'+extension, prefix: 'temp-', dir: './uploads'});

				var file = fs.createWriteStream(temppath);

				var hash = crypto.createHash('sha1');
				var size = 0;
				httpres.on('data', function(data){
					hash.update(data);
					size += data.length;
				});

				httpres.pipe(file);
				httpres.on('end', function() {

					hash = hash.digest('hex');
					var path = './uploads/'+hash+'.'+extension;

					fs.exists(path, function(exists) {
						if (exists) {
							// Just remove the temporary file, we don't need it
							fs.unlink(temppath);
						} else {
							fs.rename(temppath, path);
						}
					});

					var name = u2.match(/[^\/]*$/)[0];
					if (!name) {
						name = "untitled";
					}

					filesDb.insert({
						size: size,
						hash: hash,
						extension: extension,
						type: type,
						name: name,
						url: u2, 
						mtime: new Date()
					}, function() {
						if (callback) {
							callback(path, hash, extension);
						}
					});
				});
			}).on('error', function(e) {
				if (res) {
					res.send(404, e.message);
				} else if (reserror) {
					reserror.send(404, e.message);
				}
			});
		}
	});
}

app.get(/^\/https?:\/\/?.+$/, function(req, res) {
	fetchDistantFile(req.url.slice(1), res);
});

app.get(/^\/fetch\/https?:\/\/?.+$/, function(req, res) {
	fetchDistantFile(req.url.slice(7), false, function(filepath, hash, extension) {
		res.send({status: "ok", hash: hash, extension: extension});
	}, res);
});

app.get(/^\/thumbnail\/https?:\/\/?.+$/, function(req, res) {
	var path = req.url.slice(11);

	fetchDistantFile(path, false, function(filepath, hash, extension) {
		sendThumbnail(hash+"."+extension, res);
	}, res);
});

app.get(/^\/resize\/(\d+)\/(\d+)\/https?:\/\/?.+$/, function(req, res) {
	var path = req.url.match(/^\/resize\/\d+\/\d+\/(https?:\/\/?.+)$/)[1],
		width = parseInt(req.params[0]),
		height = parseInt(req.params[1]);

	fetchDistantFile(path, false, function(filepath, hash, extension) {
		sendResizedImage(hash+"."+extension, width, height, res);
	}, res);
});

app.get('/identicon/:hash', function(req, res) {
	var style = (req.query.style && retricon.style.hasOwnProperty(req.query.style)) ? req.query.style : 'window';
	var hash = crypto.createHash('sha1').update(req.params.hash).digest('hex');
	var path = './identicons/'+hash+'-'+style+'.png';
	fs.exists(path, function(exists) {

		if (exists) {
			res.header('Cache-Control', config.cache);
			res.sendfile(path);
		} else {
			retricon(req.params.hash, retricon.style[style]).write(path, function(err) {
				if (err) {
					res.send(500, err);
					return;
				}

				res.header('Cache-Control', config.cache);
				res.sendfile(path);
			});
		}
	});
})

var server = app.listen(config.port, function() {
	console.log("Server started on http://localhost:"+config.port+"/");
});
