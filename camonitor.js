var spawn = require("child_process").spawn;

//start spawns a new camonitor process.
function startConnection(PV, callback) {
	//Get unit information for this PV
	getUnits(PV,function(err,result){
		if (err) {
			//If we got an error while trying to get units, it isn't a showstopper, so just log the error and continue.
			console.log(err);
		}
		callback(null,spawnMonitor(PV,result));
	});
}

//getUnits runs a camonitor on the PV's '.EGU' field, and as soon as it recieves data, kills the camonitor and runs a callback.  The callback recieves two arguments: An error object, and the unit string for the PV.
function getUnits(PV, callback) {
	var stdoutdata = '', stderrdata = '';
	var unitmonitor = spawn("camonitor", [PV+".EGU"]);
	
	unitmonitor.stdout.on('readable', function(){
		var data = unitmonitor.stdout.read();
		if (data !== null) {
			stdoutdata += data;
			unitmonitor.kill();
		}	
	});
	
	unitmonitor.stderr.on('readable', function(){
		var data = unitmonitor.stdout.read();
		if (data !== null) {
			stderrdata += unitmonitor.stderr.read();
			unitmonitor.kill();
		}
	});

	unitmonitor.on('error', function(err) {
		console.log("Error spawning a camonitor to get units for the pv " + PV + ".  This might be happening because you didn't start the node server as bash, which is needed for all channel access processes.");
		return callback(err);
	});

	unitmonitor.on('close', function(code, signal){
		var unitString;
		if (stderrdata !== "" ) {
			//If there is a problem, no big deal, you just don't get a unit, and throw an error.
			var err = new Error("Error finding units for PV " + PV + ".  Camonitor exited with error: " + stderrdata);
			return callback(err);
		} else {
			//Split the string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
			var cagetResults = stdoutdata.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
			//The fourth field is the unit string.
			unitString = cagetResults[3];
			return callback(null, unitString);
		}
	});
}

//spawnMonitor spawns a new camonitor process for the PV we are interested in.
function spawnMonitor(PV,unitString){
	console.log("Opening new connection to " + PV);
	var monitor = spawn("camonitor", ["-f8",PV]);
	//monitors[PV] = camonitor;
	monitor.PV = PV;
	monitor.setMaxListeners(50);
	monitor.dataCache = {};
	monitor.dataCache.units = unitString;
	monitor.timedOut = false;
	monitor.socketConnections = 0;
	monitor.accumulating = false;
	monitor.accumulatedResultString = '';
	
	monitor.attemptKill = function(){
		if (monitor.timedOut == true && monitor.socketConnections < 1){
			console.log("Ending inactive connection to " + monitor.PV);
			monitor.kill();
		}
	}
	
	monitor.resetKillTimer = function(){
		clearTimeout(monitor.killTimer);
		//Sets a timer that will kill the camonitor process if it is not used for 30 seconds.
		monitor.killTimer = setTimeout(function(){
			monitor.timedOut = true;
			monitor.attemptKill();
		},30*1000);
	};
	
	monitor.addSocketConnection = function(){
		monitor.socketConnections += 1;
		console.log("Connections to " + monitor.PV + ": " + monitor.socketConnections);
	};
	
	monitor.removeSocketConnection = function(){
		monitor.socketConnections -= 1;
		console.log("Connections to " + monitor.PV + ": " + monitor.socketConnections);
		monitor.attemptKill();
	};
	
	monitor.resetKillTimer();
	
	//Update the dataCache any time this PV connection recieves new data.
	monitor.stdout.on('readable', function(){
		var data = monitor.stdout.read();
		//Check for channel access connection errors
		var camonitorString = data.toString('ascii');
		if (camonitorString.indexOf("(PV not found)") != -1) {
			console.log("Error for " + monitor.PV + ": " + data);
			clearTimeout(monitor.killTimer);
			monitor.kill();
			return;
		}
		
		//Split the data string into an array.  Whitespace denotes a new field.  Get rid of any blank fields.
		var resultArray = camonitorString.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
		if (resultArray.length <= 7) {
			monitor.dataCache.PV = resultArray[0];
			var tempParsedValue = parseFloat(resultArray[3]);
			if (isNaN(tempParsedValue)){
				monitor.dataCache.value = resultArray[3];
			} else {
				monitor.dataCache.value = tempParsedValue;
			}
			monitor.dataCache.timestamp = dateFromEPICSTimestamp(resultArray[1],resultArray[2]);
			monitor.dataCache.status = resultArray[4];
			monitor.dataCache.severity = resultArray[5];
		} else {
			//With waveforms, it might take more than one 'data' event to transmit the entire string.
			//We will look at the number of elements in the string we have so far compared to the number of values in the waveform.
			//Until they are equal, just keep appending to the string.
			if (monitor.accumulating == false){
				if (resultArray.length < parseInt(resultArray[3],10) + 4){
					console.log(resultArray[0] + ": Expected " + (parseInt(resultArray[3],10) + 4) + " elements, " + resultArray.length + " collected so far...");
					//We don't have all the data yet!  Accumulate...
					//console.log("Starting accumulation for " + resultArray[0]);
					monitor.accumulating = true;
					monitor.accumulatedResultString += camonitorString;
				}
			} else {
				monitor.accumulatedResultString += camonitorString;
				var accumulatedResultArray = monitor.accumulatedResultString.split(" ").filter(function(val,index,array){ return (array[index] != "" && array[index] != "\n")});
				//console.log(accumulatedResultArray[0] + ": Expected " + (parseInt(accumulatedResultArray[3],10) + 4) + " elements, " + accumulatedResultArray.length + " collected so far...");
				if (accumulatedResultArray.length == parseInt(accumulatedResultArray[3],10) + 4) {
					monitor.accumulating = false;
					monitor.dataCache.PV = accumulatedResultArray[0];
					monitor.dataCache.timestamp = dateFromEPICSTimestamp(accumulatedResultArray[1],accumulatedResultArray[2]);
					monitor.dataCache.value = new Array();
					for (var i=0; i<parseInt(accumulatedResultArray[3],10); i++) {
						monitor.dataCache.value[i] = accumulatedResultArray[i+4];
					}
					monitor.accumulatedResultString = '';
				}
			}				
		}
		
		//If we aren't in the middle of accumulating data, emit an event signalling that the latest data has been parsed and cached.
		if(!monitor.accumulating){ monitor.emit('cached',monitor.dataCache); }
	});
		
	return monitor;
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

exports.startConnection = startConnection;
exports.getUnits = getUnits;