'use strict';

/**
 * This plugin accumulates data chunks from the client into an array
 * property on the request, concats them on end and delivers the entire
 * accumulated request data as one big chunk to the next plugin in the
 * sequence. Since this plugin operates on requests, it should be the
 * first plugin in the sequence so that subsequent plugins receive the
 * accumulated request data.
 *
 * Users should be aware that buffering large requests or responses in
 * memory can cause Apigee Edge Microgateway to run out of memory under
 * high load or with a large number of concurrent requests. So this plugin
 * should only be used when it is known that request/response bodies are small.
 */
module.exports.init = function(/*config, logger, stats*/) {
  function accumulate(req, data) {
    if (!req._chunks) req._chunks = [];
    req._chunks.push(data);
  }

  return {

    ondata_request: function(req, res, data, next) {
      if (data && data.length > 0) accumulate(req, data);
      next(null, null);
    },

    onend_request: function(req, res, data, next) {
      if (data && data.length > 0) accumulate(req, data);
      var content = null;
      if (req._chunks && req._chunks.length) {
        content = Buffer.concat(req._chunks);
      }
      delete req._chunks;
      next(null, content);
    }
  };

}
