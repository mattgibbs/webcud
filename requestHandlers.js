var spawn = require("child_process").spawn;
var util = require("util");
function test(response) {
	console.log("Request handler 'Test' was called.");
	response.writeHead(200,{"Content-Type": "text/plain","Access-Control-Allow-Origin": "*"});
	response.write("test");
	response.end();
}

//Uses 'caget' to get a PV.  Waits for caget to exit with code 0, then parses whatever caget output, and writes some JSON as the response.
function caget(response, query) {
	var PVtoGet = query["PV"];
	var precision = parseInt(query["precision"],10);
	if (isNaN(precision)) {
		precision = 0;
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
		if (code !== 0 ) {
			//If there is a problem, return a 404, and print the error to the console.
			console.log('Error executing caget - exited with code ' + code);
			console.log('stderr = ' + stderrdata);
			response.writeHead(404,{"Content-Type": "text/plain","Access-Control-Allow-Origin": "*"});
			response.write("Could not connect to PV.");
		} else {
			//Otherwise, process the result.
			response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});

			//Split the string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
			var cagetResults = stdoutdata.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
			console.log(cagetResults);
			if(stderrdata != ""){
				console.log(stderrdata);
			}
						
			data = {"PV": cagetResults[0],
					"value": cagetResults[3],
			 		"timestamp": dateFromEPICSTimestamp(cagetResults[1],cagetResults[2]),
					"status": cagetResults[4],
					"severity": cagetResults[5]};
			response.write(JSON.stringify(data));
		}
		response.end();
	});
}

