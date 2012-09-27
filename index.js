var server = require("./server");
var router = require("./router");
var requestHandlers = require("./requestHandlers");

var handle = {}
handle["/"] = requestHandlers.test;
handle["/PV"] = requestHandlers.PV;
handle["/caget"] = requestHandlers.caget;

server.start(router.route, handle);