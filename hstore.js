var sanitize_input = function(input) {
    // http://www.postgresql.org/docs/9.0/static/sql-syntax-lexical.html [4.1.2.1-4.1.2.2]
    // backslashes (\) must be replaced with double backslashes (\\)
    input = input.replace(/\\/g, '\\\\');

    // double quotes (") must be replaced with \"
    input = input.replace(/"/g, '\\"');
    return input;
};

var to_string = function(input) {
    switch(typeof input) {
    case 'boolean':
    case 'number':
	return String(input);
    case 'string':
	return sanitize_input(input);
    default:
	return '';
    }
};

var keyregex = /[^"]*.?("[^"]*")=>/, valregex = /[^"]*.?("(?:[^"]|\\")*"),/, keyclean = /^"|"$/g, valclean1 = /\\\\/g, valclean2 = /\\"/g;

var set_value = function(block, key, val){
    block[key.replace(keyclean, '')] = val.replace(keyclean, '').replace(valclean1, "\\").replace(valclean2, '"');
};

module.exports = {
    stringify: function (data, callback){
	var hstore = Object.keys(data).map(function (key) {
	    return '"'+key+'"=>"'+to_string(data[key])+'"';
	});
	var joined = hstore.join();
	if(callback && typeof callback == 'function') callback(joined);	
	else return joined;
    },
    
    parse: function(value, callback) {
	var res = {}, src = value, key = false, val = false, lastkey = false;
	key = src.match(keyregex);
	while(key != null && typeof key == "object"){
	    src = key['input'].substring(key['index']+key[0].length);
	    val = src.match(valregex);
	    if(val == null || typeof val != "object"){
		set_value(res, key[1], src);
		break;
	    }else{
		set_value(res, key[1], val[1]);
	    }
	    src = val['input'].substring(val['index']+val[0].length);
	    key = src.match(keyregex);
	}
	if(callback && typeof callback == 'function') callback(res);	
	else return res;
    }
};