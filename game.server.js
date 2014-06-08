/*  Copyright (c) 2013 TruongNGUYEN
    Server for projectX
    BH Licensed.
 */

var TYPE_INVITE = "invite";
var TYPE_FOUND_PLAYER = "foundPlayer";
var TYPE_PLAYER_NOT_AVAILABLE = "playerNotAvailable";
var TYPE_WELLCOME = "wellcome";
var TYPE_RECEIVE_CONFIRM = "receiveConfirm";
var TYPE_START_GAME = "startGame";
var TYPE_NEXT_ROUND = "nextRound";
var TYPE_PLAYER_ANSWER = "playerAnswer";
var TYPE_END_GAME = "endGame";
var TYPE_PLAYER_DISCONNECT = "playerDisconnect";
var TYPE_PLAYER_RECONNECTED = "playerReconnect";
var TYPE_ONLINE_PLAYERS = "onlinePlayers";
var TYPE_CONNECTED = "userJoined";
var TYPE_CREATE_GAME_SUCCESS = "createGameSuccess";
var TYPE_JOIN_GAME_SUCCESS = "joinGameSuccess";
var TYPE_JOIN_GAME_NOT_SUCCESS = "joinGameNotSuccess";
var TYPE_PLAYER_JOIN_GAME = "playerJoinGame";
var TYPE_PLAYER_EXIT_GAME = "playerExitGame";
var TYPE_PALYER_READY_GAME = "readyForGame";
var TYPE_CHECK_START_GAME = "checkStartGame";
var TYPE_HOST_EXIT_GAME = "hostExitGame";
var TYPE_AVAILABLE_PLAYERS = "availablePlayers";
var TYPE_AVAILABLE_GAMES = "availableGames";
var TYPE_CHAT = "chat";
var intervalTime = 15;
var maxPlayerInGame = 2;
var hasOwnProperty = Object.prototype.hasOwnProperty;

var recordIntervals = {};
var gameTimers = {};
var numberOfPlayerAnswer = {};
var clients = {};
var socketsOfClients = {};
var games = {};
var players = {};
var currentGameOfPlayer = {};

var game_server = module.exports, app_server = require('./app.js'), verbose = true;

game_server.users = function(req, res) {
	var str = "";
	var i = 0;
	Object.keys(players).forEach(
			function(userName) {
				str += (i++) + "--" +  JSON.stringify(players[userName])+ ".           \n";
			});
	res.send(str);
};

game_server.chat = function(obj) {
	log("begin chat with other user");
	var dataToSend = {};
	dataToSend.notice = TYPE_CHAT;
	dataToSend.data = obj;
	obj.players.forEach(function(player) {
		if (clients.hasOwnProperty(player)) {
			log("begin chat with user: " + player + " -- ID: "
					+ clients[player] + " -- dataToSend: "
					+ JSON.stringify(dataToSend));
			app_server.sendMsgToClient(clients[player], dataToSend);
		}
	});
};

game_server.sendMsgToOtherClient = function(obj) {
	var fromClient = obj.fromClient;
	var toClients = obj.toClients;
	var data = obj.msg;
	var dataToSend = {};
	dataToSend.notice = "receiveMsgFromOtherClient";
	dataToSend.fromClient = fromClient;
	dataToSend.msg = data;
	if (data.hasOwnProperty("gameId")) {
		var gameId = data.gameId;
		if (games.hasOwnProperty(gameId)) {
			toClients.forEach(function(toClient) {
				sendMessageToAPlayer(toClient, dataToSend);
			});
		}
	} else {
		toClients.forEach(function(toClient) {
			sendMessageToAPlayer(toClient, dataToSend);
		});
	}
};

game_server.setPlayer = function(sId, data) {
	onUserConnect(sId, data);
	app_server.sendToClient(sId, TYPE_CONNECTED, {
		"clientId" : sId
	});
};

