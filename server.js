var express = require('express'),
	compression = require('compression'),
	morgan = require('morgan'),
	formidable = require('formidable'),
	mime = require('mime'),
	fs = require('fs'),
	path = require('path'),
	url = require('url'),
	http = require('follow-redirects').http,
	https = require('follow-redirects').https,
	crypto = require('crypto'),
	temp = require('temp'),
	gm = require('gm'),
	async = require('async'),
	Nedb = require('nedb'),
	retricon = require('retricon'),
	ffmpeg = require('fluent-ffmpeg');

var config = require('./config.json');

var datapath = process.env.CARACAL_DATAPATH || config.datapath;
if (datapath.slice(-1) !== '/') {
	datapath += '/';
}
var uploadDatapath = datapath+"uploads";

var filesDb = new Nedb({filename: datapath+'files.db', autoload:true}),
	picturesSizeDb = new Nedb({filename: datapath+'picturesSizes.db', autoload:true});

filesDb.ensureIndex({ fieldName: 'url', unique: true, sparse: true });

var gmWorker = async.queue(function(task, callback) {
	task(callback);
}, process.env.CARACAL_CONCURRENCY || config.concurrency);

var ffmpegWorker = async.queue(function(task, callback) {
	task(callback);
}, Math.min(Math.round((process.env.CARACAL_CONCURRENCY || config.concurrency)/4), 1));

var app = express();

app.use(compression());
app.use(morgan('short'));

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	next();
});

app.use(express.static(__dirname + '/public'));
app.use(express.static(path.resolve(uploadDatapath)));

app.get('/files', function(req, res) {
	filesDb.find({}).sort({mtime: -1}).exec(function(err, docs) {
		res.send(docs);
	});
});

app.get('/paginateFiles/:page', function(req, res) {
	var pageSize = req.query.hasOwnProperty('pageSize') ?
			Math.max(2, parseInt(req.query.pageSize)) : 10,
		page = Math.max(-1, parseInt(req.params.page));


	var req = filesDb.find({});

	if (page >= 0) {
		req.sort({mtime: 1});
		req.skip(pageSize * page);
		req.limit(pageSize);
	} else {
		req.sort({mtime: -1});
		req.limit(pageSize);
	}

	req.exec(function(err, docs) {
		var req = filesDb.count({}, function(err, count) {
			res.json({
				files: docs,
				count: count
			});
		});
	});

});

app.get(/^\/resize\/(deform\/)?(\d+)\/(\d+)\/([a-fA-F0-9]{40}\.[a-zA-Z0-9]+)$/, function(req, res) {
	var path = req.params[3],
		width = parseInt(req.params[1]),
		height = parseInt(req.params[2]),
		deform = !!req.params[0];
	
	sendResizedImage(path, width, height, deform, res);
});

app.get(/^\/thumbnail\/([a-fA-F0-9]{40}\.[a-zA-Z0-9]+)$/, function(req, res) {
	var path = req.params[0];
	sendThumbnail(path, res);
});

