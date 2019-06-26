/// <reference path="../../../typings/node/node.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />
/// <reference path="../../../typings/chai/chai.d.ts" />

'use strict';

var helper = require('../../test-helper');
var config = helper.config();

var chai = require('chai');
var should = chai.should();
var request = require('supertest');
var async = require('async');
var url = require('url');
var path = require('path');
var https = require('https');

describe('passthrough', function() {

  var servers, proxy;

  before(function(done) {
    config.edgemicro.plugins.sequence = []; // no plugins needed for this test
    helper.startServers(config, function(err, s) {
      if (err) { return done(err); }
      servers = s;
      proxy = servers.proxy;
      done();
    });
  });

  after(function() {
    servers.close();
  });

  describe('path', function() {

    it('root should invoke default target', function(done) {
      request(proxy)
        .get('/')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('microgateway_test');
          done();
        });
    });

    it('path match should invoke correct target', function(done) {
      request(proxy)
        .get('/microgateway_test2')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('microgateway_test2');
          done();
        });
    });

    it('path submatch should invoke correct target', function(done) {
      request(proxy)
        .get('/something/else')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('microgateway_test');
          done();
        });
    });

    it('most specific match should invoke correct target', function(done) {
      request(proxy)
        .get('/microgateway_test2/something/else')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('microgateway_test2');
          done();
        });
    });

    it('/boo should match proxy boo', function(done) {
      request(proxy)
        .get('/boo')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('boo');
          done();
        });
    });

    it('/boo1 should match proxy boo', function(done) {
      request(proxy)
        .get('/boo1')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('boo');
          done();
        });
    });

    it('/boo/bar should match proxy boo', function(done) {
      request(proxy)
        .get('/boo/bar')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('boo');
          done();
        });
    });

    it('/b should match proxy b', function(done) {
      request(proxy)
        .get('/b')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('b');
          done();
        });
    });

    it('/b2 should match proxy b', function(done) {
      request(proxy)
        .get('/b2')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('b');
          done();
        });
    });

    it('/b/bar/foo should match proxy b', function(done) {
      request(proxy)
        .get('/b/bar/foo')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.proxyName.should.eql('b');
          done();
        });
    });
  });

  describe('query params', function() {

    it('should pass through', function(done) {
      var pathname = '/foo';
      var search = '?id=42';
      var path = pathname + search;
      request(proxy)
        .get(path)
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.should.have.property('url').that.is.a.String;
          var reqUrl = url.parse(res.body.url);
          reqUrl.pathname.should.equal(pathname);
          reqUrl.path.should.equal(path);
          reqUrl.search.should.equal(search);
          done();
        });
    });

    it('missing should pass through', function(done) {
      var pathname = '/foo';
      request(proxy)
        .get(pathname)
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.should.have.property('url').that.is.a.String;
          var reqUrl = url.parse(res.body.url);
          reqUrl.pathname.should.equal(pathname);
          done();
        });
    });

    it('missing in sub path should pass through', function(done) {
      var pathname = '/foo/bar/42';
      request(proxy)
        .get(pathname)
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.should.have.property('url').that.is.a.String;
          var reqUrl = url.parse(res.body.url);
          reqUrl.pathname.should.equal(pathname);
          done();
        });
    });

    it('in sub path should pass through', function(done) {
      var pathname = '/foo/bar/42';
      var search = '?uid=MTQzNjIyMjgxOTUxNQ&pid=1234';
      var path = pathname + search;
      request(proxy)
        .get(path)
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.should.have.property('url').that.is.a.String;
          var reqUrl = url.parse(res.body.url);
          reqUrl.pathname.should.equal(pathname);
          reqUrl.path.should.equal(path);
          reqUrl.search.should.equal(search);
          done();
        });
    });
  });

  describe('body', function() {

    it('should pass through', function(done) {
      var data = JSON.stringify({ gotIt: true });
      request(proxy)
        .post('/foo')
        .send(data)
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.should.have.property('body').that.is.a.String;
          res.body.body.should.equal(data);
          done();
        });
    });

    it('should pass through if large', function(done) {
      var data = new Buffer(1024 * 65);
      data.fill('x');
      data = data.toString();
      request(proxy)
        .post('/foo')
        .send(data)
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.fromTarget.should.be.true;
          res.body.should.have.property('body').that.is.a.String;
          res.body.body.length.should.equal(data.length);
          res.body.body.should.equal(data);
          done();
        });
    });
  });

  describe('response headers', function() {

    var headers = ['x-response-time'];

    headers.forEach(function(header) {

      describe (header, function() {

        it('should exist when not configured', function(done) {

          config.headers = {};
          request(proxy)
            .get('/')
            .expect(200)
            .end(function(err, res) {
              if (err) { return done(err); }
              res.body.fromTarget.should.be.true;
              should.exist(res.headers['x-response-time']);
              done();
            });
        });

        it('should exist when true', function(done) {

          config.headers[header] = true;
          request(proxy)
            .get('/')
            .expect(200)
            .end(function(err, res) {
              if (err) { return done(err); }
              res.body.fromTarget.should.be.true;
              should.exist(res.headers['x-response-time']);
              done();
            });
        });

        it('should not exist when false', function(done) {

          config.headers = {};
          config.headers[header] = false;
          request(proxy)
            .get('/')
            .expect(200)
            .end(function(err, res) {
              if (err) { return done(err); }
              res.body.fromTarget.should.be.true;
              should.not.exist(res.headers['x-response-time']);
              done();
            });
        });
      });
    });
  });

  describe('target header', function() {

    var headers = ['x-forwarded-for', 'x-forwarded-host', 'x-request-id', 'via'];

    headers.forEach(function(header) {

      describe(header, function() {

        it('should exist when not configured', function(done) {

          config.headers = {};
          request(proxy)
            .get('/')
            .expect(200)
            .end(function(err, res) {
              if (err) { return done(err); }
              res.body.fromTarget.should.be.true;
              should.exist(res.body.headers[header]);
              done();
            });
        });

        it('should exist when true', function(done) {

          config.headers[header] = true;
          request(proxy)
            .get('/')
            .expect(200)
            .end(function(err, res) {
              if (err) { return done(err); }
              res.body.fromTarget.should.be.true;
              should.exist(res.body.headers[header]);
              done();
            });
        });

        it('should not exist when false', function(done) {

          config.headers = {};
          config.headers[header] = false;
          request(proxy)
            .get('/')
            .expect(200)
            .end(function(err, res) {
              if (err) { return done(err); }
              res.body.fromTarget.should.be.true;
              should.not.exist(res.body.headers[header]);
              done();
            });
        });
      });
    });
  });

  describe('existing target header', function() {

    var headers = ['x-forwarded-for', 'x-forwarded-host', 'via'];
    var headerValue = 'my header';

    headers.forEach(function(header) {

      describe(header, function() {

        config.headers = {};
        config.headers[header] = true;

        it('should include both headers', function(done) {

          config.headers[header] = true;
          request(proxy)
            .get('/')
            .set(header, headerValue)
            .expect(200)
            .end(function(err, res) {
              if (err) { return done(err); }
              res.body.fromTarget.should.be.true;
              should.exist(res.body.headers[header]);
              res.body.headers[header].should.match(new RegExp(headerValue + ',.+'));
              done();
            });
        });
      });
    });
  });

  describe('target down', function() {

    var proxy;

    before(function(done) {
      helper.startServers(config, function(err, servers) {
        if (err) { return done(err); }
        servers.targets.forEach(function(target) {
          target.close();
        });
        proxy = servers.proxy;
        done();
      });
    });

    after(function() {
      proxy.close();
    });

    it('should fail with 502 gateway error', function(done) {
      request(proxy)
        .get('/')
        .expect(502, done);
    });
  });

  describe('too many connections', function() {

    var servers, proxy;

    before(function(done) {
      config.edgemicro.max_connections = 1;

      helper.startServers(config, function(err, s) {
        if (err) { return done(err); }
        servers = s;
        proxy = servers.proxy;
        done();
      });
    });

    after(function() {
      servers.close();
    });

    it('should fail with 429 error', function(done) {

      async.parallel([
        function(next) { request(proxy).get('/100').end(function(err, res) { next(err, res) }) },
        function(next) { request(proxy).get('/100').end(function(err, res) { next(err, res) }) }
      ], function(err, res) {
        res[0].error.should.be.false;
        res[0].statusCode.should.equal(200);
        should.exist(res[1].error);
        res[1].statusCode.should.equal(429);
        done(err);
      });
    });
  });

  describe('SSL-termination verification', function() {
    var servers, proxy;

    /**
     * To generate certificates, make sure you have openssl installed
     * run the following:
     * openssl genrsa -out key.pem 2048
     * openssl req -new -key key.pem -out csr.pem
     * openssl req -x509 -days 365 -key key.pem -in csr.pem -out certificate.pem
     *
     * To view the certificate information, run this command:
     * openssl x509 -in certificate.pem -noout -text
     */
    before(function(done) {
      config.edgemicro['ssl'] = {
        cert: path.join(__dirname, 'certificate.pem'),
        key: path.join(__dirname, 'key.pem')
      }

      helper.startServers(config, function(err, s) {
        if (err) { return done(err); }
        servers = s;
        proxy = servers.proxy;
        done();
      });
    });

    it('proxy should be SSL-terminated', function(done) {
      https.request({
        port: config.edgemicro.port,
        ca: proxy.cert
      }, function(res) {
        res.statusCode.should.equal(200);
        done();
      }).end();
    });

    after(function() {
      servers.close();
    });
  });
});
