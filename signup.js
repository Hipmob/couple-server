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
	if('body' in request && 'email' in request.body && 'password' in request.body && 'name' in request.body){
	    self.pg.connect(process.env.DATABASE_URL, function(e1, client){
		if(e1){
		    console.error("[signup.process;1]:"+e1);
		    console.error(e1.stack);
		    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
		    return;
		}
		
		var update_requests = function(guid, id){
		    client.query({
			name: 'getwaitingrequests',
			text: "SELECT id FROM app_request WHERE email = $1",
			values: [request.body.email] 
		    }, function(err, results){
			if(err){
			    console.error("[signup.process;2]:"+err);
			    console.error(err.stack);
			    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			    return;
			}
			
			if("rows" in results && results.rows.length > 0){
			    var i, l = results.rows.length, vals = [guid, id], args = [];
			    for(i=0;i<l;i++){
				args.push("$"+(i+3));
				vals.push(results.rows[i].id);
			    }
			    client.query("BEGIN");
			    client.query("UPDATE app_request SET requested_guid = $1, requested_id = $2 WHERE id IN ("+args.join(",")+")", vals, function(err2, results2){
				if(err2){
				    console.error("[signup.process;3]"+err2);
				    console.error(err2.stack);
				    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
				    return;
				}
				
				client.query("COMMIT", function(){});
			    });
			}
		    });		    
		};
		
		// check for the appropriate value
		var authenticate_account = function(shouldexist){
		    client.query("SELECT a.guid, a.password, a.id FROM app_person a WHERE a.email = $1", [request.body.email], function(err, results){
			if(err){
			    console.error("[signup.process;4]"+err);
			    console.error(err.stack);
			    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			    return;
			}
			if("rows" in results && results.rows.length > 0){
			    // exists: verify the password
			    bcrypt.compare(request.body.password, results.rows[0].password, function(err, res) {
				if(res){
				    // got it: send the guid back
				    response.end(JSON.stringify({'guid': results.rows[0].guid }));

				    // update any existing requests if we actually had to create it
				    if(shouldexist) update_requests(results.rows[0].guid, results.rows[0].id);
				}else if(err){
				    console.error("[signup.process;5]"+err);
				    console.error(err.stack);
				    response.end(JSON.stringify({ 'error': 'An authentication error occured: please try again later.' }));
				}else{
				    response.end(JSON.stringify({ 'error': 'An invalid name, email address or password were given: please correct those errors and try again.' }));
				}
				return;
			    });
			}else if(!shouldexist){
			    create_account();
			}else{
			    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			}
		    });
		}, create_account = function(){
		    bcrypt.genSalt(10, function(err, salt) {
			bcrypt.hash(request.body.password, salt, function(err, hash) {
			    // Store hash in your password DB.
			    client.query("BEGIN");
			    client.query('INSERT INTO app_person (guid, email, password, created, last_login, details, first_name) VALUES (uuid_generate_v4(), $1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3, $4)', [request.body.email, hash, hstore.stringify({}), request.body.name], function(err2, results2){
				if(err2){
				    console.error("[signup.process;6]"+err2);
				    console.error(err2.stack);
				    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
				    return;
				}
				client.query("COMMIT", function() {
				    // lazy: re-run the auth
				    authenticate_account(true);
				});
			    });
			});
		    });
		};
		
		// do an auth
		authenticate_account(false);
	    });
	}else{
	    response.end(JSON.stringify({ 'error': 'An invalid signup request was received: please check that an email, password and name were supplied.' }));
	}
    };
 
    return self;
}

module.exports.handler = handler;