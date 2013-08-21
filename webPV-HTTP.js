/*  webPV-HTTP.js
    This code looks for elements with the '.PVmonitor' class in your HTML file, and turns them into constantly updating PV monitors.    
*/
var PV_URL = "http://lcls-prod03.slac.stanford.edu:8888/PV?PV=";

d3.selectAll(".PVmonitor").datum(function() { 
	return getDataAttributes(this);
	//return this.dataset; 
}).each(function(d) {
	if (d) {
		if (d.precision == null) {
			d.precision = 0;
		}
		d3.select(this).text("?");
		bindElementToPV(this, d.pv, d.precision, d.updatetime ? d.updatetime : 2000);
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
		d3.json(PV_URL + PV, function(error, json){
			if (error) return console.log("There was an error loading " + PV_URL + PV);
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

function getDataAttributes(elem) {
	var elemData = {};
	if (elem.getAttribute('data-pv')) {
		elemData.pv = elem.getAttribute('data-pv');
	}
	if (elem.getAttribute('data-precision') != null) {
		elemData.precision = elem.getAttribute('data-precision');
	}
	
	elemData.updatetime = elem.getAttribute('data-updatetime') || 3000;
	
	if (elem.getAttribute('data-units') != null) {
		elemData.units = elem.getAttribute('data-units');
	}
	return elemData;
}