//This is basically what 'node-xml2js' does, but I want to stream the data in,
//and I didn't want to do coffeescript, and I wanted to understand the code, so
//I rewrote it myself, based on his code.
var saxStream = require("./sax").createStream();
var stack = [];
var parsedObject = {};

process.stdin.resume();
process.stdin.pipe(saxStream);

saxStream.on('opentag',function(node) {
	stack.push(node);
});
	
saxStream.on('closetag',function(tag){
	var obj = stack.pop();
	var nodeName = obj.name;
	delete obj.name;
	delete obj.attributes;
	var top = stack[stack.length - 1];
	if (stack.length > 0) {
		if (!(nodeName in top)) {
			top[nodeName] = obj;
		} else if (top[nodeName] instanceof Array) {
			top[nodeName].push(obj);
		} else {
			old = top[nodeName];
			top[nodeName] = [old];
			top[nodeName].push(obj);
		}
	} else {
		parsedObject = obj;
		//saxStream.emit('end')
	}
});


saxStream.on('text',function(text){
	text = text.replace(/\s+/g, '');
	if(text.length > 0){
		var topIndex = stack.length -1;
		if (stack[topIndex]) {
			stack[topIndex].text = text;
		}
	}
});

saxStream.on('end',function(){
	//console.log(parsedObject);
	parsedObject = parsedObject["PARAMS"]["PARAM"]["VALUE"]["ARRAY"]["DATA"]["VALUE"]["STRUCT"]["MEMBER"][4]["VALUE"]["ARRAY"]["DATA"]["VALUE"];
	niceObject = parsedObject.map(function(item){
		var tempItem = {};
		tempItem.status = parseInt(item["STRUCT"]["MEMBER"][0]["VALUE"]["I4"]["text"],10);
		tempItem.severity = parseInt(item["STRUCT"]["MEMBER"][1]["VALUE"]["I4"]["text"],10);
		tempItem.timestamp = parseInt(item["STRUCT"]["MEMBER"][2]["VALUE"]["I4"]["text"],10);
		tempItem.value = parseFloat(item["STRUCT"]["MEMBER"][4]["VALUE"]["ARRAY"]["DATA"]["VALUE"]["DOUBLE"]["text"]);
		return tempItem;
	});
	process.send(niceObject);
	process.stdin.pause();
});

