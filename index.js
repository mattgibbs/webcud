var server = require("./server");
var router = require("./router");
var requestHandlers = require("./requestHandlers");
var captureStatus = require("./captureStatus");
var handle = {}
handle["/PV"] = requestHandlers.PV;
handle["/history"] = requestHandlers.history;
handle["/status"] = requestHandlers.status;

server.start(router.route, handle);

setInterval(function(){
	captureStatus.getLCLSStatus();
},10*1000);