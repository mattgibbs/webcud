/*
caClient is a node.js interface to Channel Access.  You ask it for data from a PV, and it returns that data.
It intelligently manages many camonitor processes so that only one connection to a PV is open at a time, no matter how many requests are made.  Inactive connections are closed after 30 seconds without use.
It caches the latest value from a PV asynchronously, as it gets it from its camonitors, so that data can be returned as quickly as possible.
*/
var camonitor = require("./camonitor");

var monitors = {}; //The monitors structure keeps a reference to each camonitor process, using the PV that camonitor is observing as a key.

/*
caClient.get() is how you get data from a PV.  Pass a PV, and a callback to execute once the data is recieved.
If there is no established connection to the PV, it will create a new one and add it to 'monitors'.
If there already is one, it immediately sends the most recently cached value for the PV.
If you pass an array, it gets all the values and returns an array of the values.
*/
function get(PV,callback) {
	//If 'PV' is an array, assume each element is a string, and each string is a PV.  Call this function for each individual PV.
	if( Object.prototype.toString.call( PV ) === '[object Array]' ) {
	    var length = PV.length;
		var singlePV = null;
		var resultArray = {};
		var valuesRecieved = 0;
		for (var i = 0; i < length; i++) {
			singlePV = PV[i];
			this.get(singlePV,function(err,value){
				if (err) {
					resultArray[value["PV"]] = err;
				} else {
					resultArray[value["PV"]] = value;
				}
				valuesRecieved += 1;
				//console.log("Recieved " + valuesRecieved + " of " + length);
				if (valuesRecieved == length) {
					return callback(null,resultArray);
				}
			});
		}
	} else {
		if (monitors[PV] === undefined) {
			//This is a new connection.  Spawn a new camonitor.  Once it gets its first bit of data, respond with that.
			var newMonitor = camonitor.startConnection(PV,function(err,newMonitor){
				if (err) {
					return callback(err);
				} else {
					monitors[PV] = newMonitor;

					//Clean up when this connection ends.
					newMonitor.on('close', function(code){
						console.log("Connection to " + newMonitor.PV + " ended.");
						delete monitors[newMonitor.PV];
					});

					newMonitor.on('error', function(err) {
						var err = new Error("Error spawning a camonitor.  This may be happening because the CA environment isn't set up right.");
						callback(err);
					});

					newMonitor.once('cached',function(data) {
						if(data !== undefined) {
							callback(null,data);
						} else {
							var err = new Error("There is no PV data available.")
							callback(err);
						}
					});
				}
			});
		} else {
			//This is an existing connection.  Respond with the latest cached data.
			var existingMonitor = monitors[PV];
			existingMonitor.resetKillTimer();
			if (existingMonitor.dataCache !== undefined) {
				return callback(null,existingMonitor.dataCache);
			} else {
				var err = new Error("There is no cached PV data available.");
				return callback(err);
			}
		}
	}
}

function status() {
	var allPVs = Object.keys(monitors);
	var monitorList = [];
	var length = allPVs.length;
	var PV = null;
	for (var i = 0; i < length; i++) {
		PV = allPVs[i];
		var monitor = monitors[PV];
	  	monitorList.push({ "PV": PV, "PID": monitor.pid });
	}

	return monitorList;
}

process.on('exit',function() {
	console.log("Ending all PV connections before exit.");
	var allPVs = Object.keys(monitors);
	var length = allPVs.length;
	var PV = null;
	for (var i = 0; i < length; i++) {
		PV = allPVs[i];
		var monitor = monitors[PV];
	  	monitor.kill();
	}
});

exports.get = get;
exports.status = status;
