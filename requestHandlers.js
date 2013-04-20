var spawn = require("child_process").spawn;
var fork = require("child_process").fork;
var http = require("http");
var camonitor = require("./camonitor");
var monitors = {};

//HTTP GET request for a PV.
function PV(response, query) {
	var PVtoGet = query["PV"];
	//We will run this if we successfully get some PV data back.
	function respondWithData(data) {
		response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
		response.write(JSON.stringify(data));
		response.end();
	}
	
	//We will run this if there is some kind of a problem getting the PV data.
	function respondWithFailure() {
		response.writeHead(404,{"Content-Type": "text/plain","Access-Control-Allow-Origin": "*"});
		response.write("Could not connect to PV.");
		console.log("Cached data not availabe for " + PVtoGet);
		response.end();
	}
	
	if (monitors[PVtoGet] === undefined) {
		//This is a new connection.  Spawn a new camonitor.  Once it gets its first bit of data, respond with that.
		var newMonitor = camonitor.startConnection(PVtoGet,function(err,newMonitor){
			if (err) {
				console.log(err);
			} else {
				monitors[PVtoGet] = newMonitor;

				//Clean up when this connection ends.
				newMonitor.on('close', function(code){
					console.log("Connection to " + newMonitor.PV + " ended.");
					delete monitors[newMonitor.PV];
				});

				newMonitor.on('error', function(err) {
					console.log("Error spawning a camonitor to get data for the pv " + newMonitor.PV + ".  This might be happening because you didn't start the node server as bash, which is needed for all channel access processes.");
					console.log(err);
				});

				newMonitor.once('cached',function(data) {
					if(data !== undefined) {
						respondWithData(data);
					} else {
						respondWithFailure();
					}
				});
			}
		});
	} else {
		//This is an existing connection.  Respond with the latest cached data.
		var existingMonitor = monitors[PVtoGet];
		existingMonitor.resetKillTimer();
		if(existingMonitor.dataCache !== undefined) {
			respondWithData(existingMonitor.dataCache);
		} else {
			respondWithFailure();
		}
	}
}

//New WebSocket connection to the server.
/*
function socketConnection(socket) {
	socket.setMaxListeners(100);
	
	//Message from client to connect to a PV.
	socket.on('connectToPV',function (connectData) {
		var PVtoGet = connectData.pv;
		
		if(monitors[PVtoGet] === undefined) {
			spawnNewMonitor(PVtoGet,function(newMonitor){
				newMonitor.addSocketConnection();
				newMonitor.on('cached',function(dataCache){
					socket.emit(dataCache.PV,dataCache);
				});
				socket.on('disconnect', function (){
					console.log("Socket disconnected.  Removing connection to " + newMonitor.PV);
					newMonitor.removeSocketConnection();
				});
			});
		} else {
			var camonitor = monitors[PVtoGet];
			camonitor.addSocketConnection();
			camonitor.on('cached',function(dataCache){
				socket.emit(dataCache.PV,dataCache);
			});
			socket.on('disconnect', function (){
				console.log("Socket disconnected.  Removing connection to " + camonitor.PV);
				camonitor.removeSocketConnection();
			});
		}
	});
}
*/

