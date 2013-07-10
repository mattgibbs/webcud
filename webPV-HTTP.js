//Get units for each PVmonitor, then bind the elements to the PV server so that they update in real-time.
var PV_URL = "http://lcls-prod03.slac.stanford.edu:8888/PV?PV=";

d3.selectAll(".PVmonitor").datum(function() { return this.dataset; }).each(function(d) {
	if(d.precision==null) {
		d.precision = 0;
	}
	d3.select(this).text("?");
	bindElementToPV(this, d.pv, d.precision, d.updatetime ? d.updatetime : 2000);
});


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
		d3.json(PV_URL + d.pv, function(json){
			d3.select(elem).datum(function(d){
					d.timestamp = json["timestamp"];
					if (typeof json.value === 'number') {
						d.value = json.value.toFixed(d.precision);
					} else {
						d.value = json.value;
					}
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
		d3.json(PV_URL + d.pv, function(json){
			d3.select(elem).datum(function(d){
					d.timestamp = json["timestamp"];
					if (typeof json.value === 'number') {
						d.value = json.value.toFixed(d.precision);
					} else {
						d.value = json.value;
					}
					return d;
				})
				.text(function(d,i) { return d.value; })
				.style("opacity",ageOpacityScale(Number(new Date()) - d.timestamp))
				.style("color",matchingColorScale(json["value"]));
		});
	},d.updatetime);
});

bindElementToPV("#amplificationMode","SIOC:SYS0:ML00:CALC998",0,3000,function(val){
	if (val == "0") {
		return "Seeded";
	} else {
		return "SASE";
	}
});


setInterval(function(){
	d3.json(PV_URL + "IOC:BSY0:MP01:REQBYKIKBRST", function(json){
		if (json.value == "Yes") { 
			d3.select("h2#burstMessage").transition().style("visibility","visible");
		} else {
			d3.select("h2#burstMessage").transition().style("visibility","hidden");
		}
	}, 3000);
	
	d3.json(PV_URL + "IOC:IN20:EV01:BYKIK_ABTACT", function(json){
		if (json.value == "Enable") {
			d3.json(PV_URL + "IOC:IN20:EV01:BYKIK_ABTPRD", function(json){
				if (typeof json.value === 'number' && json.value < 2800) {
					d3.select("h2#abortMessage").transition().style("visibility","visible");
				} else {
					d3.select("h2#abortMessage").transition().style("visibility","hidden");
				}
			});
		} else {
			d3.select("h2#abortMessage").transition().style("visibility","hidden");
		}
	}, 3000);
});

var vernierElement = d3.select("#L3Vernier").datum(function() { return this.dataset; }).each(function(d) {
	bindElementToPV(this,d.pv,0,2000,function(val){
		if (val == 0) {
			return "";
		} else {
			var sign = val > 0 ? "+" : "-";
			return " " + sign + " " + Math.abs(val) + " MeV";
		}
	});
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
		d3.json(PV_URL + PV, function(json){
			if(json.value!==undefined){
				d3.select(elem).datum(function(d){
					if (d === undefined) { d = {}; };
					json.value = processor(json.value);
					if (typeof json.value === 'number') {
						d.value = json.value.toFixed(d.precision);
					} else {
						d.value = json.value;
					}

					if (d.units === undefined) {
						if (json.units !== undefined) {
							d.units = json.units;
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
			}
		});
	},updateRate);
}