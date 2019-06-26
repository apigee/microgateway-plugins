'use strict';

var debug = require('debug')('plugin:header-clean');
const headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/g

// strips bad characters from header values
module.exports.init = function(/*config, logger, stats*/) {
  return {
    onrequest: function(req, res, next) {
      Object.keys(req.headers).forEach(function(key) {      
        var val = req.headers[key]
        if (typeof val === 'string') {
          var newVal = val.replace(headerCharRegex, '')
          if (debug.enabled && val.match(headerCharRegex)) {              
              debug('Cleaned header %s. Old: %s. New: %s', key, val, newVal);
          }
          req.headers[key] = newVal
        }
      });
      next();
    },
  };
}