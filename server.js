(function(){
    var util = require('util');

    var timezone = function()
    {
	var tz = new Date().getTimezoneOffset()/60;
	if(tz < 0){ if(tz <= -10) return "+"+(-tz) + ":00"; else return "+0"+(-tz)+":00"; }else{ if(tz >= 10) return "-"+tz + ":00"; else return "-0"+tz+":00"; }
    };

    var logger = {};
    logger['i'] = function(input){ 
	log(input);
    };
    logger['d'] = function(input){ 
	log(input);
    };
    logger['v'] = function(input){ 
	//log(input);
    };
    logger['e'] = function(input){ 
	log(input);
    };
    logger['w'] = function(input){ 
	log(input);
    };
    
    // load up the redis configuration and the domain details
    var domains = process.env.DOMAIN;
    var array_remove = function(array, from, to) 
    {
	var rest = array.slice((to || from) + 1 || array.length);
	array.length = from < 0 ? array.length + from : from;
	return array.push.apply(array, rest);
    };
    
    var express = require('express');
    var app = express();

    app.configure(function(){
	app.use(express.bodyParser());
	app.use(express.logger());
    });

    // redirect the home page to manage
    app.get('/', function(request, response){
	response.redirect('http://getcouple.com/');
    });

    var pg = require('pg');
    //if("native" in pg) pg = pg.native;
    pg.defaults.poolSize = 50;

    // login
    var login_handler = require("./login.js").handler();
    login_handler.config(pg);
    app.post('/login', login_handler.process);

    // signup
    var signup_handler = require("./signup.js").handler();
    signup_handler.config(pg);
    app.post('/signup', signup_handler.process);

    // link
    var link_handler = require("./link.js").handler();
    link_handler.config(pg);
    app.post('/partner/request', link_handler.request);
    app.post('/partner/cancelrequest', link_handler.cancel);
    app.post('/partner/status', link_handler.status);
    app.post('/partner/decline', link_handler.decline);
    app.post('/partner/accept', link_handler.accept);
    app.post('/partner/breakup', link_handler.breakup);

    // start
    var start_handler = require("./start.js").handler();
    start_handler.config(pg);
    app.post('/start', start_handler.process);

    // and listen
    var port = process.env.PORT || 5000;
    app.listen(port, function(){
	//console.log("Listening on " + port);
    });

    // switch user/group after 5 seconds (plenty of time for the system to come up right and for us to bind to whatever ports are necessary)
    var user = false, group = false;
    var i, j = process.argv.length;
    if(j <= 2) return;
    for(i=2;i<j;i++){
        if(process.argv[i] == '--user' && j > i+1){
	    ++i;
	    user = process.argv[i];
        }else if(process.argv[i] == '--group' && j > i+1){
	    ++i;
	    group = process.argv[i];
	}
    }

    if(group || user){
	setTimeout(function(){
	    if(group){ console.log("Switching group to ["+group+"]"); process.setgid(group); }
	    if(user){ console.log("Switching user to ["+user+"]"); process.setuid(user); }
	}, 5000);
    }
}());
