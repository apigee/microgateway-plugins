'use strict';
/**
 * This plugin whitelists or blacklists source ip addresses
 */

var debug = require('debug')('plugin:accesscontrol');
var util = require("util");
const dns = require('dns');

module.exports.init = function (config /*, logger, stats */) {

	var allow;
	var deny;

	/**
	* This method reads allow and/or deby lists from the config.yaml
	* applies the appropriate rule on the incoming message
	*/
	function checkAccessControlInfo(sourceIP) {
		if (config === null) debug('WARNING: insufficient information to run accesscontrol');
		else if (config.allow === null && config.deny === null) debug('WARNING: insufficient information to run accesscontrol');		
		else if (config.allow !==  null) {
			debug ('allow list: ' + util.inspect(config.allow, 2, true));
			if (scanIP(config.allow, sourceIP)) {
				allow = true;
			}			
		}
		else if (config.deny !==  null) {
			debug ('deny list: ' + util.inspect(config.deny, 2, true));
			if (scanIP(config.deny, sourceIP)) {
				debug ('deny incoming message');
				deny = true;
			}			
		}
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
	function sendError(res) {
		var errorInfo = {
			"code": "403",
			"message": "Forbidden"
		};
		res.writeHead(403, { 'Content-Type': 'application/json' });
		res.write(JSON.stringify(errorInfo));
		res.end();
	}

	return {

		onrequest: function(req, res, next) {
			debug('plugin onrequest');
			var host = req.headers.host;
			debug ("source ip " + host);
			var sourceIP = host.split(":");

			if (checkIsIPV4(sourceIP[0])) {
				checkAccessControlInfo(sourceIP[0]);
				if (allow === false || deny === true)
					sendError(res);
			} else {
				dns.lookup(sourceIP[0], (err, address, family) => {
				  debug('address: %j family: IPv%s', address, family);
				  if (err) {
				  	debug(err);
				  	sendError(res);
				  }
				  checkAccessControlInfo(address);
				  if (allow === false || deny === true)
				  	sendError(res);				  
				});
			}
			next();
		}		
	};
}