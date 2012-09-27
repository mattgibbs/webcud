var http = require("http");
var url = require("url");

function start(route, handle) {
	function onRequest(request, response) {
		var parsedURL = url.parse(request.url,true);
		var pathname = parsedURL.pathname;
		var query = parsedURL.query;
		route(handle, pathname, query, response);
	}
	
	http.createServer(onRequest).listen(8888);
	console.log("Server is running...");
}

exports.start = start;