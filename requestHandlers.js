var exec = require("child_process").exec;
function test(response) {
	console.log("Request handler 'Test' was called.");
	response.writeHead(200,{"Content-Type": "text/plain"});
	response.write("test");
	response.end();
}

function PV(response, query) {
	PVtoGet = query["PV"];
	var data = {}
	console.log("Request handler 'PV' was called, with PV = " + PVtoGet + ".");
	
	exec("caget -a -f1 " + PVtoGet, {timeout:10000, maxBuffer: 20000*1024}, function(error, stdout, stderr) {
		if (error == null) {
			response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
			
			//Split the string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
			var cagetResults = stdout.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
			console.log(cagetResults);
			data = {"PV": cagetResults[0],
					"value": cagetResults[3],
			 		"timestamp": cagetResults[1] + " " + cagetResults[2],
					"status": cagetResults[4],
					"severity": cagetResults[5]};
			response.write(JSON.stringify(data));
		} else {
			response.writeHead(404,{"Content-Type": "text/plain"});
			response.write(error.message);
		}
		
		response.end();
	});
}

exports.PV = PV;
exports.test = test;