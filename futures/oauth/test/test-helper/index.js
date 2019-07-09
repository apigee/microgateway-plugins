'use strict';

process.env.NODE_ENV = 'test';

var config = require('config');

var async = require('async');
var path = require('path');
var _ = require('lodash');
var debug = require('debug')('gateway:test');
var http = require('http');
var url = require('url');


var gateway = require('../../gateway/lib/gateway');


var chai = require('chai');
chai.config.includeStack = true;
chai.config.showDiff = true;

process.setMaxListeners(20); // avoid warning: possible EventEmitter memory leak detected.

config.edgemicro.plugins.dir = process.cwd();
module.exports.config = function() {
  config.uid = process.pid.toString();
  return _.cloneDeep(config);
};

// replace Apigee Volos implementations with Memory versions
var replaceVolosApigeeWithMemory = function(gateway, impl) {
  var base = path.join(process.cwd(), impl, 'node_modules');
  var apigee = require(path.join(base, 'volos-' + impl + '-apigee'));
  var memory = require(path.join(base, 'volos-' + impl + '-memory'));
  Object.keys(apigee).forEach(function(key) {
    apigee[key] = memory[key];
  });
}

var exposeTestProbes = function(gateway, impl) {
  Object.defineProperty(module.exports, impl, {
    enumerable: true,
    configurable: true,
    get: function() { return gateway.testprobe(impl) }
  });
}

var handler = function(req, res, proxy, body) {
  var response = {
    fromTarget: true,
    proxyName: proxy.name,
    body: body,
    url: req.url,
    headers: req.headers
  };
  debug('target sending:', response);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

module.exports.startServersWithTarget = function startServersWithTarget(config, target, cb) {
  async.map(config.proxies, function(proxy, cb) {
    var targetPort = target.address().port;
    proxy.url = 'http://127.0.0.1:' + targetPort;
    target.proxy = proxy;
    cb(null, target);
  }, function(err, targets) {
    if (err) { return cb(err); }
    startGateway(config, targets, cb);
  });
};

module.exports.startServers = function startServers(config, cb) {

  async.map(config.proxies, function(proxy, cb) {

    var target = http.createServer(function(req, res) {

      var buff;

      var reqUrl = url.parse(req.url, true);
      var delay = reqUrl.pathname.length > 1 ? +(reqUrl.pathname.substring(1)) : 0;

      // write body
      req.on('data', function(data) {
        if (data) {
          if (!buff) {
            buff = data;
          } else {
            buff = Buffer.concat([buff, data]);
          }
        }
      });

      req.on('end', function() {
        var body = buff ? buff.toString() : undefined;

        if (delay && typeof delay === 'number') {
          setTimeout(function() {
            handler(req, res, proxy, body);
          }, delay);
        } else {
          handler(req, res, proxy, body);
        }
      });
    });

    target.listen(function(err) {
      if (err) { return cb(err); }

      var targetPort = target.address().port;
      proxy.url = 'http://127.0.0.1:' + targetPort;
      target.proxy = proxy;
      cb(null, target);
    });

  }, function(err, targets) {
    if (err) { return cb(err); }
    startGateway(config, targets, cb);
  });
};

function startGateway(config, targets, cb) {
  replaceVolosApigeeWithMemory(gateway, 'analytics');

  config.edgemicro.port = 0; // to let gateway start on a port of its choosing

  gateway.start(config, function(err, server) {
    if (err) { return cb(err); }

    config.edgemicro.port = server.address().port; // save the gateway's listening port

    if (config.edgemicro.plugins.sequence) {
      config.edgemicro.plugins.sequence.forEach(function(plugin) {
        exposeTestProbes(gateway, plugin);
      });
    }

    var response = {
      gateway: gateway,
      proxy: server,
      targets: targets,
      close: function close() {
        gateway.stop();
        server.close();
        targets.forEach(function(target) {
          target.close();
        });
      }
    };

    cb(null, response);
  });
}