/*
function spawnNewMonitor(PV, callback){
	//First, get the units for this PV.
	var stdoutdata = '', stderrdata = '';
	var caget = spawn("camonitor", [PV+".EGU"]);
	var camonitor;
	
	caget.stdout.on('readable', function(){
		var data = caget.stdout.read();
		if (data !== null) {
			stdoutdata += data;
			caget.kill();
		}	
	});
	
	caget.stderr.on('readable', function(){
		var data = caget.stdout.read();
		if (data !== null) {
			stderrdata += caget.stderr.read();
			caget.kill();
		}
	});

	caget.on('error', function(err) {
		console.log("Error spawning a camonitor to get units for the pv " + PV + ".  This might be happening because you didn't start the node server as bash, which is needed for all channel access processes.");
		console.log(err);
	});

	caget.on('close', function(code, signal){
		var units;
		if (stderrdata !== "" ) {
			//If there is a problem, no big deal, you just don't get a unit.
			console.log("Error finding units. Caget exited with code " + code + ": " + stderrdata);
		} else {
			//Split the string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
			var cagetResults = stdoutdata.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
			if(stderrdata != ""){
				console.log("Error finding units: " + stderrdata);
			}
			units = cagetResults[3];
		}
		
		//Finished getting the units, now make the camonitor process.
		console.log("Opening new connection to " + PV);
		camonitor = spawn("camonitor", ["-f8",PV]);
		monitors[PV] = camonitor;
		camonitor.PV = PV;
		camonitor.setMaxListeners(50);
		camonitor.dataCache = {};
		camonitor.dataCache.units = units;
		camonitor.timedOut = false;
		camonitor.socketConnections = 0;
		camonitor.accumulating = false;
		camonitor.accumulatedResultString = '';
		camonitor.resetKillTimer = function(){
			clearTimeout(camonitor.killTimer);
			//Sets a timer that will kill the camonitor process if it is not used for 30 seconds.
			camonitor.killTimer = setTimeout(function(){
				camonitor.timedOut = true;
				if (camonitor.socketConnections < 1) {
					console.log("Ending inactive connection to " + camonitor.PV);
					camonitor.kill();
				}
			},30*1000);
		};
		
		camonitor.addSocketConnection = function(){
			camonitor.socketConnections += 1;
			console.log("Connections to " + camonitor.PV + ": " + camonitor.socketConnections);
		};
		
		camonitor.removeSocketConnection = function(){
			camonitor.socketConnections -= 1;
			console.log("Connections to " + camonitor.PV + ": " + camonitor.socketConnections);
			if (camonitor.socketConnections < 1 && camonitor.timedOut == true){
				console.log("Last socket connection closed, ending inactive connection to " + camonitor.PV);
				camonitor.kill();
			}
		};
		
		camonitor.resetKillTimer();
		
		//Update the dataCache any time this PV connection recieves new data.
		camonitor.stdout.on('readable', function(){
			var data = camonitor.stdout.read();
			//Check for channel access connection errors
			var camonitorString = data.toString('ascii');
			if (camonitorString.indexOf("(PV not found)") != -1) {
				console.log("Error for " + camonitor.PV + ": " + data);
				clearTimeout(camonitor.killTimer);
				camonitor.kill();
				return;
			}
			
			//Split the data string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
			var resultArray = camonitorString.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
			if (resultArray.length <= 7) {
				camonitor.dataCache.PV = resultArray[0];
				var tempParsedValue = parseFloat(resultArray[3]);
				if (isNaN(tempParsedValue)){
					camonitor.dataCache.value = resultArray[3];
				} else {
					camonitor.dataCache.value = tempParsedValue;
				}
				camonitor.dataCache.timestamp = dateFromEPICSTimestamp(resultArray[1],resultArray[2]);
				camonitor.dataCache.status = resultArray[4];
				camonitor.dataCache.severity = resultArray[5];
			} else {
				//With waveforms, it might take more than one 'data' event to transmit the entire string.
				//We will look at the number of elements in the string we have so far compared to the number of values in the waveform.
				//Until they are equal, just keep appending to the string.
				if (camonitor.accumulating == false){
					if (resultArray.length < parseInt(resultArray[3],10) + 4){
						console.log(resultArray[0] + ": Expected " + (parseInt(resultArray[3],10) + 4) + " elements, " + resultArray.length + " collected so far...");
						//We don't have all the data yet!  Accumulate...
						//console.log("Starting accumulation for " + resultArray[0]);
						camonitor.accumulating = true;
						camonitor.accumulatedResultString += camonitorString;
					}
				} else {
					camonitor.accumulatedResultString += camonitorString;
					var accumulatedResultArray = camonitor.accumulatedResultString.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
					//console.log(accumulatedResultArray[0] + ": Expected " + (parseInt(accumulatedResultArray[3],10) + 4) + " elements, " + accumulatedResultArray.length + " collected so far...");
					if (accumulatedResultArray.length == parseInt(accumulatedResultArray[3],10) + 4) {
						camonitor.accumulating = false;
						camonitor.dataCache.PV = accumulatedResultArray[0];
						camonitor.dataCache.timestamp = dateFromEPICSTimestamp(accumulatedResultArray[1],accumulatedResultArray[2]);
						camonitor.dataCache.value = new Array();
						for (var i=0; i<parseInt(accumulatedResultArray[3],10); i++) {
							camonitor.dataCache.value[i] = accumulatedResultArray[i+4];
						}
						camonitor.accumulatedResultString = '';
					}
				}				
			}
			
			//Emit an event signalling that the latest data has been parsed and cached.
			if(!camonitor.accumulating){ camonitor.emit('cached',camonitor.dataCache); }
			
		});
		
		//Clean up when this process ends.
		camonitor.on('close', function(code){
			console.log("Connection to " + camonitor.PV + " ended.");
			delete monitors[camonitor.PV];
		});
		
		camonitor.on('error', function(err) {
			console.log("Error spawning a camonitor to get data for the pv " + camonitor.PV + ".  This might be happening because you didn't start the node server as bash, which is needed for all channel access processes.");
			console.log(err);
		});
		
		callback(camonitor);
	});
}
*/


