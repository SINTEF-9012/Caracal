var express = require('express'),
	formidable = require('formidable'),
	mime = require('mime'),
	fs = require('fs'),
	url = require('url'),
	http = require('http'),
	https = require('https'),
	crypto = require('crypto'),
	temp = require('temp'),
	gm = require('gm'),
	Nedb = require('nedb');

var config = require('./config.json');

var filesDb = new Nedb({filename: 'files.db', autoload:true}),
	picturesSizeDb = new Nedb({filename: 'picturesSizes.db', autoload:true});

filesDb.ensureIndex({ fieldName: 'url', unique: true, sparse: true });

var app = express();

app.use(express.compress());
app.use(express.logger());
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
					res.send({name: f.name, status: 'exists'});
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
							res.send({name: f.name, status: 'ok'});
						});
				
					});
				}
			});
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

				gm(uploadPath).thumb(128,128,thumbnailPath, 90, function(err) {
					if (err) {
						res.send(500, "Unable to resize the image. Is it really an image ?");
						return;
					}

					picturesSizeDb.insert({unlink: thumbnailPath, path:path});
					res.header('Cache-Control', config.cache);
					res.sendfile(thumbnailPath);
				});
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

				gm(uploadPath).resize(width,height, '>')
					.noProfile().write(fullResizedPath, function(err) {
						if (err) {
							res.send(500, "Unable to resize the image. Is it really an image ?");
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

			(u.protocol === 'https:' ? https : http).get(u, function(httpres) {
			
				var type = httpres.headers['content-type'];

				if (res) {
					res.status(httpres.statusCode);
					res.type(type);
					res.header('Cache-Control', config.cache);
					httpres.pipe(res);	
				}


				var extension = mime.extension(type);

				var temppath = temp.path({suffix: '.'+extension});
				console.log(temppath);

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

app.get(/^\/(https?:\/\/.+)$/, function(req, res) {
	fetchDistantFile(req.params[0], res);
});

app.get(/^\/fetch\/(https?:\/\/.+)$/, function(req, res) {
	fetchDistantFile(req.params[0], false, function() {
		res.send("ok");
	}, res);
});

app.get(/^\/thumbnail\/(https?:\/\/.+)$/, function(req, res) {
	var path = req.params[0];

	fetchDistantFile(path, false, function(filepath, hash, extension) {
		sendThumbnail(hash+"."+extension, res);
	}, res);
});

app.get(/^\/resize\/(\d+)\/(\d+)\/(https?:\/\/.+)$/, function(req, res) {
	var path = req.params[2],
		width = parseInt(req.params[0]),
		height = parseInt(req.params[1]);

	fetchDistantFile(path, false, function(filepath, hash, extension) {
		sendResizedImage(hash+"."+extension, width, height, res);
	}, res);
});

var server = app.listen(config.port, function() {
	console.log("Server started on http://localhost:"+config.port+"/");
});
