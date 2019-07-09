'use strict';

var debug = require('debug')('plugin:header-uppercase');

// required
module.exports.init = function(/*config, logger, stats*/) {

  var counter = 0;

  return {

    // indicates start of client request
    // request headers, url, query params, method should be available at this time
    // request processing stops (and a target request is not initiated) if
    // next is called with a truthy first argument (an instance of Error, for example)
    onrequest: function(req, res, next) {
      debug('plugin onrequest');
      req.headers['x-foo-request-id'] = counter++;
      req.headers['x-foo-request-start'] = Date.now();
      next();
    },

    // indicates start of target response
    // response headers and status code should be available at this time
    onresponse: function(req, res, next) {
      debug('plugin onresponse');
      res.setHeader('x-foo-response-id', req.headers['x-foo-request-id']);
      res.setHeader('x-foo-response-time', Date.now() - req.headers['x-foo-request-start']);
      next();
    },

    // chunk of request body data received from client
    // should return (potentially) transformed data for next plugin in chain
    // the returned value from the last plugin in the chain is written to the target
    ondata_request: function(req, res, data, next) {
      debug('plugin ondata_request ' + data.length);
      var transformed = data.toString().toUpperCase();
      next(null, transformed);
    },

    // chunk of response body data received from target
    // should return (potentially) transformed data for next plugin in chain
    // the returned value from the last plugin in the chain is written to the client
    ondata_response: function(req, res, data, next) {
      debug('plugin ondata_response ' + data.length);
      var transformed = data.toString().toUpperCase();
      next(null, transformed);
    },

    // indicates end of client request
    onend_request: function(req, res, data, next) {
      debug('plugin onend_request');
      next(null, data);
    },

    // indicates end of target response
    onend_response: function(req, res, data, next) {
      debug('plugin onend_response');
      next(null, data);
    },

    // error receiving client request
    onerror_request: function(req, res, err, next) {
      debug('plugin onerror_request ' + err);
      next();
    },

    // error receiving target response
    onerror_response: function(req, res, err, next) {
      debug('plugin onerror_response ' + err);
      next();
    },

    // indicates client connection closed
    onclose_request: function(req, res, next) {
      debug('plugin onclose_request');
      next();
    },

    // indicates target connection closed
    onclose_response: function(req, res, next) {
      debug('plugin onclose_response');
      next();
    }

  };

}
