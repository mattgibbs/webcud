var http = require("http");
var url = require("url");
var socketConnection = require("./requestHandlers").socketConnection;

function start(route, handle) {
	function onRequest(request, response) {
		var parsedURL = url.parse(request.url,true);
		var pathname = parsedURL.pathname;
		var query = parsedURL.query;
		route(handle, pathname, query, response);
	}
	var pvserver = http.createServer(onRequest).listen(8888);
	
	//Set up Socket.IO for websockets support.
	var io = require('socket.io').listen(pvserver);
	io.sockets.on('connection', socketConnection);
}

console.log("Server is running...");

exports.start = start;