'use strict';

/**
 * This plugin accumulates data chunks from the target into an array
 * property on the response, concats them on end and delivers the entire
 * accumulated response data as one big chunk to the next plugin in the
 * sequence. Since this plugin operates on responses, which are applied
 * in reverse order, it should be the last plugin in the sequence so
 * that subsequent plugins receive the accumulated response data.
 *
 * Users should be aware that buffering large requests or responses in
 * memory can cause Apigee Edge Microgateway to run out of memory under
 * high load or with a large number of concurrent requests. So this plugin
 * should only be used when it is known that request/response bodies are small.
 */
module.exports.init = function(/*config, logger, stats*/) {

  function accumulate(res, data) {
    if (!res._chunks) res._chunks = [];
    res._chunks.push(data);
  }

  return {

    ondata_response: function(req, res, data, next) {
      if (data && data.length > 0) accumulate(res, data);
      next(null, null);
    },

    onend_response: function(req, res, data, next) {
      if (data && data.length > 0) accumulate(res, data);
      var content = null;
      if(res._chunks && res._chunks.length) {
        content = Buffer.concat(res._chunks);
      }
      delete res._chunks;
      next(null, content);
    }

  };

}
