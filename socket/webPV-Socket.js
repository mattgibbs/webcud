var socket = io.connect('http://lcls-prod03.slac.stanford.edu:8888');

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
	if (processor === undefined) {
		processor = function(d) {
			return d;
		}
	}
	socket.emit('connectToPV',d);
	socket.on(d.pv,function(json) {
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


//Get units for each PVmonitor, then bind the elements to the PV server so that they update in real-time.
/*
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
*/