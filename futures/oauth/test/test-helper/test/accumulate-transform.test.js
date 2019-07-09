/// <reference path="../../../typings/node/node.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />
/// <reference path="../../../typings/chai/chai.d.ts" />

'use strict';

var path = require('path');
var echo = require('../echo-chunks');
var helper = require('../../test-helper');
var gateway = require('../../../gateway/lib/gateway');
var config = helper.config();

var chai = require('chai');
var should = chai.should();
var request = require('supertest');

var reference1 =
  '<message>\n' +
  ' <delay>100</delay>\n' +
  ' <times>1</times>\n' +
  '\n' +
  ' <chunk>1</chunk>\n' +
  ' <headers>\n' +
  '  <accept-encoding>gzip, deflate</accept-encoding>\n' +
  '  <user-agent>node-superagent/1.3.0</user-agent>\n' +
  '  <connection>close</connection>\n' +
  ' </headers>\n' +
  '</message>\n';

var reference1_uppercase =
  '<MESSAGE>\n' +
  ' <DELAY>100</DELAY>\n' +
  ' <TIMES>1</TIMES>\n' +
  '\n' +
  ' <CHUNK>1</CHUNK>\n' +
  ' <HEADERS>\n' +
  '  <ACCEPT-ENCODING>GZIP, DEFLATE</ACCEPT-ENCODING>\n' +
  '  <USER-AGENT>NODE-SUPERAGENT/1.3.0</USER-AGENT>\n' +
  '  <CONNECTION>CLOSE</CONNECTION>\n' +
  ' </HEADERS>\n' +
  '</MESSAGE>\n';

var reference2 =
  '<message>\n' +
  ' <delay>100</delay>\n' +
  ' <times>1</times>\n' +
  '\n' +
  ' <chunk>1</chunk>\n' +
  ' <headers>\n' +
  '  <accept-encoding>gzip, deflate</accept-encoding>\n' +
  '  <user-agent>node-superagent/1.3.0</user-agent>\n' +
  '  <content-type>text/xml</content-type>\n' +
  '  <connection>close</connection>\n' +
  '  <content-length>234</content-length>\n' +
  ' </headers>\n' +
  ' <body>\n' +
  reference1 +
  ' </body>\n' +
  '</message>\n';

var reference2_uppercase =
  '<MESSAGE>\n' +
  ' <DELAY>100</DELAY>\n' +
  ' <TIMES>1</TIMES>\n' +
  '\n' +
  ' <CHUNK>1</CHUNK>\n' +
  ' <HEADERS>\n' +
  '  <ACCEPT-ENCODING>GZIP, DEFLATE</ACCEPT-ENCODING>\n' +
  '  <USER-AGENT>NODE-SUPERAGENT/1.3.0</USER-AGENT>\n' +
  '  <CONTENT-TYPE>TEXT/XML</CONTENT-TYPE>\n' +
  '  <CONNECTION>CLOSE</CONNECTION>\n' +
  '  <CONTENT-LENGTH>234</CONTENT-LENGTH>\n' +
  ' </HEADERS>\n' +
  ' <BODY>\n' +
  reference1_uppercase +
  ' </BODY>\n' +
  '</MESSAGE>\n';

  var reference2_uppercase_chunked =
  '<MESSAGE>\n' +
  ' <DELAY>100</DELAY>\n' +
  ' <TIMES>1</TIMES>\n' +
  '\n' +
  ' <CHUNK>1</CHUNK>\n' +
  ' <HEADERS>\n' +
  '  <ACCEPT-ENCODING>GZIP, DEFLATE</ACCEPT-ENCODING>\n' +
  '  <USER-AGENT>NODE-SUPERAGENT/1.3.0</USER-AGENT>\n' +
  '  <CONTENT-TYPE>TEXT/XML</CONTENT-TYPE>\n' +
  '  <CONNECTION>CLOSE</CONNECTION>\n' +
  '  <TRANSFER-ENCODING>CHUNKED</TRANSFER-ENCODING>\n' +
  ' </HEADERS>\n' +
  ' <BODY>\n' +
  reference1_uppercase +
  ' </BODY>\n' +
  '</MESSAGE>\n';

// replace Apigee Volos implementations with Memory versions
var replaceVolosApigeeWithMemory = function(gateway, impl) {
  var base = path.join(process.cwd(), impl, 'node_modules');
  var apigee = require(path.join(base, 'volos-' + impl + '-apigee'));
  var memory = require(path.join(base, 'volos-' + impl + '-memory'));
  Object.keys(apigee).forEach(function(key) {
    apigee[key] = memory[key];
  });
}
replaceVolosApigeeWithMemory(gateway, 'analytics');

