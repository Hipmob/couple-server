function handler()
{
    var url = require('url');
    var moment = require('moment');
    var util = require('util');
    var self = { 'domain': false, 'pg': false };
    var bcrypt = require('bcrypt');
    var trim = function( text ) { return text == null ? "" : text.trim(); }
    var hstore = require('./hstore');

    var timezone = function()
    {
	var tz = new Date().getTimezoneOffset()/60;
	if(tz < 0){ if(tz <= -10) return "+"+(-tz) + ":00"; else return "+0"+(-tz)+":00"; }else{ if(tz >= 10) return "-"+tz + ":00"; else return "-0"+tz+":00"; }
    };

    self['config'] = function(pg, domain)
    {
	// database bits
	self.pg = require('pg');
	self.pg.defaults.poolSize = 20;
	self.domain = domain;
    };

    self['process'] = function(request, response)
    {
	response.setHeader('Content-Type','application/json');	
	if('body' in request && 'email' in request.body && 'password' in request.body){
	    self.pg.connect(process.env.DATABASE_URL, function(e1, client){
		if(e1){
		    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
		    return;
		}
		
		// try and authenticate the user
		client.query("SELECT a.id, a.guid, a.password, a.first_name, a.details FROM app_person a WHERE a.email = $1", [request.body.email], function(err, results){
		    if(err){
			response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			return;
		    }
		    
		    if("rows" in results && results.rows.length > 0){
			// exists: verify the password
			bcrypt.compare(request.body.password, results.rows[0].password, function(err, res) {
			    if(res){
				// got it: send the guid back
				hstore.parse(results.rows[0].details, function(result){
				    var responsedata = {'guid': results.rows[0].guid, 'name': results.rows[0].first_name };
				    if('partner' in result) responsedata['partner'] = result['partner'];
				    response.end(JSON.stringify(responsedata));
				});
				
				// update the last_login time
				client.query("BEGIN");
				client.query('UPDATE app_person SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [results.rows[0].id], function(err2, results2){
				    if(err2){
					console.log("[login] a database error occured ["+err+"]");
					return;
				    }
				    client.query("COMMIT", function() {
				    });
				});
			    }else if(err){
				response.end(JSON.stringify({ 'error': 'An authentication error occured: please try again later.' }));
			    }else{
				response.end(JSON.stringify({ 'error': 'An invalid name, email address or password were given: please correct those errors and try again.' }));
			    }
			});
		    }else{
			response.end(JSON.stringify({ 'error': 'An invalid name, email address or password were given: please correct those errors and try again.' }));
		    }
		});
	    });
	}else{
	    response.end(JSON.stringify({ 'error': 'invalidrequest' }));
	}
    };
 
    return self;
}

module.exports.handler = handler;