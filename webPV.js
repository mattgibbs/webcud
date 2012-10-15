var socket = io.connect('http://lcls-prod02.slac.stanford.edu:8888');

//Get units for each PVmonitor, then bind the elements to the PV server so that they update in real-time.
d3.selectAll(".PVmonitor").datum(function() { return this.dataset; }).each(function(d) {
	if(d.precision==null) {
		d.precision = 0;
	}
	d3.select(this).text("?");
	var elem = this;
	socket.emit('connectToPV',d);
	socket.on(d.pv,function(data) {
		d3.select(elem).datum(function(d){
			if (d === undefined) { d = {}; };
			if (typeof data.value === 'number') {
				d.value = data.value.toFixed(d.precision);
			} else {
				d.value = data.value;
			}
			
			if (d.units === undefined) {
				if (data.units !== undefined) {
					d.units = data.units;
				}
			}
			return d;
		})
		.text(function(d,i) {
			if (d.units === undefined) {
				return d.value;
			} else {
				return d.value + " " + d.units;
			}
		});
	});
	//bindElementToPV(this, d.pv, d.precision, d.updatetime ? d.updatetime : 2000);
});

/*
//Code for the emittance numbers is specialized so that the colors change.
var emittanceColorScale = d3.scale.quantile()
							.domain([0, 3])
							.range(["#00CC22", "#FFFF00", "#FF4000"]);

var ageOpacityScale = d3.scale.linear()
						.domain([0, 16*60*60*1000]) //Make the values fade to 30% after 16 hours.
						.range([1, 0.3])
						.clamp(true);
							
d3.selectAll(".emittanceValue").datum(function() { return this.dataset; }).each(function(d) {
	var elem = this;
	if (d.updatetime == undefined) {
		d.updatetime = 3000;
	}
	setInterval(function(){
		d3.json("http://lcls-prod02.slac.stanford.edu:8888/PV?PV=" + d.pv + "&precision=" + d.precision, function(json){
			d3.select(elem).datum(function(d){
					d.timestamp = json["timestamp"];
					d.value = json["value"];
					return d;
			 })
				.text(function(d,i) { return d.value; })
				.style("opacity",ageOpacityScale(Number(new Date()) - d.timestamp))
				.style("color",emittanceColorScale(json["value"]));
				
		});
	},d.updatetime);
});

var matchingColorScale = d3.scale.quantile()
							.domain([1, 1.5])
							.range(["#00CC22", "#FFFF00", "#FF4000"]);
							
d3.selectAll(".matchingValue").datum(function() { return this.dataset; }).each(function(d) {
	var elem = this;
	if (d.updatetime == undefined) {
		d.updatetime = 3000;
	}
	setInterval(function(){
		d3.json("http://lcls-prod02.slac.stanford.edu:8888/PV?PV=" + d.pv + "&precision=" + d.precision, function(json){
			d3.select(elem).datum(function(d){
					d.timestamp = json["timestamp"];
					d.value = json["value"];
					return d;
				})
				.text(function(d,i) { return d.value; })
				.style("opacity",ageOpacityScale(Number(new Date()) - d.timestamp))
				.style("color",matchingColorScale(json["value"]));
		});
	},d.updatetime);
});
*/
/*
setInterval(function(){
	d3.json("http://lcls-prod02.slac.stanford.edu:8888/PV?PV=SIOC:SYS0:ML00:CALC998", function(json){
		d3.select('#amplificationMode').text(function() { 
				if(json["value"] == "0") {
					return "Seeded";
				} else {
					return "SASE";
				}
			});
	});
},3000);
*/
/*
bindElementToPV("#amplificationMode","SIOC:SYS0:ML00:CALC998",0,3000,function(val){
	if (val == "0") {
		return "Seeded";
	} else {
		return "SASE";
	}
});

function bindElementToPV(elem, PV, precision, updateRate, processor) {
	//Enforce a maximum update rate of 1 Hz.
	if(updateRate < 1000){
		updateRate = 1000;
	}
	
	if (processor === undefined) {
		processor = function(d) {
			return d;
		}
	}
	setInterval(function(){
		d3.json("http://lcls-prod02.slac.stanford.edu:8888/PV?PV=" + PV + "&precision=" + precision, function(json){
			if(json["value"]!==undefined){
				d3.select(elem).datum(function(d){
					if (d === undefined) { d = {}; };
					d.value = processor(json["value"]);
					if (d.units === undefined) {
						if (json["units"] === undefined) {
							d.units = "";
						} else {
							d.units = json["units"];
						}
					}
					return d;
				})
				.text(function(d,i) {
					if (d.units == "") {
						return d.value;
					} else {
						return d.value + " " + d.units;
					}
				});
			}
		});
	},updateRate);
}
*/