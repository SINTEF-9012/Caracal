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

function checkPath(path, res) {
	if (!/^[a-fA-F0-9]{40}\.\w+$/.test(path)) {
		res.send(403, "The path doesn't look like a correct path. Sorry");
		return false;
	}
	return true;
}

app.get('/resize/:width/:height/:path', function(req, res) {
	var path = req.params.path,
		width = parseInt(req.params.width),
		height = parseInt(req.params.height);
	
	if (!checkPath(path, res)) {
		return;
	}

	var resizedPath = "/"+width+"x"+height+"-"+path,
		fullResizedPath = __dirname + "/uploads"+resizedPath,
		uploadPath = __dirname + "/uploads/"+path;

	fs.exists(fullResizedPath, function(exists) {
		if (exists) {
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
							res.send(500, err);
							return;
						}

						picturesSizeDb.insert({unlink: fullResizedPath, path:path});

						res.sendfile(fullResizedPath);
				});
			});

		}
	});
});

app.get('/thumbnail/:path', function(req, res) {
	var path = req.params.path;

	if (!checkPath(path, res)) {
		return;
	}

	var thumbnailPath = __dirname + "/uploads/thumbnail-"+path,
		uploadPath = __dirname + "/uploads/"+path;

	fs.exists(thumbnailPath, function(exists) {
		if (exists) {
			res.sendfile(thumbnailPath);
		} else {
			fs.exists(uploadPath, function(exists) {
				if (!exists) {
					res.send(404, "File not found, sorry");
					return;
				}

				gm(uploadPath).thumb(128,128,thumbnailPath, 90, function(err) {
					if (err) {
						res.send(500, err);
						return;
					}

					picturesSizeDb.insert({unlink: thumbnailPath, path:path});
					res.sendfile(thumbnailPath);
				});
			});
		}
	});
});

app.post('/upload', function(req, res) {
	var form = new formidable.IncomingForm();
	form.uploadDir = __dirname + "/uploads";
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

			var path = __dirname+"/uploads/"+f.hash+"."+extension;

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
						});
				
						res.send({name: f.name, status: 'ok'});
					});
				}
			});
		};


	})
});

app.get('/remove/:path', function(req, res) {
	var path = req.params.path;

	if (!checkPath(path, res)) {
		return;
	}

	var	uploadPath = __dirname + "/uploads/"+path;

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

app.get(/^\/https?:\/\/.+$/, function(req, res) {
	var u2 = req.url.slice(1),
		u = url.parse(u2);

	filesDb.find({url:u2}, function(err, docs) {
		if (docs.length) {
			var file = docs[0];

			var path = __dirname+'/uploads/'+file.hash+'.'+file.extension;
			res.sendfile(path);
		} else {
			(u.protocol === 'https:' ? https : http).get(u, function(httpres) {
			res.status(httpres.statusCode);
			console.log(res);

			var type = httpres.headers['content-type'];
			res.type(type);

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
			httpres.pipe(res);	
			httpres.on('end', function() {

				hash = hash.digest('hex');
				var path = __dirname+'/uploads/'+hash+'.'+extension;

				fs.exists(path, function(exists) {
					if (exists) {
						// Just remove the temporary file, we don't need it
						fs.unlink(temppath);
						console.log("remove", temppath);
					} else {
						fs.rename(temppath, path, function() {
							// filesDb.insert({
							console.log("move", temppath, path);
							// 	size: f.size,
							// 	hash: f.hash,
							// 	extension: extension,
							// 	type: f.type,
							// 	name: f.name,
							// 	mtime: f.lastModifiedDate
							// });
					
							// res.send({name: f.name, status: 'ok'});
						});
					}
					filesDb.insert({
						size: size,
						hash: hash,
						extension: extension,
						type: type,
						name: u2.match(/[^\/]*$/)[0],
						url: u2, 
						mtime: new Date()
					});
				});
			});
		}).on('error', function(e) {
			res.send(404, e.message);
		});
		}
	});

});

var server = app.listen(8075, function() {
	console.log("Server started on http://localhost:8075/");
});
