'use strict';
/**
 * This plugin integrate with Eureka and gets the target
 * endpoint dynamically. 
 */

var debug = require('debug')('plugin:eurekeclient');
var util = require('util');
var os = require('os');

const port = process.env.PORT || 8000;
const Eureka = require('eureka-js-client').Eureka;

module.exports.init = function (config, logger, stats) {

  const lookup = config.servicemap;
  
  config.instance.hostName = os.hostname();
  debug('local hostName: ' + config.instance.hostName);
  config.instance.ipAddr = getIPAddr();
  config.instance.port = {};
  config.instance.port["$"] = port;
  config.instance.port["@enabled"] = true;
  config.instance.dataCenterInfo["@class"] = "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo";

  const client = new Eureka(config);

  try {
    client.start();  
  } catch (err) {
    console.error(err);
    client.stop();
  }

  function getIPAddr() {
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    debug ('localhost ip: ' + addresses[0]);
    return addresses[0];  
  }

  function getAppName(url) {
    for (var index in config.lookup) {
      if (url.includes(config.lookup[index].uri) || url == config.lookup[index].uri) {
        return {
                  app: config.lookup[index].app,
                  secure: config.lookup[index].secure
               };
      }
    }
    return "";
  }

  function getTarget(app, secure) {
    var instances = client.getInstancesByAppId(app);

    for (var index in instances) {
      if (instances[index].status == "UP") {
        return (secure == true) ? {"hostName": instances[index].hostName, "port": instances[index].securePort["$"]} : {"hostName": instances[index].hostName, "port":instances[index].port["$"]};
      }
    }
    return "";
  }

  return {
    onrequest: function(req, res, next) {
      var appInfo = getAppName(req.url);
      var endpoint = getTarget(appInfo.app, appInfo.secure);

      if (endpoint.hostName) {
        debug("target hostname: " + endpoint.hostName);
        req.targetHostname = endpoint.hostName;
        debug("target port: " + endpoint.port);
        req.targetPort = endpoint.port;
        req.targetPath = req.url;
        if (appInfo.secure) {
          req.targetSecure = true;
        } else {
          req.targetSecure = false;
        }        
      } else {
        console.warn("Target endpoint from Eureka not found");
      }
      next();
    }   
  };
}
