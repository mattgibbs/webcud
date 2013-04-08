var server = require("./server");
var router = require("./router");
var requestHandlers = require("./requestHandlers");

var handle = {}
handle["/PV"] = requestHandlers.PV;
handle["/history"] = requestHandlers.history;

server.start(router.route, handle);