//Uses 'camonitor' to get a PV.  If there is not already a 'camonitor' process running for the PV, it will spawn one.
//If there -is- a camonitor for the requested PV, parse the latest stdout from it, and send a JSON response.
//The process has a has a timeout - if no requests for the PV are sent in some time interval, the monitor process is terminated.
var monitorProcesses = {}
var dataCache = {}
function PV(response, query) {
	var PVtoGet = query["PV"];
	var precision = parseInt(query["precision"],10);
	if (isNaN(precision)) {
		precision = 0;
	}
	//console.log("Request handler 'PV' was called, with PV = " + PVtoGet + ".");
	console.log(util.inspect(process.memoryUsage()));
	var camonitor;
	if(monitorProcesses[PVtoGet] === undefined){		
		//This connection doesn't exist yet, spawn it.
		console.log("Opening new connection to " + PVtoGet);
		camonitor = spawn("camonitor", ["-f"+precision,PVtoGet]);
		camonitor.stdout.setMaxListeners(50);
		camonitor.stderr.setMaxListeners(50);
		
		//Kill this after half a minute of inactivity.
		camonitor.killTimer = setTimeout(function(){
			console.log("Ending inactive connection to " + PVtoGet);
			monitorProcesses[PVtoGet].kill();
		},30*1000);
		
		//Add a one-time event listener to send the first bit of data.
		//Subsequent requests to this PV connection will just get data out of the dataCache.
		camonitor.stdout.once('data', function(data){
			//camonitor is stupid, and doesn't output errors about not finding PVs to stderr, and doesn't exit.
			//So, we have to look at the stdout to determine if the connection to the PV was successful.
			var camonitorString = data.toString('ascii');
			if (camonitorString.indexOf("(PV not found)") != -1) {
				response.writeHead(404,{"Content-Type": "text/plain","Access-Control-Allow-Origin": "*"});
				response.write("Could not connect to PV.");
				console.log("Error for " + PVtoGet + ": " + data);
				response.end();
				clearTimeout(camonitor.killTimer);
				camonitor.kill();
				return;
			}

			//Split the data string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
			var resultArray = camonitorString.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
			
			dataCache[resultArray[0]] = {};
			dataCache[resultArray[0]].PV = resultArray[0]; //I am using the result of the CA connection to determine the PV as a sort of check that it all worked right.
			dataCache[resultArray[0]].value = resultArray[3];
			dataCache[resultArray[0]].timestamp = dateFromEPICSTimestamp(resultArray[1],resultArray[2]);
			dataCache[resultArray[0]].status = resultArray[4];
			dataCache[resultArray[0]].severity = resultArray[5];
			
			//Get the units for this PV.
			var stdoutdata = '', stderrdata = '';
			var caget = spawn("caget", ["-a",PVtoGet+".EGU"]);

			caget.stdout.on('data', function(data){
				stdoutdata += data;
			});

			caget.stderr.on('data', function(data){
				stderrdata += data;
			});

			caget.on('exit', function(code){
				if (code !== 0 ) {
					//If there is a problem, no big deal, you just don't get a unit.
					console.log(stderrdata);
				} else {
					//Split the string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
					var cagetResults = stdoutdata.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});

					if(stderrdata != ""){
						console.log(stderrdata);
					}

					dataCache[resultArray[0]].units = cagetResults[3];
					response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
					response.write(JSON.stringify(dataCache[resultArray[0]]));
					response.end();
				}
			});
		});
		
		//Update the dataCache any time this PV connection recieves new data.
		camonitor.stdout.on('data', function(data){
			//Check for channel access connection errors
			var camonitorString = data.toString('ascii');
			if (camonitorString.indexOf("(PV not found)") != -1) {
				response.writeHead(404,{"Content-Type": "text/plain","Access-Control-Allow-Origin": "*"});
				response.write("Could not connect to PV.");
				console.log("Error for " + PVtoGet + ": " + data);
				response.end();
				clearTimeout(camonitor.killTimer)
				camonitor.kill()
				return;
			}

			//Split the data string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
			var resultArray = camonitorString.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
			
			dataCache[resultArray[0]].PV = resultArray[0]; //I am using the result of the CA connection to determine the PV as a sort of check that it all worked right.
			dataCache[resultArray[0]].value = resultArray[3];
			dataCache[resultArray[0]].timestamp = dateFromEPICSTimestamp(resultArray[1],resultArray[2]);
			dataCache[resultArray[0]].status = resultArray[4];
			dataCache[resultArray[0]].severity = resultArray[5];
		});
		
		
		//Clean up when this process ends.
		camonitor.on('exit', function(code){
			console.log("Connection to " + PVtoGet + " ended.");
			delete monitorProcesses[PVtoGet];
			delete dataCache[PVtoGet];
		});
		
		//Add it to our collection of connections.
		monitorProcesses[PVtoGet] = camonitor;
	} else {
		//There is already a connection to this PV.
		camonitor = monitorProcesses[PVtoGet];
		
		//Return the latest cached data if it is available.
		if(dataCache[PVtoGet] !== undefined) {
			response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
			response.write(JSON.stringify(dataCache[PVtoGet]));
			response.end();
		} else {
			response.writeHead(404,{"Content-Type": "text/plain","Access-Control-Allow-Origin": "*"});
			response.write("Could not connect to PV.");
			console.log("Cached data not availabe for " + PVtoGet);
			response.end();
		}
		
		//Reset its inactivity timer.
		clearTimeout(camonitor.killTimer);
		camonitor.killTimer = setTimeout(function(){
			console.log("Ending inactive connection to " + PVtoGet);
			monitorProcesses[PVtoGet].kill();
		},30*1000);
	}
	
	//Add another event listener that will generate a 404 response if the camonitor barfs.
	//Commented out because camonitor doesn't ever output any stderr.  Lame.
	/*
	camonitor.stderr.once('data', function(data){
		response.writeHead(404,{"Content-Type": "text/plain","Access-Control-Allow-Origin": "*"});
		response.write("Could not connect to PV.");
		console.log("Error for " + PVtoGet + ": " + data);
		response.end();
	});*/
}

function dateFromEPICSTimestamp(datestring,timestring) {
	//Parse the date string into something we can plug into a javascript Date constructor.
	var year = parseInt(datestring.substring(0,4),10);
	var month = parseInt(datestring.substring(5,7),10)-1;
	var day = parseInt(datestring.substring(8),10);
	var hour = parseInt(timestring.substring(0,2),10);
	var minute = parseInt(timestring.substring(3,5),10);
	var second = parseInt(timestring.substring(6,8),10);
	var millisecond = Math.round(parseInt(timestring.substring(9),10)/1000);
	var parsedDate = new Date(year,month,day,hour,minute,second,millisecond);
	var dateInMilliseconds = parsedDate.getTime();
	parsedDate = null;
	return dateInMilliseconds;
}

exports.PV = PV;
exports.caget = caget;
exports.test = test;