var spawn = require("child_process").spawn;
var fork = require("child_process").fork;
//var util = require("util");
var http = require("http");
//var saxStream = require("./sax").createStream();
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

function spawnNewMonitor(PV, callback){
	//First, get the units for this PV.
	var stdoutdata = '', stderrdata = '';
	var caget = spawn("camonitor", [PV+".EGU"]);
	var camonitor;
	caget.stdout.on('data', function(data){ stdoutdata += data; caget.kill(); });
	caget.stderr.on('data', function(data){ stderrdata += data; caget.kill(); });

	caget.on('exit', function(code){
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
		camonitor.on('exit', function(code){
			console.log("Connection to " + camonitor.PV + " ended.");
			delete monitors[camonitor.PV];
		});
		
		callback(camonitor);
	});
}



//get history for a PV from the channel archiver.  Doesn't work yet!

function history(response, query) {
	var PVtoGet = query["PV"];
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
	
	//var xmlrpc = '<?xml version="1.0" encoding="UTF-8"?>\n\t<methodCall>\n\t\t<methodName>archiver.values</methodName>\n\t\t<params>\n\t\t\t<param>\n\t\t\t\t<value>\n\t\t\t\t\t<int>1</int>\n\t\t\t\t</value>\n\t\t\t</param>\n\t\t\t<param>\n\t\t\t\t<value>\n\t\t\t\t\t<array>\n\t\t\t\t\t\t<data>\n\t\t\t\t\t\t\t<value>\n\t\t\t\t\t\t\t\t<string>BPMS:LI24:801:X</string>\n\t\t\t\t\t\t\t</value>\n\t\t\t\t\t\t</data>\n\t\t\t\t\t</array>\n\t\t\t\t</value>\n\t\t\t</param>\n\t\t\t<param>\n\t\t\t\t<value>\n\t\t\t\t\t<int>' + start_sec + '</int>\n\t\t\t\t</value>\n\t\t\t</param>\n\t\t\t<param>\n\t\t\t\t<value>\n\t\t\t\t\t<int>0</int>\n\t\t\t\t</value>\n\t\t\t</param>\n\t\t\t<param>\n\t\t\t\t<value>\n\t\t\t\t\t<int>'+ end_sec +'</int>\n\t\t\t\t</value>\n\t\t\t</param>\n\t\t\t<param>\n\t\t\t\t<value>\n\t\t\t\t\t<int>0</int>\n\t\t\t\t</value>\n\t\t\t</param>\n\t\t\t<param>\n\t\t\t\t<value>\n\t\t\t\t\t<int>800</int>\n\t\t\t\t</value>\n\t\t\t</param>\n\t\t\t<param>\n\t\t\t\t<value>\n\t\t\t\t\t<int>0</int>\n\t\t\t\t</value>\n\t\t\t</param>\n\t\t</params>\n\t</methodCall>';
	//var xmlrpc = '<?xml version="1.0" encoding="UTF-8"?><methodCall><methodName>archiver.names</methodName><params><param><value><int>1</int></value></param><param><value><string>GDET:FEE1:24[0-9]:ENRC</string></value></param></params></methodCall>'
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
		});
		
		archResponse.pipe(parser.stdin);
		
		var stack = [];
		var containerTags = ['value','array','data','struct','member'];
		
		/*
		archResponse.on('data', function(chunk) {
			 response.write(chunk); 
		});
		
		archResponse.on('end', function() {
			response.end();
		});
		*/
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
exports.history = history;
exports.socketConnection = socketConnection;