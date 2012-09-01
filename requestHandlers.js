var spawn = require("child_process").spawn;
function test(response) {
	console.log("Request handler 'Test' was called.");
	response.writeHead(200,{"Content-Type": "text/plain"});
	response.write("test");
	response.end();
}

function PV(response, query) {
	var PVtoGet = query["PV"];
	var precision = parseInt(query["precision"],10);
	if (isNaN(precision) || precision == 0) {
		precision = 2;
	}
	var data = {}
	console.log("Request handler 'PV' was called, with PV = " + PVtoGet + ".");
	
	//Spawn a caget process.  This is more complicated than using childProcess.exec, but it is also more secure.
	var stdoutdata = '', stderrdata = '';
	var caget = spawn("caget", ["-a", "-f"+precision,PVtoGet]);
	
	caget.stdout.on('data', function(data){
		stdoutdata += data;
	});
	
	caget.stderr.on('data', function(data){
		stderrdata += data;
	});
	
	caget.on('exit', function(code){
		if (code !== 0) {
			//If there is a problem, return a 404, and print the error to the console.
			console.log('Error executing caget - exited with code ' + code);
			console.log('stderr = ' + stderrdata);
			response.writeHead(404,{"Content-Type": "text/plain"});
			response.write("Could not connect to PV.");
		} else {
			//Otherwise, process the result.
			response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});

			//Split the string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
			var cagetResults = stdoutdata.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
			console.log(cagetResults);
			data = {"PV": cagetResults[0],
					"value": cagetResults[3],
			 		"timestamp": cagetResults[1] + " " + cagetResults[2],
					"status": cagetResults[4],
					"severity": cagetResults[5]};
			response.write(JSON.stringify(data));
		}
		response.end();
	});
}

exports.PV = PV;
exports.test = test;