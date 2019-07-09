'use strict';

//var debug = require('debug')('plugin:spikearrest');

module.exports.init = function(config /*, logger, stats */) {

  var spikearrest = require('volos-spikearrest-memory').create(config);
  var middleware = spikearrest.connectMiddleware().apply();

  return {

    onrequest: function(req, res, next) {
      middleware(req, res, next);
    }

  };

}
