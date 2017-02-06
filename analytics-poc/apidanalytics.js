const util = require('util')
const request = require('request');
const async = require('async');
const Analytics = require('volos-analytics-common');


var create = function(options) {
    var spi = new ApidAnalytics(options);
    this.apidUri = options.apidUri;
    this.formattedApidUriTemplate = this.apidUri +'/analytics/%s';
    return new Analytics(spi, options);
}
module.exports.create = create;

var ApidAnalytics = function(options) {

}

ApidAnalytics.prototype.flush = function(recordsQueue, flushCallback) {
    var recordsPerScope = {}
    var self = this;
    recordsQueue.forEach((r) => {
        if(r.scopeId) {
            if(recordsPerScope[r.scope]) {
                recordsPerScope[r.scopeId].push(r);
            } else {
                recordsPerScope = [r];
            }
            delete r.scopeId;
        }
    });

    var parallelArgs = {};
    Object.keys(recordsPerScope).forEach((k) => {
        var data = recordsPerScope[k];
        parallelArgs[k] = (callback) => {
            self.send(k, data, (err, scopeId, data) => {
              if(err) {
                return callback(err);
              } else {
                callback(null, data);
              }
            })
        }
    });

    async.parallel(parallelArgs, (err, results)=>{
      if(err) {
        return flushCallback(err)
      }

      Object.keys(results).forEach((scope)=> {
        const data = results[scope];
        const retryRecords = [];
        if(data.length) {
          data.forEach((d) => {
            d.scopeId = scope;
          });

          retryRecords = retryRecords.concat(data);
        }
      });

      return flushCallback(null, retryRecords)
    });
}

ApidAnalytics.prototype.send = function(scopeId, data, cb) {
    const formattedUri = util.format(this.formattedApidUriTemplate, scopeId);

    const opts = {
        uri: formattedUri,
        method: 'POST',
        headers: {},
        json: data
    };

    request(opts, (err, res) => {
        if(err) {
            return cb(err);
        }

        if(res.statusCode == 400) {
            return cb(null, scopeId, data)
        } else {
            return cb(null, scopeId, [])
        }
    });
};