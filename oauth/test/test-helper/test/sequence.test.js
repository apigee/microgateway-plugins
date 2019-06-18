/// <reference path="../../../typings/node/node.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />
/// <reference path="../../../typings/chai/chai.d.ts" />

'use strict';

var helper = require('../../test-helper');
var config = helper.config();

var chai = require('chai');
var should = chai.should();
var request = require('supertest');

describe('sequence', function() {

  describe('in order', function() {

    var servers, proxy;

    before(function(done) {
      config.edgemicro.plugins.sequence = ['test-one', 'test-two'];
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

    it('response', function(done) {
      request(proxy)
        .post('/')
        .set('content-type', 'application/json')
        .send(JSON.stringify({}))
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.should.have.property('body').that.is.a.String;
          var body = JSON.parse(res.body.body);
          body.sequence_request.should.be.an.Array;
          body.sequence_request.length.should.equal(2);
          body.sequence_request.should.deep.equal(['one', 'two']);

          res.body.should.have.property('sequence_response').that.is.an.Array;
          res.body.sequence_response.length.should.equal(2);
          res.body.sequence_response.should.deep.equal(['two', 'one']);
          done();
        });
    });
  });

  describe('reversed', function() {

    var servers, proxy;

    before(function(done) {
      config.edgemicro.plugins.sequence = ['test-two', 'test-one'];
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

    it('response', function(done) {
      request(proxy)
        .post('/')
        .set('content-type', 'application/json')
        .send(JSON.stringify({}))
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.should.have.property('body').that.is.a.String;
          var body = JSON.parse(res.body.body);
          body.sequence_request.should.be.an.Array;
          body.sequence_request.length.should.equal(2);
          body.sequence_request.should.deep.equal(['two', 'one']);

          res.body.should.have.property('sequence_response').that.is.an.Array;
          res.body.sequence_response.length.should.equal(2);
          res.body.sequence_response.should.deep.equal(['one', 'two']);
          done();
        });
    });
  });

  describe('in order sandboxed', function() {

    var servers, proxy;

    before(function(done) {
      config.edgemicro.plugins.sandbox = true;
      config.edgemicro.plugins.sequence = ['test-one', 'test-two'];
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

    it('response', function(done) {
      request(proxy)
        .post('/')
        .set('content-type', 'application/json')
        .send(JSON.stringify({}))
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.should.have.property('body').that.is.a.String;
          var body = JSON.parse(res.body.body);
          body.sequence_request.should.be.an.Array;
          body.sequence_request.length.should.equal(2);
          body.sequence_request.should.deep.equal(['one', 'two']);

          res.body.should.have.property('sequence_response').that.is.an.Array;
          res.body.sequence_response.length.should.equal(2);
          res.body.sequence_response.should.deep.equal(['two', 'one']);
          done();
        });
    });
  });

  describe('reversed sandboxed', function() {

    var servers, proxy;

    before(function(done) {
      config.edgemicro.plugins.sandbox = true;
      config.edgemicro.plugins.sequence = ['test-two', 'test-one'];
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

    it('response', function(done) {
      request(proxy)
        .post('/')
        .set('content-type', 'application/json')
        .send(JSON.stringify({}))
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          res.body.should.have.property('body').that.is.a.String;
          var body = JSON.parse(res.body.body);
          body.sequence_request.should.be.an.Array;
          body.sequence_request.length.should.equal(2);
          body.sequence_request.should.deep.equal(['two', 'one']);

          res.body.should.have.property('sequence_response').that.is.an.Array;
          res.body.sequence_response.length.should.equal(2);
          res.body.sequence_response.should.deep.equal(['one', 'two']);
          done();
        });
    });
  });

});