function onUserConnect(sId, playerData) {
	var playerId = playerData.id;
	var i = 0;
	// Does not exist ... so, proceed
	clients[playerId] = sId;
	if (players.hasOwnProperty(playerId)) {
		try {
			if (currentGameOfPlayer.hasOwnProperty(playerId)) {
				var gameId = currentGameOfPlayer[playerId];
				var data = {};
				data.player = playerId;
				endWhenPlayerQuitGame(gameId, "playerQuitGame", data)
			}
		} catch (err) {
		}
		delete players[playerId];
	}
	log(JSON.stringify(playerData));
	players[playerId] = {
		"name" : playerData.name,		
		"status" : playerData.status,
		"socketId" : sId,
		"channel" : playerData.channel,
		"id" : playerId
	};
	Object.keys(socketsOfClients).forEach(function(oldSocketId) {
		if (socketsOfClients[oldSocketId] == playerId) {
			delete socketsOfClients[oldSocketId];
		}
	});
	socketsOfClients[sId] = playerId;
}

game_server.onUserDisconnect = function(sId) {
	try {
		if (socketsOfClients.hasOwnProperty(sId)) {
			var playerId = socketsOfClients[sId];
			if (currentGameOfPlayer.hasOwnProperty(playerId)) {
				var gameId = currentGameOfPlayer[playerId];
				if (games.hasOwnProperty(gameId)) {
					log("games[gameId].playing: "
							+ games[gameId].playing + " -- "
							+ typeof games[gameId].playing);
					if (games[gameId].playing == false
							|| games[gameId].playing == "false") {
						var obj = {
							"gameId" : gameId,
							"isHostPlayer" : games[gameId].clientPlayers[player].isHost,
							"player" : playerId
						};
						exitWaitingGame(obj);
					} else {
						log("User disconnect when playing game");
						var data = {
							"player" : playerId
						};
						endWhenPlayerQuitGame(gameId, "playerQuitGame", data)
					}
				}
			}
			delete players[socketsOfClients[sId]];
			delete clients[socketsOfClients[sId]];
			delete socketsOfClients[sId];
		}
	} catch (err) {
		log("ERORR onUserDisconnect: " + JSON.stringify(err));
	}
};

game_server.onUserLogout = function(sId) {
	try {
		if (socketsOfClients.hasOwnProperty(sId)) {
			delete players[socketsOfClients[sId]];
			delete clients[socketsOfClients[sId]];
			delete socketsOfClients[sId];
		}
	} catch (err) {
		log("ERORR onUserLogout: " + JSON.stringify(err));
	}
};

game_server.setPlayerStatus = function(obj) {
	var playerId = obj.player
	if (players.hasOwnProperty(playerId)){
		players[playerId].status = obj.status;
	}
};

game_server.onUserQuitGame = function(obj) {
	var gameId = obj.gameId;
	var playerId = obj.playerId
	try {
		var data = {};
		data.player = playerId;
		endWhenPlayerQuitGame(gameId, "playerQuitGame", data)
	} catch (err) {
		log("ERORR onUserQuitGame: " + JSON.stringify(err));
	}
};

game_server.checkPlayerStatus = function(sId, obj) {
	try {
		var playerId = obj.player;
		var status = 0;
		if (players.hasOwnProperty(playerId)){
			status = players[playerId].status;
		}
		var dataToSend = {
				"notice" : "playerStatus"
			};
		dataToSend.data = {"player":playerId, "status" : status};
		app_server.sendMsgToClient(sId, dataToSend);
	} catch (err) {
		log("Error when checkPlayerStatus " + JSON.stringify(err));
	}
}; //game_server.checkPlayerStatus

game_server.getAvailablePlayers = function(sId, obj) {
	try {
		var availableUsers = new Array();
		var i = 0;
		Object.keys(players).forEach(
				function(playerId) {
					log("Player: " + JSON.stringify(players[playerId]));
					if (players[playerId].channel == obj.channel)
							// && players[playerId].status == 1)
						if (i <= 200) {
							availableUsers.push(players[playerId]);
						}
					i++;
				});

		var dataToSend = {
			"notice" : TYPE_ONLINE_PLAYERS,
			"data" : {
				"availablePlayers" : availableUsers
			}
		};
		app_server.sendMsgToClient(sId, dataToSend);

	} catch (err) {
		log("Error when get getAvailablePlayers: "
				+ JSON.stringify(err));
	}
}; //game_server.getAvailablePlayers

