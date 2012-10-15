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
});