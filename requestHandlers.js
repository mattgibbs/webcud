var exec = require("child_process").exec;
function test(response) {
	console.log("Request handler 'Test' was called.");
	response.writeHead(200,{"Content-Type": "text/plain"});
	response.write("test");
	response.end();
}

function PV(response, query) {
	PVtoGet = query["PV"];
	console.log("Request handler 'PV' was called, with PV = " + PVtoGet + ".");
	
	exec("caget" + PVtoGet, {timeout:10000, maxBuffer: 20000*1024}, function(error, stdout, stderr) {
		response.writeHead(200, {"Content-Type": "text/plain"});
		response.write(stdout);
		response.end();
	});
}

exports.PV = PV;
exports.test = test;