game_server.getWaitingGames = function(sId, obj) {
	try {
		var waitingGames = new Array();
		var i = 0;
		Object.keys(games).forEach(
				function(gameId) {
					if (games[gameId].channel == obj.channel
							&& games[gameId].playing == "false") {
						waitingGames.push(games[gameId]);
						i++;
					}
				});
		var dataToSend = {
			"notice" : "waitingGames",
			"data" : {
				"games" : waitingGames
			}
		};
		app_server.sendMsgToClient(sId, dataToSend);

	} catch (err) {
		log("Error when get getWaittingGames: " + JSON.stringify(err));
	}
}; //game_server.getWaittingGames

game_server.getPlayingGames = function(sId, obj) {
	try {
		var playingGames = new Array();
		var i = 0;
		Object.keys(games).forEach(
				function(gameId) {
					if (games[gameId].channel == obj.channel
							&& games[gameId].playing == "true") {
						playingGames.push(games[gameId]);
						i++;
					}
				});
		var dataToSend = {
			"notice" : "playingGames",
			"data" : {
				"games" : playingGames
			}
		};
		app_server.sendMsgToClient(sId, dataToSend);

	} catch (err) {
		log("Error when get getPlayingGames: " + JSON.stringify(err));
	}
}; //game_server.getPlayingGames

game_server.findPlayer = function(obj) {
	log("findPlayer : " + JSON.stringify(obj));
	var dataToSend = {};
	dataToSend.notice = TYPE_FOUND_PLAYER;
	log('looking for player' + obj.player +' for user: ' + obj.sender);
	var found = false;
	Object.keys(players).every(
				function(playerId) {
					try{
						if (playerId != null && players[playerId].name.toLowerCase() == obj.player.toLowerCase()){
							log('found user: ' + JSON.stringify(players[playerId]));
							dataToSend.data = {
								"player" : players[playerId],
								"available" : true
							};
							found = true;
							return false;
						}
						return true;
					}
					catch(err) {
						return true;
					}						
				});
	log("find finish");
	if(found == true) {
		log(" found dataToSend xxx: " + JSON.stringify(dataToSend));
	}
	else {
		log("not found");
		dataToSend.data = {
			"player" :  {},
			"available" : false
		};
	}
	app_server.sendMsgToClient(obj.sender, dataToSend);
}; //game_server.findPlayer

game_server.findQuickMatch = function(obj) {
	var dataToSend = {};
	log('looking for a game for user: ' + obj.data.sender);
	var i;
	var keys = Object.keys(object);
	var length = keys.length;
	var result = [];
	for (i = 0; i < length; i++) {
		var p = object[keys[Math.floor(Math.random() * length)]];
		if (p.playerId != obj.player && p.status == 1) {
			result.push(p);
			i++;
		}
		if (i > 4) {
			break;
		}
	}
	if (result.length > 0) {
		for ( var player in result) {
			dataToSend.notice = "inviteQuickMatch";
			dataToSend.data = obj;
			log('found user: ' + JSON.stringify(player));
			app_server.sendMsgToClient(clients[player.playerId], dataToSend);
		}
	} else {

	}
}; //game_server.findQuickMatch

game_server.createGame = function(obj) {
	var game = obj.game;
	var gameId = game.id;
	games[gameId] = game;
	var dataToSend = {
		"notice" : TYPE_CREATE_GAME_SUCCESS
	};
	dataToSend.data = obj;
	for ( var playerId in games[gameId].clientPlayers) {
		currentGameOfPlayer[playerId] = gameId;
		players[playerId].status = 2;
		app_server.sendMsgToClient(clients[playerId], dataToSend);
	}

}; //game_server.createGame

game_server.createQuickGame = function(obj) {
	log("create quick game: " + JSON.stringify(obj));
	var game = obj.game;
	var gameId = game.id;
	games[gameId] = game;
	var dataToSend = {
		"notice" : "createQuickGameSuccess"
	};
	dataToSend.data = obj;
	for ( var playerId in games[gameId].clientPlayers) {
		try {
			currentGameOfPlayer[playerId] = gameId;
			players[playerId].status = 2;
			app_server.sendMsgToClient(clients[playerId], dataToSend);
		} catch (err) {
			log("error when create quick match");
		}

	}
}; //game_server.createQuickGame

