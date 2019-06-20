'use strict';

var toobusy = require('toobusy-js');
var debug = require('debug')('gateway:healthcheck');
var portastic = require('portastic')

const HEALTHCHECK_URL = '/healthcheck';

module.exports.init = function(config, logger, stats) {
  return {
   onrequest: function(req, res, next) {
     var healthcheck_url = config['healthcheck_url'] ||  HEALTHCHECK_URL
      if(healthcheck_url == req.url) {
        var statusCode = (toobusy() ? 503 : 200)
        debug(statusCode)
        var healthInfo = {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          uptime: process.uptime(),
          pid: process.pid
        }
        //Check for cloud foundry healthcheck
        if(req.targetPort != '' && process.env.EDGEMICRO_DECORATOR){
          var port = req.targetPort
          portastic.test(port)
          .then(function(isOpen){
            if (isOpen){
              statusCode = 500
              var errorDescription = 'Application is not running on specified application port: ' + port
              healthInfo.decoratorError = errorDescription
              debug(errorDescription)
              debug(statusCode)
            }
            res.writeHead(statusCode, { 'Content-Type': 'application/json' })
            res.write(JSON.stringify(healthInfo))
            res.end()
          });
        }
        else{
          res.writeHead(statusCode, { 'Content-Type': 'application/json' })
          res.write(JSON.stringify(healthInfo))
          res.end()
        }
      }
      else {
        next()
      }
    }
  }
}
