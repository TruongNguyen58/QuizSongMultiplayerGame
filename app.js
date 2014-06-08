/**
 * Module dependencies.
 */

var express = require('express'),
socketio = require('socket.io'), 
http = require('http'), 
app_server = module.exports, 
game_server = require('./game.server.js'), 
path = require('path'),
https = require('https'),
fs = require('fs');

var sslOptions = {
  key: fs.readFileSync('ssl.key'),
  cert: fs.readFileSync('ssl.crt'),
  ca: fs.readFileSync('sub.class1.server.ca.pem'),
  // requestCert: true,
  // rejectUnauthorized: false
};

var app = express();

var allowCrossDomain = function(req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
	res.header('Access-Control-Allow-Headers',
			'Content-Type, Authorization, Content-Length, X-Requested-With');

	// intercept OPTIONS method
	if ('OPTIONS' == req.method) {
		res.send(200);
	} else {
		next();
	}
};

app.configure(function() {
	app.use(allowCrossDomain);
	app.set('port', 3002);
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(express.favicon());
	app.use(express.logger('dev'));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function() {
	app.use(express.errorHandler());
});

app.get('/users', function(req, res) {
	game_server.users(req, res);
});
app.get('/ping', function(req, res) {
	res.send('pong');
});

var server = app.listen(app.get('port'), function() {
	console.log("Express server listening on port " + app.get('port'));
});

// var server = https.createServer(sslOptions,app).listen(app.get('port'), function(){
//   console.log("Secure Express server listening on port " + app.get('port'));
// });  

var io = socketio.listen(server, {
	origins : '*:*'
});
io.set('origins', '*:*');

io.configure('development', function() {
	io.set('transports', [ 'xhr-polling' ]);
	io.set("polling duration", 15);
	io.set('close timeout', 15); // 24h time out
});

io.sockets.on('connection', function(socket) {
	socket.on('setPlayer', function(data) {
		console.log("CLIENT:" + socket.id + " CONNECTED TO SERVER");
		game_server.setPlayer(socket.id, data);
	});

	socket.on('request', function(msg) {
		var obj = JSON.parse(msg);
		console.log("Receive request type from client: " + obj.type);
		try {
			if (obj.type == "chat") {
				game_server.chat(obj);
			}
			if (obj.type == "sendMsgToOtherClient") {
				game_server.sendMsgToOtherClient(obj);
			}  else if (obj.type == "playerStatus") {
				game_server.checkPlayerStatus(socket.id, obj);
			}else if (obj.type == "findGame") {
				game_server.findGame(obj);
			}else if (obj.type == "findPlayer") {
				game_server.findPlayer(obj);
			} else if (obj.type == "createGame") {
				game_server.createGame(obj);
			} else if (obj.type == "createQuickGame") {
				game_server.createQuickGame(obj);
			} else if (obj.type == "updateGame") {
				game_server.updateGame(obj);
			} else if (obj.type == "joinGame") {
				game_server.joinGame(obj);
			} else if (obj.type == "exitWaitingGame") {
				game_server.exitWaitingGame(obj);
			} else if (obj.type == "readyForGame") {
				game_server.readyForGame(obj);
			} else if (obj.type == "checkStartGame") {
				game_server.checkStartGame(obj);
			} else if (obj.type == "findQuickMatch") {
				game_server.findQuickMatch(obj);
			} else if (obj.type == "confirmJoinGame") {
				game_server.confirmJoinGame(obj);
			} else if (obj.type == "startGame") {
				game_server.startGame(obj);
			} else if (obj.type == "finishCache") {
				game_server.onFinishCache(obj);
			} else if (obj.type == "playerAnswer") {
				game_server.onPlayerAnswer(obj);
			}  else if (obj.type == "onlinePlayers") {
				game_server.getAvailablePlayers(socket.id, obj);
			} else if (obj.type == "waitingGames") {
				game_server.getWaitingGames(socket.id, obj);
			} else if (obj.type == "playingGames") {
				game_server.getPlayingGames(socket.id, obj);
			} else if (obj.type == "invite") {
				game_server.inviteToGame(socket.id, obj);
			} else if (obj.type == "requestEndGame") {
				game_server.onReceiveRqEndGame(obj);
			} else if (obj.type == "playerQuitGame") {
				game_server.onUserQuitGame(obj);
			} else if (obj.type == "setPlayerStatus") {
				game_server.setPlayerStatus(obj);
			} else if (obj.type == "pauseGame") {
				game_server.onPauseGame(obj);
			} else if (obj.type == "resumeGame") {
				game_server.onResumeGame(obj);
			} else if (obj.type == "playerLogOut") {
				game_server.onUserLogout(socket.id);
			} else if (obj.type == "sendMsgToAll") {
				var dataToSend = {
					"notice" : "sendMsgToAll"
				};
				dataToSend.data = obj;
				var channelKey = 'channel';
				if(!dataToSend.data.hasOwnProperty(channelKey)) {
					dataToSend.data[channelKey] = "";
				}
				sendMsgToAllClients(dataToSend);
			}
		} catch (err) {
			console.log("Errorrrorororoororororororororororororo");
		}
	});
	socket.on('disconnect', function() {
		game_server.onUserDisconnect(socket.id);
	});
});

function sendMsgToAllClients(msg) {
	console.log("xxxx" + JSON.stringify(msg));
	try {
		io.sockets.emit('message', msg);
	} catch (err) {
		console.log("Error: " + JSON.stringify(err));
	}
};

app_server.sendMsgToClient = function(sId, msg) {
	try {
		// console.log("sendMsgToClient: " + sId + " with msg: " + JSON.stringify(msg));
		io.sockets.sockets[sId].emit('message', msg);
	} catch (err) {
		console.log("Error: " + JSON.stringify(err));
	}

};

app_server.sendToClient = function(sId, notice, msg) {
	try {
		// console.log("sendMsgToClient: " + sId + " with msg: " + JSON.stringify(msg));
		io.sockets.sockets[sId].emit(notice, msg);
	} catch (err) {
		console.log("Error: " + JSON.stringify(err));
	}

};

var hasOwnProperty = Object.prototype.hasOwnProperty;