game_server.updateGame = function(obj) {
	var newGame = obj.game;
	var gameId = newGame.id;
	delete games[gameId];
	games[gameId] = newGame;
	for ( var playerId in games[gameId].clientPlayers) {
		if (games[gameId].clientPlayers[playerId].isHost == "false")
			games[gameId].clientPlayers[playerId].status = false;
	}
	var dataToSend = {
		"notice" : "updateGame"
	};
	dataToSend.data = obj;
	for ( var playerId in games[gameId].clientPlayers) {
		app_server.sendMsgToClient(clients[playerId], dataToSend);
	}
}; //game_server.updateGame

game_server.joinGame = function(obj) {

	var gameId = obj.gameId;
	var playerJoin = obj.player;
	if (games.hasOwnProperty(gameId)
			&& lengthOfObj(games[gameId].clientPlayers) < games[gameId].playerNumber) {
		games[gameId].clientPlayers[obj.playerId] = playerJoin;
		var dataToSend = {
			"notice" : TYPE_PLAYER_JOIN_GAME
		};
		dataToSend.data = {};
		dataToSend.data.game = games[gameId];
		for ( var playerId in games[gameId].clientPlayers) {
			currentGameOfPlayer[playerId] = gameId;
			players[playerId].status = 2;
			app_server.sendMsgToClient(clients[playerId], dataToSend);
		}
	} else {
		log("games notHasOwnProperty(gameId)");
		var dataToSend = {
			"notice" : TYPE_JOIN_GAME_NOT_SUCCESS
		};
		app_server.sendMsgToClient(clients[obj.playerId], dataToSend);
	}
}; //game_server.joinGame

game_server.exitWaitingGame = function(obj) {
	exitWaitingGame(obj);
}; //game_server.exitWaitingGame

function exitWaitingGame(obj) {
	var gameId = obj.gameId;
	var playerExit = obj.player;
	var isHost = (obj.isHostPlayer == "true");
	if (games.hasOwnProperty(gameId)) {
		if (!isHost) {
			var dataToSend = {
				"notice" : TYPE_PLAYER_EXIT_GAME
			};
			dataToSend.data = {
				"player" : games[gameId].clientPlayers[playerExit],
				"playerId" : playerExit
			};
			app_server.sendMsgToClient(gameId, dataToSend);
			delete games[gameId].clientPlayers[playerExit];
			delete currentGameOfPlayer[playerExit];
			players[playerExit].status = 1;
		} else {
			var dataToSend = {
				"notice" : TYPE_HOST_EXIT_GAME
			};
			dataToSend.data = {
				"player" : games[gameId].clientPlayers[playerExit]
			};
			for ( var playerId in games[gameId].clientPlayers) {
				try {
					players[playerId].status = 1;
					delete currentGameOfPlayer[playerId];
					if (playerId != playerExit)
						app_server.sendMsgToClient(clients[playerId], dataToSend);
				} catch (err) {
					log("Error: " + JSON.stringify(err));
				}
			}
			delete games[gameId];
		}

	} else {
		log("games notHasOwnProperty(gameId)");
	}
}

game_server.readyForGame = function(obj) {
	var gameId = obj.gameId;
	var playerId = obj.player;
	var ready = (obj.ready == "true");
	if (games.hasOwnProperty(gameId)) {
		games[gameId].clientPlayers[playerId].ready = ready;
		var dataToSend = {
			"notice" : TYPE_PALYER_READY_GAME
		};
		dataToSend.data = obj;
		for ( var player in games[gameId].clientPlayers) {
			if (player != playerId)
				app_server.sendMsgToClient(clients[player], dataToSend);
		}
	} else {
		log("games notHasOwnProperty(gameId)");
	}
}; //game_server.exitWaitingGame

