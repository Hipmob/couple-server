function handler()
{
    var url = require('url');
    var moment = require('moment');
    var util = require('util');
    var self = { 'domain': false, 'pg': false };
    var bcrypt = require('bcrypt');
    var trim = function( text ) { return text == null ? "" : text.trim(); }
    var hstore = require('./hstore');
    var hipmob = require("hipmob");
    var handle = hipmob(process.env.HIPMOB_USERNAME, process.env.HIPMOB_PASSWORD);
    var Mailgun = require("mailgun").Mailgun;
    var fs = require('fs');
    var Mustache = require('mustache');
    var email_template = fs.readFileSync('email.template').toString('ascii');
    var mg = new Mailgun(process.env.MAILGUN_API_KEY);

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

    self['request'] = function(request, response)
    {
	response.setHeader('Content-Type','application/json');	
	if('body' in request && 'guid' in request.body && 'partnerEmail' in request.body){
	    self.pg.connect(process.env.DATABASE_URL, function(e1, client){
		if(e1){
		    console.error("[link.request;1]"+e1);
		    console.error(e1.stack);
		    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
		    return;
		}
		
		// fetch the info for both users
		client.query({
		    name: "link_find_user",
		    text: "SELECT id, guid, email, first_name, last_name, details FROM app_person WHERE guid = $1 OR email = $2", 
		    values: [request.body.guid, request.body.partnerEmail] 
		}, function(err, userinfo){
		    if(err){
			console.error("[link.request;2]"+err);
			console.error(err.stack);
			response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			return;
		    }
		    
		    // pull out the rows
		    var uinfo = false, pinfo = false;
		    if("rows" in userinfo && userinfo.rows.length > 0){
			for(var i=0;i<userinfo.rows.length;i++){
			    if(!uinfo && userinfo.rows[i].guid == request.body.guid){
				uinfo = userinfo.rows[i];
				if(uinfo.email == request.body.partner){
				    response.end(JSON.stringify({ 'error': 'invalidselfcouplerequest' }));
				    return;
				}
			    }else if(!pinfo && userinfo.rows[i].email == request.body.partnerEmail){
				pinfo = userinfo.rows[i];
			    }
			}
		    }
		    
		    // got it
		    if(!uinfo){
			response.end(JSON.stringify({ 'error': 'The user with the specified identifier ('+request.body.guid+') could not be found.' }));
			return;
		    }
		    
		    // implements the actual couple request
		    var send_couple_request = function(requester, requested, details){
			client.query("BEGIN");
			var query = 'INSERT INTO app_request (guid, requester_id, requester_guid, requester_email, email, created, is_active, details) VALUES (uuid_generate_v4(), $1, $2, $3, $4, CURRENT_TIMESTAMP, TRUE, $5)';
			var params = [requester.id, requester.guid, requester.email, request.body.partnerEmail, hstore.stringify({})];
			if(requested){
			    query = 'INSERT INTO app_request (guid, requester_id, requester_guid, requester_email, requested_id, requested_guid, email, created, is_active, details) VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, TRUE, $7)';
			    params = [requester.id, requester.guid, requester.email, requested.id, requested.guid, request.body.partnerEmail, hstore.stringify({})];
			}
			client.query(query, params, function(err2, results2){
			    if(err2){
				console.error("[link.request;3]"+err2);
				console.error(err2.stack);
				response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
				return;
			    }
			    
			    // fetch the guid for that request
			    client.query({
				name: 'getlastrequestid',
				text: "SELECT guid FROM app_request WHERE id = currval('app_request_id_seq')"
			    }, function(err, results){
				if(err){
				    console.error("[link.request;4]:"+err);
				    console.error(err.stack);
				    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
				    return;
				}
				
				if("rows" in results && results.rows.length > 0){
				    client.query("COMMIT", function() {
					response.end(JSON.stringify({ 'success': request.body.partnerEmail, 'guid': results.rows[0].guid }));
					
					// Send the email to the actual person using mailgun
					mg.sendText(requester.email,
						    [request.body.partnerEmail],
						    requester.first_name +' <'+requester.email+"> say's you're a Couple. Join them!",
						    Mustache.render(email_template, { 'first_name': requester.first_name, 'email': request.body.partnerEmail }),
						    function(err) {
							err && console.log(err) 
						    });
				    });
				}else{
				    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));				    
				}
			    });
			});
		    };
		    
		    // check if we're already coupled
		    client.query({
			name: "couplecheck",
			text: "SELECT id FROM app_request WHERE is_active = TRUE AND accepted IS NOT NULL AND (requester_id = $1 OR requested_id = $1)", 
			values: [uinfo.id]
		    }, function(err, results){
			if(err){
			    console.error("[link.request;4]:"+err);
			    console.error(err.stack);
			    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			    return;
			}
			
			// if we're already coupled
			if("rows" in results && results.rows.length > 0){
			    response.end(JSON.stringify({ 'error': 'You are already coupled to another user: please breakup with that user first.'}));
			    return;
			}else{
			    // parse our details out
			    hstore.parse(uinfo.details, function(result){
				// see if the user exists
				if(!pinfo){
				    // nope
				    send_couple_request(uinfo, false, result);
				}else{
				    // yep
				    send_couple_request(uinfo, pinfo, result);
				}
			    });
			}
		    });
		});
	    });
	}else{
	    response.end(JSON.stringify({ 'error': 'An invalid couple request was received: please try again later.' }));
	}
    };

    self['cancel'] = function(request, response)
    {
	response.setHeader('Content-Type','application/json');	
	if('body' in request && 'guid' in request.body && 'partnerGuid' in request.body){
	    self.pg.connect(process.env.DATABASE_URL, function(e1, client){
		if(e1){
		    console.error("[link.cancel;1]:"+e1);
		    console.error(e1.stack);
		    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
		    return;
		}
		
		// see if we actually have any outstanding requests
		if(request.body.partnerGuid == ""){
		    response.end(JSON.stringify({ 'error': 'There is no outstanding couple request from the specified user to the specified email address.', 'reset': true }));
		    return;
		}
		
		client.query("SELECT id FROM app_request WHERE accepted IS NULL AND requester_guid = $1 AND guid = $2", [request.body.guid, request.body.partnerGuid], function(err, requestinfo){
		    if(err){
			console.error("[link.cancel;2]:"+err);
			console.error(err.stack);
			response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			return;
		    }
		    
		    // pull out the rows
		    if("rows" in requestinfo && requestinfo.rows.length > 0){
			// cancel it
			client.query("BEGIN");
			client.query('UPDATE app_request SET cancelled = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = $1', [requestinfo.rows[0].id], function(err2, results2){
			    if(err2){
				console.error("[link.cancel;3]:"+err2);
				console.error(err2.stack);
				response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
				return;
			    }
			    
			    client.query("COMMIT", function() {
				response.end(JSON.stringify({ 'success': true }));
			    });
			});
		    }else{
			response.end(JSON.stringify({ 'error': 'There is no outstanding couple request from the specified user to the specified email address.', 'reset': true }));
		    }
		});
	    });
	}else{
	    response.end(JSON.stringify({ 'error': 'An invalid cancel request was received: please try again later.' }));
	}
    };
 
    self['status'] = function(request, response){
	response.setHeader('Content-Type','application/json');	
	if('body' in request && 'guid' in request.body){
	    self.pg.connect(process.env.DATABASE_URL, function(e1, client){
		if(e1){
		    console.error("[link.status;1]:"+e1);
		    console.error(e1.stack);
		    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
		    return;
		}
		
		var check_for_requests = function(){
		    // see if we are the target of an as-yet unfulfilled request
		    client.query("SELECT a.id, a.guid, a.requester_email AS email, b.first_name AS requester_name FROM app_request a INNER JOIN app_person b ON b.guid = a.requester_guid WHERE a.requested_guid = $1 AND a.is_active = TRUE AND a.accepted IS NULL AND a.cancelled IS NULL AND a.declined IS NULL", [request.body.guid], function(err, requestinfo){
			if(err){
			    console.error("[link.status;3]:"+err);
			    console.error(err.stack);
			    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			    return;
			}
			
			// pull out the rows
			if("rows" in requestinfo && requestinfo.rows.length > 0){
			    // check if it has been accepted or declined
			    var row, i, l = requestinfo.rows.length, options = [];
			    for(i=0;i<l;i++){
				row = requestinfo.rows[i];
				options.push([row.email, row.guid, row.requester_name]);
			    }
			    response.end(JSON.stringify({ 'request': true, 'options': options }));
			}else{
			    if("partnerGuid" in request.body){
				response.end(JSON.stringify({ 'error': 'There is no outstanding couple request from the specified user or for the specified user.', 'reset': true }));
			    }else{
				response.end(JSON.stringify({ 'norequests': true }));
			    }
			}
		    });
		};
		
		if('partnerGuid' in request.body){
		    // check for the status of a request we've made or see if it has been cancelled
		    client.query("SELECT a.id, a.email, a.accepted, a.declined, a.cancelled, a.requested_guid, a.requester_guid, b.first_name AS requested_name FROM app_request a LEFT JOIN app_person b ON b.guid = a.requested_guid WHERE (a.requester_guid = $1 OR a.requested_guid = $1) AND a.guid = $2", [request.body.guid, request.body.partnerGuid], function(err, requestinfo){
			if(err){
			    console.error("[link.status;2]:"+err);
			    console.error(err.stack);
			    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			    return;
			}
			
			// pull out the row
			if("rows" in requestinfo && requestinfo.rows.length > 0){
			    // check if it has been accepted or declined
			    var row = requestinfo.rows[0];
			    if(row.cancelled){
				if(row.accepted) response.end(JSON.stringify({ 'brokenup': true }));
				else response.end(JSON.stringify({ 'cancelled': true }));
			    }else if(row.accepted){
				if("active" in request.body){
				    response.end(JSON.stringify({ 'active': true }));
				}else{
				    response.end(JSON.stringify({ 'accepted': true, 'partnerGuid': row.requested_guid, 'partnerEmail': row.email, 'partnerName': row.requested_name }));
				}
			    }else if(row.declined){
				response.end(JSON.stringify({ 'declined': true, 'partnerEmail': row.email }));
			    }else{
				response.end(JSON.stringify({ 'pending': true }));				    
			    }
			}else{
			    check_for_requests();
			}
		    });
		}else{
		    check_for_requests();
		}		
	    });
	}else{
	    response.end(JSON.stringify({ 'error': 'An invalid status check was received: please try again later.' }));
	}
    };

    self['accept'] = function(request, response)
    {
	response.setHeader('Content-Type','application/json');	
	if('body' in request && 'guid' in request.body && 'partnerGuid' in request.body){
	    self.pg.connect(process.env.DATABASE_URL, function(e1, client){
		if(e1){
		    console.error("[link.accept;1]"+e1);
		    console.error(e1.stack);
		    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
		    return;
		}
		
		// fetch the request
		client.query("SELECT a.id, a.requester_id, a.requester_guid, a.requester_email, a.requested_id, a.requested_guid, a.email, b.first_name AS requester_name FROM app_request a INNER JOIN app_person b ON b.guid = a.requester_guid WHERE a.requested_guid = $1 AND a.guid = $2 AND a.is_active = TRUE", [request.body.guid, request.body.partnerGuid], function(err, requestinfo){
		    if(err){
			console.error("[link.accept;2]"+err);
			console.error(err.stack);
			response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			return;
		    }
		    
		    // pull out the rows
		    if("rows" in requestinfo && requestinfo.rows.length > 0){
			var row = requestinfo.rows[0];
			
			client.query("BEGIN");
			client.query('UPDATE app_request SET declined = CURRENT_TIMESTAMP, is_active = FALSE WHERE is_active = TRUE AND email = $1 AND id != $2', [row.email, row.id], function(err2, results2){
			    if(err2){
				console.error("[link.accept;3]"+err2);
				console.error(err2.stack);
				response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
				return;
			    }
			    
			    client.query('UPDATE app_request SET accepted = CURRENT_TIMESTAMP WHERE id = $1', [row.id], function(err2, results2){
				if(err2){
				    console.error("[link.accept;4]"+err2);
				    console.error(err2.stack);
				    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
				    return;
				}
				
				client.query("COMMIT", function() {
				    // make the hipmob request
				    var dev = handle.get_device(process.env.HIPMOB_APPID, row.requester_guid, false);
				    var friendlist = [handle.get_device(process.env.HIPMOB_APPID, row.requested_guid, false)];
				    dev.set_friends(friendlist, function(err, count){
					if(err){
					    console.error("[link.accept;5]"+err);
					    console.error(err.stack);
					    response.end(JSON.stringify({ 'error': 'A Hipmob service error occured: please try again later.' }));
					}else{
					    response.end(JSON.stringify({ 'accepted': true, 'partnerGuid': row.requester_guid, 'partnerEmail': row.requester_email, 'partnerName': row.requester_name }));
					}
				    });
				});
			    });
			});
		    }else{
			response.end(JSON.stringify({ 'error': 'There is no outstanding couple request with the specified information.', 'reset': true }));
		    }
		});
	    });
	}else{
	    response.end(JSON.stringify({ 'error': 'An invalid status check was received: please try again later.' }));
	}
    };

    self['decline'] = function(request, response)
    {
	response.setHeader('Content-Type','application/json');	
	if('body' in request && 'guid' in request.body && 'partnerGuid' in request.body){
	    self.pg.connect(process.env.DATABASE_URL, function(e1, client){
		if(e1){
		    console.error("[link.decline;1]"+e1);
		    console.error(e1.stack);
		    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
		    return;
		}
		
		// fetch the request
		var q = "SELECT id, requester_id, requester_guid, requester_email, requested_id, requested_guid, email FROM app_request WHERE requested_guid = $1 AND guid = $2 AND is_active = TRUE";
		var params = [request.body.guid, request.body.partnerGuid];
		if(request.body.partnerGuid == 'all'){
		    q = "SELECT id, requester_id, requester_guid, requester_email, requested_id, requested_guid, email FROM app_request WHERE requested_guid = $1 AND is_active = TRUE";
		    params = [request.body.guid];
		}
		
		client.query(q, params, function(err, requestinfo){
		    if(err){
			console.error("[link.decline;2]"+err);
			console.error(err.stack);
			response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			return;
		    }
		    
		    // pull out the rows
		    if("rows" in requestinfo && requestinfo.rows.length > 0){
			var i, l = requestinfo.rows.length, row, args = [], vals = [];
			for(i=0;i<l;i++){
			    args.push("$"+(i+1));
			    vals.push(requestinfo.rows[i].id);
			}
			
			client.query("BEGIN");
			client.query('UPDATE app_request SET declined = CURRENT_TIMESTAMP, is_active = FALSE WHERE id IN ('+args.join(",")+')', vals, function(err2, results2){
			    if(err2){
				console.error("[link.decline;3]"+err2);
				console.error(err2.stack);
				response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
				return;
			    }
			    
			    client.query("COMMIT", function() {
				response.end(JSON.stringify({ 'declined': true }));
			    });
			});
		    }else{
			response.end(JSON.stringify({ 'error': 'There is no outstanding couple request with the specified information.' }));
		    }
		});
	    });
	}else{
	    response.end(JSON.stringify({ 'error': 'An invalid status check was received: please try again later.' }));
	}
    };

    self['breakup'] = function(request, response)
    {
	response.setHeader('Content-Type','application/json');	
	if('body' in request && 'guid' in request.body && 'partnerGuid' in request.body){
	    self.pg.connect(process.env.DATABASE_URL, function(e1, client){
		if(e1){
		    console.error("[link.breakup;1]:"+e1);
		    console.error(e1.stack);
		    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
		    return;
		}
		
		if(request.body.partnerGuid == ""){
		    response.end(JSON.stringify({ 'success': true }));
		}else{
		    client.query("BEGIN");
		    client.query('UPDATE app_request SET cancelled = CURRENT_TIMESTAMP, is_active = FALSE WHERE guid = $1 AND (requester_guid = $2 OR requested_guid = $2)', [request.body.partnerGuid, request.body.guid], function(err2, results2){
			if(err2){
			    console.error("[link.breakup;3]"+err2);
			    console.error(err2.stack);
			    response.end(JSON.stringify({ 'error': 'A database error occured: please try again later.' }));
			    return;
			}
			
			client.query("COMMIT", function() {
			    var dev = handle.get_device(process.env.HIPMOB_APPID, request.body.guid, false);
			    dev.remove_all_friends(function(err, count){
				if(err){
				    console.error("[link.breakup;4]"+err);
				    console.error(err.stack);
				    response.end(JSON.stringify({ 'error': 'A Hipmob service error occured: please try again later.' }));
				}else{
				    response.end(JSON.stringify({ 'success': true }));
				}
			    });
			});
		    });
		}
	    });
	}else{
	    response.end(JSON.stringify({ 'error': 'An invalid status check was received: please try again later.' }));
	}
    };

    return self;
}

module.exports.handler = handler;