var caClient = require("./caClient");
var PVsToGet = require("./cudpvs.json");
var writeFile = require("fs").writeFile;
function getLCLSStatus(){
	caClient.get(PVsToGet,function(err,data){
		writeFile('/u/ad/mgibbs/public_html/cuddata.json', JSON.stringify(data), function (err) {
			if (err) throw err;
		});
	});
}

exports.getLCLSStatus = getLCLSStatus;