game_server.checkStartGame = function(obj) {
	var gameId = obj.gameId;
	var player = obj.player;
	games[gameId].clientPlayers[player].status = true;
	if (games.hasOwnProperty(gameId)) {
		var ready = true;
		if (lengthOfObj(games[gameId].clientPlayers) < games[gameId].playerNumber) {
			ready = false;
		} else
			for ( var playerId in games[gameId].clientPlayers) {
				log("playerId: " + JSON.stringify(games[gameId].clientPlayers[playerId]));
				var r = games[gameId].clientPlayers[playerId].ready;
				log("playerId ready: " + r);
				if (r == false || r == "false") {
					ready = false;
					break;
				}
			}
		var dataToSend = {
			"notice" : TYPE_CHECK_START_GAME
		};
		dataToSend.data = {
			"ready" : ready
		};
		app_server.sendMsgToClient(clients[player], dataToSend);
	} else {
		log("games notHasOwnProperty(gameId)");
	}
}; //game_server.exitWaitingGame

game_server.inviteToGame = function(sId, obj) {
	var dataToSend = {};
	var playerId = obj.player;
	log("Player: " + JSON.stringify(players[playerId]));
	if (players.hasOwnProperty(playerId) && players[playerId].status == 1 ) {
		dataToSend.notice = TYPE_INVITE;
		dataToSend.data = obj;
//		if(obj.hasOwnProperty("gameId") && games.hasOwnProperty(obj.gameId)){
//			dataToSend.data.gameId = obj.gameId;
//		}
		app_server.sendMsgToClient(clients[playerId], dataToSend);
	} else {
		dataToSend.notice = TYPE_PLAYER_NOT_AVAILABLE;
		dataToSend.data = {
			"player" : playerId
		};
		app_server.sendMsgToClient(sId, dataToSend);
	}
}; //game_server.inviteToGame

game_server.confirmJoinGame = function(obj) {
	var dataToSend = {};
	dataToSend.notice = "receiveConfirm"
	dataToSend.data = obj;
	app_server.sendMsgToClient(clients[obj.senderId], dataToSend);
}; //game_server.confirmJoinGame

game_server.startGame = function(obj) {
	var gameId = obj.gameId;
	var dataToSend = {};
	var prepareTime = obj.prepareTime;
	dataToSend.notice = "startGame";
	dataToSend.data = obj;
	games[gameId] = obj.game;
	if (games.hasOwnProperty(gameId)) {
		for ( var playerId in games[gameId].clientPlayers) {
			currentGameOfPlayer[playerId] = gameId;
			players[playerId].status = 2;
			app_server.sendMsgToClient(clients[playerId], dataToSend);
		}
		numberOfPlayerAnswer[gameId] = 0;
		games[gameId].passedRound = {};
		try {
			if (recordIntervals.hasOwnProperty(gameId)) {
				clearTimeout(recordIntervals[gameId]);
				delete recordIntervals[gameId];
			}
		} catch (err) {
			log("Err: " + JSON.stringify(err));
		}
		if (!games[gameId].hasOwnProperty("scores"))
			games[gameId].scores = {};
		for ( var playerId in games[gameId].clientPlayers) {
			games[gameId].scores[playerId] = 0;
		}
		games[gameId].playing = "true";
		log("game saved with: " + JSON.stringify(games[gameId]));
		games[gameId].finishCache = 0;
		// setTimeout(function() {
		// 	recordIntervals[gameId] = startIntervalTimer(gameId, intervalTime);
		// }, prepareTime * 1000);
	}
}; //game_server.confirmJoinGame

game_server.onFinishCache = function(obj) {
	var gameId = obj.gameId;
	games[gameId].finishCache = games[gameId].finishCache+1;
	if(games[gameId].finishCache == lengthOfObj(games[gameId].clientPlayers)) {
		var dataToSend = {};
		dataToSend.notice = "allClientsFinishCache";
		for (var playerId in games[gameId].clientPlayers) {
			app_server.sendMsgToClient(clients[playerId], dataToSend);
		}
		setTimeout(function() {
			recordIntervals[gameId] = startIntervalTimer(gameId, intervalTime);
		}, 200);
	}

}; //game_server.onFinishCache

