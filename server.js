var http = require("http");

function start() {
	function onRequest(request, response) {
		console.log("Recieved request.");
		response.writeHead(200, {"Content-Type": "text/plain"});
		response.write("Hello World");
		response.end();
	}
	
	http.createServer(onRequest).listen(8888);
	console.log("Server is running.");
}

exports.start = start;