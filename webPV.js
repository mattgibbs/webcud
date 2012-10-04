//Get units for each PVmonitor, then bind the elements to the PV server so that they update in real-time.
d3.selectAll(".PVmonitor").datum(function() { return this.dataset; }).each(function(d) {
	if(d.units==null) {
		setTimeout(function(){
			d3.json("http://lcls-prod02.slac.stanford.edu:8888/caget?PV=" + d.pv + ".EGU", function(json){
				if(json["value"]!==undefined){
					d.units = json["value"];
				} else {
					d.units = "";
				}
			});
		},Math.random()*1000);	//Give this some random delay so all the cagets don't hit the server at the same time.
	}
	if(d.precision==null) {
		d.precision = 0;
	}
	d3.select(this).text("?");
	bindElementToPV(this, d.pv, d.precision, d.updatetime ? d.updatetime : 3000);
});

function bindElementToPV(elem, PV, precision, updateRate) {
	//Enforce a maximum update rate of 1 Hz.
	if(updateRate < 1000){
		updateRate = 1000;
	}
	setInterval(function(){
		d3.json("http://lcls-prod02.slac.stanford.edu:8888/PV?PV=" + PV + "&precision=" + precision, function(json){
			if(json["value"]!==undefined){
				d3.select(elem).datum(function(d){ d.value = json["value"]; return d; }).text(function(d,i) {
					return d.value + " " + d.units;
				});
			}
		});
	},updateRate);
}