game_server.onPlayerAnswer = function(obj) {
	onQuizAnswer(obj);
}; //game_server.onPlayerAnswer

function onQuizAnswer(obj) {
	var i = 0;
	var _id = obj.gameId;

	var round = obj.round;
	if (games.hasOwnProperty(_id) && (games[_id].currentRound == round)) {
		numberOfPlayerAnswer[_id] = numberOfPlayerAnswer[_id] + 1;
		if (games[_id].passedRound[round] != true) // undefined or false
			games[_id].passedRound[round] = false;
		try {
			if (obj.result == 'true')
				games[_id].scores[obj.player] = games[_id].scores[obj.player] + 3;
			else{
				games[_id].scores[obj.player] = games[_id].scores[obj.player] - 1;
				if(games[_id].scores[obj.player] < 0)
					games[_id].scores[obj.player] = 0;
			}
			games[_id].scores[obj.player] = games[_id].scores[obj.player]
					+ obj.bonus;
			for ( var playerId in games[_id].clientPlayers) {
				if (playerId != obj.player) {
					var dataToSend = {};
					dataToSend.notice = obj.type;
					dataToSend.data = obj;
					sendMessageToAPlayer(playerId, dataToSend);
				}
			}
			if (games[_id].passedRound[round] == false
					&& (obj.result == 'true' || numberOfPlayerAnswer[_id] >= 2)) {
				clearTimeout(recordIntervals[_id]);
				games[_id].passedRound[round] = true;
				games[_id].currentRound = games[_id].currentRound + 1;
				numberOfPlayerAnswer[_id] = 0;
				if (games[_id].currentRound < games[_id].round) {
					sendRequestNextRoundToAll(_id, games[_id]);
				} else {
					setTimeout(function() {
						log("currentRound: " + games[_id].currentRound
								+ " --- Total round: " + games[_id].round);
						endgame(_id);
					}, 1 * 1000);
				}
			}
		} catch (err) {
			log("Error when process player answer: "
					+ JSON.stringify(err));
		}
	} else {
		console
				.log(" nonnnnnnnnnnnnnnnn games.hasOwnProperty(_id) && (games.currRound === round) ");
	}
}

game_server.onPauseGame = function(obj) {
	var _id = obj.gameId;
	if (games.hasOwnProperty(_id)) {
		var dataToSend = {};
		dataToSend.notice = obj.type;
		dataToSend.data = obj;
		for ( var playerId in games[_id].clientPlayers) {
			sendMessageToAPlayer(playerId, dataToSend);
		}
		if (recordIntervals.hasOwnProperty(_id)) {
			clearTimeout(recordIntervals[_id]);
			delete recordIntervals[_id];
		}
	}

}; //game_server.onPauseGame

game_server.onResumeGame = function(obj) {
	var _id = obj.gameId;
	var time = obj.gameTime;
	if (games.hasOwnProperty(_id)) {
		var dataToSend = {};
		dataToSend.notice = obj.type;
		dataToSend.data = obj;
		for ( var playerId in games[_id].clientPlayers) {
			sendMessageToAPlayer(playerId, dataToSend);
		}
		recordIntervals[_id] = startIntervalTimer(_id, time);
	}

}; //game_server.onResumeGame

game_server.onReceiveRqEndGame = function(obj) {
	var _id = obj.gameId;
	if (games.hasOwnProperty(_id)) {
		endgame(_id);
	}
}; //game_server.onReceiveRqEndGame

function is_empty(obj) {
	// null and undefined are empty
	if (obj == null)
		return true;
	// Assume if it has a length property with a non-zero value
	// that that property is correct.
	if (obj.length && obj.length > 0)
		return false;
	if (obj.length === 0)
		return true;
	for ( var key in obj) {
		if (hasOwnProperty.call(obj, key))
			return false;
	}

	return true;
}

function startGameTimer() {
	var count = 0;
	var gameTimer = setInterval(function() {
		log("Tick: " + count++);
	}, 1000);
	return gameTimer;
}

