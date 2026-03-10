'use strict';
/**
 * This plugin whitelists or blacklists source ip addresses
 */

var debug = require('debug')('plugin:accesscontrol');
var util = require("util");
const dns = require('dns');

module.exports.init = function (config , logger, stats) {

	if ( !config) debug('WARNING: insufficient information to run accesscontrol');
	else if ( !config.allow && !config.deny ) debug('WARNING: insufficient information to run accesscontrol');
	
	const validAllowDenyOrder = Object.keys(config ||  {}).filter( key => Array.isArray(config[key]) && ( key === 'allow' || key === 'deny' ) );
	const LOG_TAG_COMP = 'accesscontrol';

	/**
	* If no rules match then check use noRuleMatchAction value.
	*/ 
	function applyNoRuleMatch(res, req, next) {
		if ( config && config.noRuleMatchAction === "deny") {
			return sendError(res, req, null, next);	
		}
		next();
	}

	
	/**
	* check if the parameter is valid IPv4 address
	*/ 
	function checkIsIPV4(entry) {
	  var blocks = entry.split(".");
	  if(blocks.length === 4) {
	    return blocks.every(function(block) {
	      	return (block === '*' || (parseInt(block,10) >=0 && parseInt(block,10) <= 255));
	    });
	  }
	  return false;
	}

	/** 
	* for each list in the allow and deny, make sure they are proper
	* IPv4 addresses
	*/
	/*   never used
	function validateIPList(list) {
		list.forEach(function(entry){
			if (!checkIsIPV4(entry)) return false;
		});
		return true;
	}
	*/

	/** 
	* Check if the sourceIP is present in allow or deny in config defined order.
	* If matched in allow then accept the request and if matched deny then reject the request.
	*/
	function processActionFlow(sourceIP, res, req, next){
		debug ("source ip " + sourceIP);
		let isRuleMatched = validAllowDenyOrder.some( action => {
			debug ('Checking in '+ action +' list: ' + util.inspect(config[action], 2, true));
			if ( scanIP(config[action], sourceIP) ) {
				if ( action === 'allow' ) {
					next();
				}
				else if ( action === 'deny' ) {
					sendError(res, req,  null, next);	
				}
				return true;
			}			
		});
	
		if ( !isRuleMatched ) {
			debug ('no rule matched');
			applyNoRuleMatch(res, req, next);
		}
	}

	function scanIP(list, sourceIP) {
		
		var sourceOctets = sourceIP.split('.');	
		//no wildcard
		for (var i=0; i < list.length; i++) {
			//no wildcard
			if (list[i].indexOf('*') === -1 && list[i] === sourceIP) {
				return true;
			} else if (list[i].indexOf('*') !==  -1) { //contains wildcard
				var listOctets = list[i].split('.');
				if (octetCompare(listOctets, sourceOctets)) return true;			
			}
		}
		//did not match any in the list
		return false;
	}

	/**
	* the allow or deny list contains a wildcard. perform octet level
	* comparision
	*/
	function octetCompare (listOctets, sourceOctets) {
		var compare = false;
		for (var i=0; i < listOctets.length; i++) {
			//debug('list ' + listOctets[i] + ' sourceOctets ' + sourceOctets[i]);
			if (listOctets[i] !==  '*' && parseInt(listOctets[i]) === parseInt(sourceOctets[i])) {
				compare = true;
			} else if (listOctets[i] !==  '*' && parseInt(listOctets[i]) !==  parseInt(sourceOctets[i])) {
				return false;
			} 
		}
		return compare;
	}

	/** 
	* send error message to the user
	*/
	function sendError(res,req,err=null,next) {
		var errorInfo = {
			"code": 403,
			"message": "Forbidden"
		};
		if ( res ) {
			res.statusCode = errorInfo.code;
		}
		debug('access control failure')
		const errout = Error('access control failure',err);
		logger.eventLog({level:'error', req:req, res:res, err:errout, component:LOG_TAG_COMP }, 'sourceIP not allowed');

		if ( res && !res.finished ) {
			try {
				res.setHeader('content-type', 'application/json');
			} catch (e) {
				logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, "accesscontrol response object lacks setHeader");
			}
		}

		try {
			res.end(JSON.stringify(errorInfo));
		} catch (e) {
			logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, "accesscontrol response object is not supplied by runtime");
		}

		try {
			stats.incrementStatusCount(res.statusCode);
		} catch (e) {
			logger.eventLog({level:'warn', req:req, res:res, err:e, component:LOG_TAG_COMP }, "accesscontrol stats object is not supplied by runtime");
		}
		next(errorInfo.code,errorInfo.message);
	}

	return {

		onrequest: function(req, res, next) {
			debug('plugin onrequest');
			if(!config || (!config.allow && !config.deny) ){
				return applyNoRuleMatch(res, req, next);
			}
			if ( !req.headers.host ) {
				return sendError(res, req, new Error('request headers does not contain host'), next);
			}
			let sourceIP = req.headers.host.split(":");
			if (checkIsIPV4(sourceIP[0])) {
				processActionFlow(sourceIP[0], res, req, next);
			} else {
				dns.lookup(sourceIP[0], { family: 4 }, (err, address, family) => {
				  debug('address: %j family: IPv%s', address, family);
				  if (err) {
				  	debug(err);
				  	return sendError(res, req, err, next);
				  }
				  processActionFlow(address, res, req, next);		  
				});
			}
		}		
	};
}