//Get history for a PV from the channel archiver via XML-RPC.

function history(response, query) {
	var PVtoGet = query["PV"];
	console.log("Getting history for PV: " + PVtoGet);
	//Default end time to now, start time to 24 hours ago.
	var end_sec = Number(new Date())/1000;
	var start_sec = end_sec - (60*60*24);
	var count = 800;
	var style = 0;
	//Start Time in seconds since 1970
	if (query["start"]) {
		start_sec = parseInt(query["start"],10);
	}
	//End Time in seconds since 1970
	if (query["end"]) {
		end_sec = parseInt(query["end"],10);
	}
	//Number of samples.
	if (query["count"]) {
		count = parseInt(query["count"],10);
	}
	//0 = Raw, 1 = 'Spreadsheet' (Interpolated with staircase), 2 = Averaged (bin size = end-start/count), 3 = plot binned (binned into 'count' bins), 4 = linear (linearly interpolated)
	if (query["style"]) {
		style = parseInt(query["style"],10);
	}
	
	var xmlrpc = "<?xml version='1.0'?>\n<methodCall>\n<methodName>archiver.values</methodName>\n<params>\n<param>\n<value><int>1</int></value>\n</param>\n<param>\n<value><array><data>\n<value><string>"+PVtoGet+"</string></value>\n</data></array></value>\n</param>\n<param>\n<value><int>"+start_sec.toFixed(0)+"</int></value>\n</param>\n<param>\n<value><int>0</int></value>\n</param>\n<param>\n<value><int>"+end_sec.toFixed(0)+"</int></value>\n</param>\n<param>\n<value><int>0</int></value>\n</param>\n<param>\n<value><int>"+count+"</int></value>\n</param>\n<param>\n<value><int>"+style+"</int></value>\n</param>\n</params>\n</methodCall>\n"
	var archiverRequestOptions = {
		host: 'lcls-archsrv',
		port: 80,
		path: '/cgi-bin/ArchiveDataServer.cgi',
		method: 'POST',
		headers: {'Content-Type': 'text/xml', 'Content-Length': Buffer.byteLength(xmlrpc, 'utf8') }
	};

	var req = http.request(archiverRequestOptions, function(archResponse) {
		response.writeHead(200, {"Content-Type": "text", "Access-Control-Allow-Origin": "*"});
		//console.log('STATUS: ' + archResponse.statusCode);
		//console.log('HEADERS: ' + JSON.stringify(archResponse.headers));
		archResponse.setEncoding('utf8');
		
		//Spawn a child node.js process to parse the XML, so that it doesn't block
		//the main server thread.
		
		var parser = fork(__dirname + '/parseHistory.js',[],{silent: true});
		
		parser.on('message', function(parsedObject) {
			response.write(JSON.stringify(parsedObject));
			response.end();
			parser.kill();
			//console.log(parsedObject.length);
		});
		
		archResponse.pipe(parser.stdin);
		archResponse.on('close', function(err) {
			console.log("Archiver response was closed before end.  Error: " + err);
		});
	});
	
	req.on('error', function(err) {
		console.log('Problem with request: ' + e.message);
	});
	
	req.write(xmlrpc);
	req.end();
}

exports.PV = PV;
exports.history = history;
//exports.socketConnection = socketConnection;