describe('transformation tests', function() {

  var url = '/hello?delay=100&times=1';
  var echoServer;

  before(function(done) {
    echo.start(function(err, es) {
      if (err) return done(err);
      echoServer = es;
      done();
    });
  });

  after(function() {
    echo.stop();
  });

  describe('response', function() {

    describe('just accumulate', function() {

      var gatewayServer;
      var proxy;

      before(function(done) {
        config.edgemicro.plugins.sequence = ['accumulate-response'];
        helper.startServersWithTarget(config, echoServer, function(err, s) {
          if (err) { return done(err); }
          gatewayServer = s;
          proxy = gatewayServer.proxy;
          done();
        });
      });

      after(function() {
        gateway.stop();
      });

      it('accumulate', function(done) {
        request(proxy)
          .get(url)
          .expect(200)
          .end(function(err, res) {
            if (err) { return done(err); }
            res.should.have.property('text').that.is.a.String;
            res.text.length.should.be.above(0);
            res.text.should.equal(reference1);
            done();
          });
      });
    });

    describe('just transform', function() {

      var gatewayServer;
      var proxy;

      before(function(done) {
        config.edgemicro.plugins.sequence = ['transform-uppercase'];
        helper.startServersWithTarget(config, echoServer, function(err, s) {
          if (err) { return done(err); }
          gatewayServer = s;
          proxy = gatewayServer.proxy;
          done();
        });
      });

      after(function() {
        gateway.stop();
      });

      it('transform', function(done) {
        request(proxy)
          .get(url)
          .expect(200)
          .end(function(err, res) {
            if (err) { return done(err); }
            res.should.have.property('text').that.is.a.String;
            res.text.length.should.be.above(0);
            res.text.should.equal(reference1_uppercase);
            done();
          });
      });
    });

    describe('accumulate then transform', function() {

      var gatewayServer;
      var proxy;

      before(function(done) {
        // sequnce is reversed for responses, these plugins modify responses
        config.edgemicro.plugins.sequence = ['transform-uppercase', 'accumulate-response'];
        helper.startServersWithTarget(config, echoServer, function(err, s) {
          if (err) { return done(err); }
          gatewayServer = s;
          proxy = gatewayServer.proxy;
          done();
        });
      });

      after(function() {
        gateway.stop();
      });

      it('accumulate-transform', function(done) {
        request(proxy)
          .get(url)
          .expect(200)
          .end(function(err, res) {
            if (err) { return done(err); }
            res.should.have.property('text').that.is.a.String;
            res.text.length.should.be.above(0);
            res.text.should.equal(reference1_uppercase);
            done();
          });
      });
    });

    describe('transform then accumulate', function() {

      var gatewayServer;
      var proxy;

      before(function(done) {
        // sequnce is reversed for responses, these plugins modify responses
        config.edgemicro.plugins.sequence = ['accumulate-response', 'transform-uppercase'];
        helper.startServersWithTarget(config, echoServer, function(err, s) {
          if (err) { return done(err); }
          gatewayServer = s;
          proxy = gatewayServer.proxy;
          done();
        });
      });

      after(function() {
        gateway.stop();
      });

      it('transform-accumulate', function(done) {
        request(proxy)
          .get(url)
          .expect(200)
          .end(function(err, res) {
            if (err) { return done(err); }
            res.should.have.property('text').that.is.a.String;
            res.text.length.should.be.above(0);
            res.text.should.equal(reference1_uppercase);
            done();
          });
      });
    });
  });

  describe('request', function() {

    describe('just accumulate', function() {

      var gatewayServer;
      var proxy;

      before(function(done) {
        config.edgemicro.plugins.sequence = ['accumulate-request'];
        helper.startServersWithTarget(config, echoServer, function(err, s) {
          if (err) { return done(err); }
          gatewayServer = s;
          proxy = gatewayServer.proxy;
          done();
        });
      });

      after(function() {
        gateway.stop();
      });

      it('accumulate', function(done) {
        request(proxy)
          .post(url)
          .set('content-type', 'text/xml')
          .send(reference1)
          .expect(200)
          .end(function(err, res) {
            if (err) { return done(err); }
            res.should.have.property('text').that.is.a.String;
            res.text.length.should.be.above(0);
            res.text.should.equal(reference2);
            done();
          });
      });
    });

    describe('just transform', function() {

      var gatewayServer;
      var proxy;

      before(function(done) {
        config.edgemicro.plugins.sequence = ['transform-uppercase'];
        helper.startServersWithTarget(config, echoServer, function(err, s) {
          if (err) { return done(err); }
          gatewayServer = s;
          proxy = gatewayServer.proxy;
          done();
        });
      });

      after(function() {
        gateway.stop();
      });

      it('transform', function(done) {
        request(proxy)
          .post(url)
          .set('content-type', 'text/xml')
          .send(reference1)
          .expect(200)
          .end(function(err, res) {
            if (err) { return done(err); }
            res.should.have.property('text').that.is.a.String;
            res.text.length.should.be.above(0);
            res.text.should.equal(reference2_uppercase_chunked);
            done();
          });
      });
    });

    describe('accumulate then transform', function() {

      var gatewayServer;
      var proxy;

      before(function(done) {
        config.edgemicro.plugins.sequence = ['accumulate-request', 'transform-uppercase'];
        helper.startServersWithTarget(config, echoServer, function(err, s) {
          if (err) { return done(err); }
          gatewayServer = s;
          proxy = gatewayServer.proxy;
          done();
        });
      });

      after(function() {
        gateway.stop();
      });

      it('accumulate-transform', function(done) {
        request(proxy)
          .post(url)
          .set('content-type', 'text/xml')
          .send(reference1)
          .expect(200)
          .end(function(err, res) {
            if (err) { return done(err); }
            res.should.have.property('text').that.is.a.String;
            res.text.length.should.be.above(0);
            res.text.should.equal(reference2_uppercase);
            done();
          });
      });
    });

    describe('transform then accumulate', function() {

      var gatewayServer;
      var proxy;

      before(function(done) {
        config.edgemicro.plugins.sequence = ['transform-uppercase', 'accumulate-request'];
        helper.startServersWithTarget(config, echoServer, function(err, s) {
          if (err) { return done(err); }
          gatewayServer = s;
          proxy = gatewayServer.proxy;
          done();
        });
      });

      after(function() {
        gateway.stop();
      });

      it('transform-accumulate', function(done) {
        request(proxy)
          .post(url)
          .set('content-type', 'text/xml')
          .send(reference1)
          .expect(200)
          .end(function(err, res) {
            if (err) { return done(err); }
            res.should.have.property('text').that.is.a.String;
            res.text.length.should.be.above(0);
            res.text.should.equal(reference2_uppercase);
            done();
          });
      });
    });
  });

});
