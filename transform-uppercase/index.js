'use strict';

/**
 * This plugin transforms content. Since this transformation (uppercase) is
 * trivial, it can do the transformation on a chunk-by-chunk basis or all-at-once.
 * For most non-trivial cases, this plugin should be preceded by the accumulate
 * plugin, which will accumulate chunks and deliver them concatenated as one data
 * Buffer to the onend handler.
 */
module.exports.init = function(/* config, logger, stats */) {

  // perform content transformation here
  // the result of the transformation must be another Buffer
  function transform(data) {
    return new Buffer(data.toString().toUpperCase());
  }

  return {

    ondata_response: function(req, res, data, next) {
      // transform each chunk as it is received
      next(null, data ? transform(data) : null);
    },

    onend_response: function(req, res, data, next) {
      // transform accumulated data, if any
      next(null, data ? transform(data) : null);
    },

    ondata_request: function(req, res, data, next) {
      // transform each chunk as it is received
      next(null, data ? transform(data) : null);
    },

    onend_request: function(req, res, data, next) {
      // transform accumulated data, if any
      next(null, data ? transform(data) : null);
    }

  };

}