app.post('/upload', function(req, res) {
	var form = new formidable.IncomingForm();
	form.uploadDir = uploadDatapath;
	form.keepExtensions = true;
	form.hash = 'sha1';

	form.parse(req, function(err, fields, files) {
		if (err || !files) {
			console.log("File upload error", err);
			res.status(500).send("Sorry, file upload error");
			return;
		}

		for (var key in files) {
			var f = files[key];

			var extension = mime.extension(f.name ? mime.lookup(f.name) : f.type);


			var path = uploadDatapath+"/"+f.hash+"."+extension;

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

	var deletionsKey = process.env.CARACAL_DELETIONS_KEY || config['deletions-key'];
	if (deletionsKey && deletionsKey !== req.query.key) {
		res.status(403).send('Missing or wrong deletions key');
		return;
	}

	var path = req.params[0];


	var	uploadPath = uploadDatapath+"/"+path;

	fs.unlink(uploadPath);

	var hash = path.slice(0, 40),
		extension = path.slice(41);

	picturesSizeDb.find({path: path}, function(err, docs) {
		if (err) {
			res.status(500).send(err);
			return;
		}
	
		docs.forEach(function(doc) {
			fs.unlink(doc.unlink);
		});

		picturesSizeDb.remove({path: path});
		
		filesDb.remove({hash: hash, extension:extension}, {}, function(err, numRemoved) {
			if (err) {
				res.status(500).send(err);
				return;
			}

			res.send({numRemoved:numRemoved});
		});
	});
});

function createThumbnail(path, uploadPath, thumbnailPath, res) {
	gmWorker.push(function(callback){
		gm(uploadPath).autoOrient().thumb(128,128,thumbnailPath, 90, callback);
	}, function(err) {
		if (err) {
			res.redirect('/broken_thumbnail.png');
			console.log(err);
			return;
		}
		picturesSizeDb.insert({unlink: thumbnailPath, path:path});
		res.header('Cache-Control', config.cache);
		res.sendFile(thumbnailPath, {root: __dirname});
	});
}

function sendThumbnail(path, res) {
	var thumbnailPath = uploadDatapath+"/thumbnail-"+path,
		uploadPath = uploadDatapath+"/"+path;

	var isVideo = /^video\//.test(mime.lookup(path));

	if (isVideo) {
		thumbnailPath += '.png';
	}

	fs.exists(thumbnailPath, function(exists) {
		if (exists) {
			res.header('Cache-Control', config.cache);
			res.sendFile(thumbnailPath, {root: __dirname});
		} else {
			fs.exists(uploadPath, function(exists) {
				if (!exists) {
					res.status(404).send("File not found, sorry");
					return;
				}

				if (isVideo) {
					ffmpegWorker.push(function(callback){
						ffmpeg(uploadPath).on('error', function(err,stdout,stderr) {
							console.log(err);
							res.redirect('/broken_thumbnail.png');
							callback();
						}).on('end', function() {
							var ffmpegPath = uploadDatapath+'/ffmpeg-1-'+path+'.png'
							picturesSizeDb.insert({unlink: ffmpegPath, path:path});
							callback();
							createThumbnail(path, ffmpegPath, thumbnailPath+'.png', res);
						}).takeScreenshots({
							count: 1,
							timemarks: ['0.1'],
							filename: 'ffmpeg-%i-%f'
						}, uploadDatapath);
					});

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

function sendResizedImage(path, width, height, deform, res) {
	var resizedPath = "/"+width+"x"+height+(deform ? "-deform-" : "-" ) + path,
		fullResizedPath = uploadDatapath+resizedPath,
		uploadPath = uploadDatapath+"/"+path;

	fs.exists(fullResizedPath, function(exists) {
		if (exists) {
			res.header('Cache-Control', config.cache);
			res.sendFile(fullResizedPath, {root: __dirname});
		} else {
			fs.exists(uploadPath, function(exists) {
				if (!exists) {
					res.status(404).send("File not found, sorry");
					return;
				}

				gmWorker.push(function(callback){
					gm(uploadPath).autoOrient().resize(width,height, deform ? '!>' : '>')
						.noProfile().write(fullResizedPath, callback);
				}, function(err) {
						if (err) {
							console.log(err);
							res.redirect('/broken_thumbnail.png');
							return;
						}

						picturesSizeDb.insert({unlink: fullResizedPath, path:path});

						res.header('Cache-Control', config.cache);
						res.sendFile(fullResizedPath, {root: __dirname});
				});
			});

		}
	});
}

function sendConvertedVideo(path, format, size, res) {
	var convertedPath = "/ffmpeg-"+path+"-"+size+"."+format,
		fullConvertedPath = uploadDatapath+"/"+convertedPath,
		uploadPath = uploadDatapath+"/"+path;

	fs.exists(fullConvertedPath, function(exists) {
		if (exists) {
			res.header('Cache-Control', config.cache);
			res.sendFile(fullConvertedPath, {root: __dirname});
		} else {
			fs.exists(uploadPath, function(exists) {
				if (!exists) {
					res.status(404).send("File not found, sorry");
					return;
				}


				console.log("The file "+path+" will be converted to "+format);

				ffmpegWorker.push(function(callback){
					var proc = ffmpeg(uploadPath);

					if (format === 'mp4') {
						proc.format('mp4')
							.videoCodec('libx264')
							.audioCodec('aac');
					} else if (format === 'webm') {
						proc.format('webm')
							.videoCodec('libvpx')
							//.videoBitrate('1024k')
							.audioCodec('libvorbis');
					}


					proc.size('?x'+size)
						/*.fps(30)
						.audioChannels(2)
						.audioFrequency(44100)
						.audioBitrate('192k')*/
						.on('end', function() {
							console.log("The file "+path+" has been converted succesfully.");
							picturesSizeDb.insert({unlink: fullConvertedPath, path:path});
							res.header('Cache-Control', config.cache);
							res.sendFile(fullConvertedPath, {root: __dirname});
							callback();
						})
						.on('error', function(err) {
							console.log('An error happened: '+err.message);
							res.status(500).send(err.message);
							fs.exists(fullConvertedPath, function(exists) {
								if (exists) {
									fs.unlink(fullConvertedPath);	
								}
							});
							callback();
						})
						.output(fullConvertedPath)
						//.output(res, {end: true}) // the streaming doesn't work with mp4
						// (it does with flv and .preset('flashvideo') )
						.run();
				});
			})
		}
	})
}

function fetchDistantFile(u2, res, callback, reserror) {
	// Outlook doesn't like the http://
	// It's maybe the same for some other softwares
	u2 = u2.replace(/^http(s?):\/([^\/])/,'http$1://$2');

	filesDb.find({url:u2}, function(err, docs) {
		if (docs.length) {
			var file = docs[0];

			var path = uploadDatapath+'/'+file.hash+'.'+file.extension;
		
			if (res) {
				res.sendFile(path, {root: __dirname});
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

				var temppath = temp.path({suffix: '.'+extension, prefix: 'temp-', dir: uploadDatapath});

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
					var path = uploadDatapath+'/'+hash+'.'+extension;

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
					res.status(404).send(e.message);
				} else if (reserror) {
					reserror.status(404).send(e.message);
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

app.get(/^\/resize\/(deform\/)?(\d+)\/(\d+)\/https?:\/\/?.+$/, function(req, res) {
	var path = req.url.match(/^\/resize\/(deform\/)?\d+\/\d+\/(https?:\/\/?.+)$/)[2],
		width = parseInt(req.params[1]),
		height = parseInt(req.params[2]),
		deform = !!req.params[0];

	fetchDistantFile(path, false, function(filepath, hash, extension) {
		sendResizedImage(hash+"."+extension, width, height, deform, res);
	}, res);
});

app.get('/identicon/:hash', function(req, res) {
	var style = (req.query.style && retricon.style.hasOwnProperty(req.query.style)) ? req.query.style : 'window';
	var hash = crypto.createHash('sha1').update(req.params.hash).digest('hex');
	var path = datapath+'identicons/'+hash+'-'+style+'.png';
	fs.exists(path, function(exists) {

		if (exists) {
			res.header('Cache-Control', config.cache);
			res.sendFile(path, {root: __dirname});
		} else {
			gmWorker.push(function(callback){
				retricon(req.params.hash, retricon.style[style]).write(path, callback);
			}, function(err) {
				if (err) {
					res.status(500).send(err);
					return;
				}

				res.header('Cache-Control', config.cache);
				res.sendFile(path, {root: __dirname});
			});
		}
	});
});

app.get(/^\/convert\/(mp4|webm)\/(1080|720|480|240)\/([a-fA-F0-9]{40}\.[a-zA-Z0-9]+)$/, function(req, res) {
	var path = req.params[2],
		format = req.params[0];
		size = parseInt(req.params[1]);
	
	sendConvertedVideo(path, format, size, res);
});

app.get(/^\/convert\/(mp4|webm)\/(1080|720|480|240)\/(https?:\/\/?.+)$/, function(req, res) {
	var path = req.params[2],
		format = req.params[0],
		size = parseInt(req.params[1]);

	fetchDistantFile(path, false, function(filepath, hash, extension) {
		sendConvertedVideo(hash+"."+extension, format, size, res);
	}, res);
});

var serverPort = process.env.CARACAL_PORT || config.port;
var server = app.listen(serverPort, function() {
	console.log("Server started on http://localhost:"+serverPort+"/");
});
