/*  webcud-socket.js
    This is all code that is particular to the LCLS Web CUD (Websocket Edition), and not useful for general applications
*/

//Get emittance data.  This is specialized code so that the opacity and color of the emittance number can be changed to reflect the age and quality of the emittance.
var emittanceColorScale = d3.scale.quantile()
							.domain([0, 3])
							.range(["#00CC22", "#FFFF00", "#FF4000"]);

var ageOpacityScale = d3.scale.linear()
						.domain([0, 16*60*60*1000]) //Make the values fade to 30% after 16 hours.
						.range([1, 0.3])
						.clamp(true);
							
d3.selectAll(".emittanceValue").datum(function() { return getDataAttributes(this); }).each(function(d) {
	var elem = this;
	if (d.updatetime == undefined) {
		d.updatetime = 3000;
	}
	setInterval(function(){
		d3.json(PV_URL + d.pv, function(error, json){
			if (error) return console.log("There was an error loading " + PV_URL + d.pv);
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

//Get the match data.  This uses a different color scale than emittance, but is otherwise the same.
var matchingColorScale = d3.scale.quantile()
							.domain([1, 1.5])
							.range(["#00CC22", "#FFFF00", "#FF4000"]);
							
d3.selectAll(".matchingValue").datum(function() { return getDataAttributes(this); }).each(function(d) {
	var elem = this;
	if (d.updatetime == undefined) {
		d.updatetime = 3000;
	}
	setInterval(function(){
		d3.json(PV_URL + d.pv, function(error, json){
			if (error) return console.log("There was an error loading " + PV_URL + d.pv);
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

//Get the amplification mode of the machine.  This has a custom data processor so that it can translate '1' or '0' into 'seeding' or 'SASE'.
bindElementToPV("#amplificationMode","SIOC:SYS0:ML00:CALC998",0,3000,function(val){
	if (val == "0") {
		return "Seeded";
	} else {
		return "SASE";
	}
});

//Get the BYKIK abort state, and show a message explaining it.
setInterval(function(){
	d3.json(PV_URL + "IOC:BSY0:MP01:REQBYKIKBRST", function(error, json){
		if (error) return console.log("There was an error loading " + PV_URL + "IOC:BSY0:MP01:REQBYKIKBRST");
		if (json.value == "Yes") { 
			d3.select("h2#burstMessage").transition().style("visibility","visible");
		} else {
			d3.select("h2#burstMessage").transition().style("visibility","hidden");
		}
	}, 3000);
	
	d3.json(PV_URL + "IOC:IN20:EV01:BYKIK_ABTACT", function(error, json){
		if (error) return console.log("There was an error loading " + PV_URL + "IOC:IN20:EV01:BYKIK_ABTACT");
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

//Get the vernier.  It gets a special data processor that adds a + or - sign to the text.
var vernierElement = d3.select("#L3Vernier").datum(function() { return getDataAttributes(this); }).each(function(d) {
	bindElementToPV(this,d.pv,d.precision,2000,function(val){
		if (val == 0) {
			return "";
		} else {
			var sign = val > 0 ? "+" : "-";
			val = val.toFixed(d.precision);
			return " " + sign + " " + Math.abs(val) + " MeV";
		}
	});
});