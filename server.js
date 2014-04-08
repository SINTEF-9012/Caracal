var express = require('express'),
	formidable = require('formidable'),
	mime = require('mime'),
	fs = require('fs'),
	gm = require('gm'),
	Nedb = require('nedb');

var filesDb = new Nedb({filename: 'files.db', autoload:true}),
	picturesSizeDb = new Nedb({filename: 'picturesSizes.db', autoload:true});

var app = express();

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
	form.uploadDir = "./uploads";
	form.keepExtensions = true;
	form.hash = 'sha1';

	form.parse(req, function(err, fields, files) {
		if (err || !files || !files.file) {
			console.log("File upload error", err);
			res.send(500, "Sorry, file upload error");
			return;
		}

		var f = files.file;

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
					});
			
					res.send({name: f.name, status: 'ok'});
				});
			}
		});


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

var server = app.listen(8075, function() {
	console.log("Server started on http://localhost:8075/");
});
