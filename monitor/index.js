'use strict';
/**
 *
 */

var debug = require('debug')('plugin:monitor');
var path = require("path");
const memoredpath = path.resolve(__dirname,'../../..')+'/cli/lib/memored';
var cache = require(memoredpath);
const lynx = require('lynx');

module.exports.init = function(config, logger, stats) {

    var host = config.host || 'localhost';
    var port = config.port || 8125;
    var key = config.Requestkey || 'mg';

    key = key + "." + os.hostname();
    debug('grafana: ' + host + ':' + port);

    const client = new lynx(host, port);

    client.gauge(key + '_cpu', 0);
    client.gauge(key + '_memory_rss', 0);
    client.gauge(key + '_memory_heapUsed', 0);

    var sc2xx = 'statusCode2xx';
    var sc3xx = 'statusCode3xx';
    var sc4xx = 'statusCode4xx';
    var sc5xx = 'statusCode5xx';
    var scNA =  'statusCodeNA';

    clearCache();

    function setGauge(statusCode) {
      var tmp = 0;
      if (statusCode >= 200 && statusCode < 300) { 
        cache.read(sc2xx, function(err, value) {
          if (value) {
            tmp = parseInt(value);
            tmp ++;
            cache.store(sc2xx, tmp.toString());
            client.gauge(key + '_'+sc2xx, tmp);
          } else {
            cache.store(sc2xx, '1');
            client.gauge(key + '_'+sc2xx, 1);
          }
          //debug('statusCode2xx ' + tmp);
        });
      } else if (statusCode >=300 && statusCode < 400) {
        cache.read(sc3xx, function(err, value) {
          if (value) {
            tmp = parseInt(value);
            tmp ++;
            cache.store(sc3xx, tmp.toString());
            client.gauge(key + '_'+sc3xx, tmp);
          } else {
            cache.store(sc3xx, 1);
            client.gauge(key + '_'+sc3xx, 1);
          }
          //debug('statusCode3xx ' + tmp);
        });
      } else if (statusCode >=400 && statusCode < 500) {
        cache.read(sc4xx, function(err, value) {
          if (value) {
            tmp = parseInt(value);
            tmp ++;
            cache.store(sc4xx, tmp.toString());
            client.gauge(key + '_'+sc4xx, tmp);
          } else {
            cache.store(sc4xx, 1);
            client.gauge(key + '_'+sc4xx, 1);
          }
          //debug('statusCode4xx ' + tmp);
        });
      } else if (statusCode >=500 && statusCode < 600) {
        cache.read(sc5xx, function(err, value) {
          if (value) {
            tmp = parseInt(value);
            tmp ++;
            cache.store(sc5xx, tmp.toString());
            client.gauge(key + '_'+sc5xx, tmp);
          } else {
            cache.store(sc5xx, 1);
            client.gauge(key + '_'+sc5xx, 1);
          }
          //debug('statusCode5xx ' + value);
        });
      } else {
        cache.read(scNA, function(err, value) {
          if (value) {
            cache.store(scNA, value ++);
            client.gauge(key + '_'+scNA, value);
          } else {
            cache.store(scNA, 1);
            client.gauge(key + '_'+scNA, 1);
          }
          //debug('statusCodeNA ' + tmp);
        });
      }
    }
    
    function clearCache() {
      cache.store(sc2xx,'1');client.gauge(key + '_'+sc2xx, 0);
      cache.store(sc3xx,'0');client.gauge(key + '_'+sc3xx, 0);
      cache.store(sc4xx,'0');client.gauge(key + '_'+sc4xx, 0);
      cache.store(sc5xx,'0');client.gauge(key + '_'+sc5xx, 0);
      cache.store(scNA,'0');client.gauge(key + '_'+scNA, 0);    
      setTimeout(clearCache, 30000);
    }

    function sendEvent(statusCode) {
       setGauge(statusCode);
       //CPU and Memory
       client.gauge(key + '_cpu', process.cpuUsage().user);
       client.gauge(key + '_memory_rss', process.memoryUsage().rss);
       client.gauge(key + '_memory_heapUsed', process.memoryUsage().heapUsed);
    }

    return {
        onrequest: function(req, res, next) {
            debug('plugin onrequest');
            next();
        },
        onerror_request: function(req, res, data, next) {
            debug('plugin onerror');
            // Status Code
            var statusCode = res.statusCode || -1;
            sendEvent(statusCode);
            next();
        },
        onend_request: function(req, res, data, next) {
            debug('plugin onend_request');
            next();
        },
        onend_response: function(req, res, data, next) {
            debug('plugin onend_response');
            // Status Code
            var statusCode = res.statusCode || -1;
            sendEvent(statusCode);
            next();
        }
    };
}
