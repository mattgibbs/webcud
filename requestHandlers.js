var spawn = require("child_process").spawn;
var util = require("util");
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
		spawnNewMonitor(PVtoGet, function(newMonitor){
			newMonitor.once('cached',function(dataCache) {
				if(dataCache !== undefined) {
					respondWithData(dataCache);
				} else {
					respondWithFailure();
				}
			});
		});
	} else {
		//This is an existing connection.  Respond with the latest cached data.
		var camonitor = monitors[PVtoGet];
		camonitor.resetKillTimer();
		if(camonitor.dataCache !== undefined) {
			respondWithData(camonitor.dataCache);
		} else {
			respondWithFailure();
		}
	}
}

//New WebSocket connection to the server.
function socketConnection(socket) {
	socket.setMaxListeners(100);
	
	//Message from client to connect to a PV.
	socket.on('connectToPV',function (connectData) {
		var PVtoGet = connectData.pv;
		
		if(monitors[PVtoGet] === undefined) {
			spawnNewMonitor(PVtoGet,function(newMonitor){
				newMonitor.addSocketConnection();
				newMonitor.on('cached',function(dataCache){
					socket.volatile.emit(dataCache.PV,dataCache);
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

function spawnNewMonitor(PV, callback){
	//First, get the units for this PV.
	var stdoutdata = '', stderrdata = '';
	var caget = spawn("caget", ["-a",PV+".EGU"]);
	var camonitor;
	caget.stdout.on('data', function(data){ stdoutdata += data; });
	caget.stderr.on('data', function(data){ stderrdata += data; });

	caget.on('exit', function(code){
		var units;
		if (code !== 0 ) {
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
		camonitor.resetKillTimer = function(){
			clearTimeout(camonitor.killTimer);
			camonitor.killTimer = setTimeout(function(){
				camonitor.timedOut = true;
				if (camonitor.socketConnections < 1) {
					console.log("Ending inactive connection to " + camonitor.PV);
					camonitor.kill();
				}
			},30*1000);
		}
		camonitor.addSocketConnection = function(){
			camonitor.socketConnections += 1;
			console.log("Connections to " + camonitor.PV + ": " + camonitor.socketConnections);
		}
		camonitor.removeSocketConnection = function(){
			camonitor.socketConnections -= 1;
			console.log("Connections to " + camonitor.PV + ": " + camonitor.socketConnections);
			if (camonitor.socketConnections < 1 && camonitor.timedOut == true){
				console.log("Ending inactive connection to " + camonitor.PV);
				camonitor.kill();
			}
		}
		
		camonitor.resetKillTimer();
		
		//Update the dataCache any time this PV connection recieves new data.
		camonitor.stdout.on('data', function(data){
			//Check for channel access connection errors
			var camonitorString = data.toString('ascii');
			if (camonitorString.indexOf("(PV not found)") != -1) {
				console.log("Error for " + PVtoGet + ": " + data);
				clearTimeout(camonitor.killTimer);
				camonitor.kill();
				return;
			}

			//Split the data string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
			var resultArray = camonitorString.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
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
			
			//Emit an event signalling that the latest data has been parsed and cached.
			camonitor.emit('cached',camonitor.dataCache);
		});
		
		//Clean up when this process ends.
		camonitor.on('exit', function(code){
			console.log("Connection to " + camonitor.PV + " ended.");
			delete monitors[camonitor.PV];
		});
		
		callback(camonitor);
	});
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
exports.socketConnection = socketConnection;