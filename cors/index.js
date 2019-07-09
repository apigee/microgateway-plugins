'use strict'
var debug = require('debug')('plugin:cors');

module.exports.init = function(config /*, logger, stats */) {

  var methods = config['cors-methods'] || 'GET, PUT, POST, DELETE, PATCH, OPTIONS';
  var maxAge = config['cors-max-age'] || '3628800';
  var allowHeaders = config['cors-headers'] || 'Origin, x-requested-with, Accept, Content-Type, Accept-Encoding, Accept-Language, Host, Pragma, Referrer, User-Agent, Cache-Control, Authorization, x-api-key';
  var origin = config['cors-origin'];

  return {
  	onrequest: function(req, res, next) {
      debug('settings cors headers');

      var accessControlAllowOriginValue;
      if (origin) accessControlAllowOriginValue = origin;
          else accessControlAllowOriginValue = req.headers['origin'];

	  if(req.method === 'OPTIONS') {
	    res.setHeader('Access-Control-Allow-Origin', accessControlAllowOriginValue);
	    res.setHeader('Access-Control-Allow-Methods', methods);
       	    res.setHeader('Access-Control-Allow-Max-Age', maxAge);
	    res.setHeader('Access-Control-Allow-Headers', allowHeaders);
	    res.end();
	  } else {
        res.setHeader('Access-Control-Allow-Origin', accessControlAllowOriginValue);
	    next();
	  }
    }
  }
}
