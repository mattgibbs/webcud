var pvMonitorMap = {};

d3.selectAll(".PVmonitor").datum(function() { 
	return getDataAttributes(this);
}).each(function(d) {
	if (d) {
		if (d.precision == null) {
			d.precision = 0;
		}
		d3.select(this).text("?");
    bindElementToPV(this, d.pv, d.precision, d.updatetime ? d.updatetime : 2000);
	}
});

function bindElementToPV(elem, PV, precision, updateRate, processor, styler) {
	if (processor === undefined || processor === null) {
		processor = function(d) {
			return d;
		}
	}
  
  if (styler === undefined) {
    styler = function(elem) {
      return;
    }
  }
  
  elem.processor = processor;
  elem.precision = precision;
  pvMonitorMap[PV] = { "processor": processor, "precision": precision, "elem": elem, "styler": styler };
}

function startConnection() {
  supportsWebSockets = 'WebSocket' in window || 'MozWebSocket' in window;
  var socket;
  if ('WebSocket' in window) {
    socket = new WebSocket('ws://lcls-prod03/monitor');
  } else if ('MozWebSocket' in window) {
    socket = new MozWebSocket('ws://lcls-prod03/monitor');
  }
  
  socket.onopen = function() {
    for (var pv in pvMonitorMap) {
      if (pvMonitorMap.hasOwnProperty(pv)) {
        console.log("Connecting to PV: " + pv);
        socket.send(pv);
      } 
    }
  };
  socket.onmessage = function(event) {
    var json = JSON.parse(event.data);
    if (json.msg_type === "connection") {
      return;
    }
    if (json.msg_type === "monitor") {
      if(json.value!==undefined){
        var monitor = pvMonitorMap[json.pvname];
        var elem = monitor["elem"];
        var processor = monitor["processor"];
        var precision = monitor["precision"];
        var styler = monitor["styler"];
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
  			})
        .call(styler);
  	  }
    }
  };
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