function startIntervalTimer(_id, timerInterval) {
	if (games.hasOwnProperty(_id)) {
		var start_time = new Date();
		var count = 1;
		var interval = setTimeout(function() {
			try {
				games[_id].currentRound = games[_id].currentRound + 1;
				if (games[_id].currentRound < games[_id].round) {
					var end_time = new Date();
					var dif = end_time.getTime() - start_time.getTime();
					numberOfPlayerAnswer[_id] = 0;
					sendRequestNextRoundToAll(_id, games[_id]);
					count++;
				} else {
					clearTimeout(interval);
					endgame(_id);
				}
			} catch (err) {
			}
		}, timerInterval * 1000 + 500);
		return interval;
	}
}

function endWhenPlayerQuitGame(_id, notice, data) {
	clearTimeout(recordIntervals[_id]);
	if (games.hasOwnProperty(_id)) {
		log("End game! zzzzzzzzzzzzzzzzz: "
				+ JSON.stringify(games[_id]));
		var dataToSend = {};
		dataToSend.notice = notice;
		data.scores = games[_id].scores;
		data.scores[data.player] = -1;
		dataToSend.data = data;
		sendMessageToAll(games[_id], dataToSend);
		try {
			delete recordIntervals[_id];
			delete numberOfPlayerAnswer[_id];
			log(JSON.stringify(games));
			for ( var playerId in games[_id].clientPlayers) {
				// players[playerId].status = 1;
				if (currentGameOfPlayer.hasOwnProperty(playerId)) {
					delete currentGameOfPlayer[playerId];
				}
			}
			delete games[_id];
		} catch (err) {
			log("Error when delete data to endGame: "
					+ JSON.stringify(err));
		}
	}
}

function endgame(_id) {
	clearTimeout(recordIntervals[_id]);
	// clearInterval(gameTimers[_id]);
	if (games.hasOwnProperty(_id)) {
		log("End game! zzzzzzzzzzzzzzzzz: "
				+ JSON.stringify(games[_id]));
		var dataToSend = {};
		dataToSend.notice = "endGame";
		dataToSend.data = {
			"scores" : games[_id].scores
		};
		sendMessageToAll(games[_id], dataToSend);
		setTimeout(function() {
			try {
				delete recordIntervals[_id];
				// delete gameTimers[_id];
				delete numberOfPlayerAnswer[_id];
				log(JSON.stringify(games));
				for ( var playerId in games[_id].clientPlayers) {
					if (currentGameOfPlayer.hasOwnProperty(playerId)) {
						delete currentGameOfPlayer[playerId];
					}
					// if (players[playerId].status == 2)
					// 	players[playerId].status = 1;
				}
				delete games[_id];
			} catch (err) {
				log("Error when delete data to endGame: "
						+ JSON.stringify(err));
			}
		}, 3 * 1000);
	}
}

function sendRequestNextRoundToAll(_id, game) {
	log("sendRequestNextRoundToAll");
	if (typeof game != undefined) {
		var dataToSend = {};
		dataToSend.notice = "nextRound";
		dataToSend.data = {
			"round" : game.currentRound,
			"scores" : game.scores
		};
		sendMessageToAll(game, dataToSend);
		log("game saved: " + JSON.stringify(game));
		setTimeout(function() {
			if (recordIntervals.hasOwnProperty(_id)) {
				delete recordIntervals[_id];
			}
			recordIntervals[_id] = startIntervalTimer(_id, intervalTime);
		}, 1 * 1000);
	}
}

function sendMessageToAll(game, msg) {
	if (typeof game != undefined) {
		try {
			for ( var playerId in game.clientPlayers) {
				sendMessageToAPlayer(playerId, msg);
			}
		} catch (err) {
			log("Error when send msg to all");
		}
	}
}

function sendMessageToAPlayer(playerId, msg) {
	try {
		app_server.sendMsgToClient(clients[playerId], msg);
	} catch (err) {
		log("Error when sendMessageToAPlayer " + JSON.stringify(err));
	}
}

function lengthOfObj(obj) {
	var length = 0;
	for ( var k in obj) {
		if (obj.hasOwnProperty(k))
			length++;
	}
	return length;
}

function log(msg) {
	//console.log(msg);
} 
