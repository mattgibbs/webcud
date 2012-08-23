var server = require("./server");
var router = require("./router");
var requestHandlers = require("./requestHandlers");

var handle = {}
handle["/"] = requestHandlers.test;
handle["/PV"] = requestHandlers.PV;

server.start(router.route, handle);