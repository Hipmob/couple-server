function handler()
{
    var url = require('url');
    var moment = require('moment');
    var util = require('util');
    var self = { 'domain': false, 'pg': false };
    var trim = function( text ) { return text == null ? "" : text.trim(); }

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
	response.end(200);
    };
 
    return self;
}

module.exports.handler = handler;