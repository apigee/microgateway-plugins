

'use strict';

var helper = require('./test-helper');
var config = helper.config();

var debug = require('debug')('plugin:oauth:test');
var http = require('http');
var request = require('supertest');
var chai = require('chai');
var should = chai.should();
var pem = require('pem');
var jwt = require('jsonwebtoken');
var util = require('util');

chai.config.includeStack = true;
chai.config.showDiff = true;

describe('oauth', function() {

  var privateKey, publicKey;

  before(function(done) {
    var options = {
      selfSigned: true,
      days: 1
    };
    pem.createCertificate(options, function(err, keys) {
      if (err) { return done(err); }

      privateKey = keys.serviceKey;
      publicKey = keys.certificate;

      config.oauth.public_key = publicKey;
      config.oauth.allowNoAuthorization = false;
      config.oauth.allowInvalidAuthorization = false;

      done();
    });
  });

  var servers, proxy;

  before(function(done) {
    config.edgemicro.plugins.sequence = ['oauth'];
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


  describe('no authorization', function() {

    it('should fail when allowNoAuthorization is false', function(done) {

      config.oauth.allowNoAuthorization = false;
      config.oauth.allowInvalidAuthorization = false;
      request(proxy)
        .get('/')
        .expect(401)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.not.exist(res.body.fromTarget);
          done();
        });
    });

    it('should succeed when allowNoAuthorization is true', function(done) {

      config.oauth.allowNoAuthorization = true;
      config.oauth.allowInvalidAuthorization = false;
      request(proxy)
        .get('/')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.exist(res.body.fromTarget);
          should.not.exist(res.headers.authorization);

          should.not.exist(res.body.headers['authorization']);
          should.not.exist(res.body.headers['x-authorization-claims']);
          done();
        });
    });
  });

  describe('bad bearer token', function() {

    it('should fail with missing bearer token', function(done) {

      config.oauth.allowNoAuthorization = false;
      config.oauth.allowInvalidAuthorization = false;
      request(proxy)
        .get('/')
        .set('Authorization', 'Bearer')
        .expect(400)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.not.exist(res.body.fromTarget);
          done();
        });
    });

    it('should fail when allowInvalidAuthorization is false', function(done) {

      config.oauth.allowNoAuthorization = false;
      config.oauth.allowInvalidAuthorization = false;
      request(proxy)
        .get('/')
        .set('Authorization', 'Bearer BadBearerToken')
        .expect(401)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.not.exist(res.body.fromTarget);
          done();
        });
    });

    it('should succeed when allowInvalidAuthorization is true', function(done) {

      config.oauth.allowNoAuthorization = false;
      config.oauth.allowInvalidAuthorization = true;
      request(proxy)
        .get('/')
        .set('Authorization', 'Bearer BadBearerToken')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.exist(res.body.fromTarget);
          should.not.exist(res.headers.authorization);

          should.not.exist(res.body.headers['authorization']);
          should.not.exist(res.body.headers['x-authorization-claims']);
          done();
        });
    });
  });

  describe('good bearer token', function() {

    it('should succeed if valid proxy path', function(done) {

      var options = { algorithm: 'RS256' };
      var payload = {
        application_name: 'app',
        client_id: 'client',
        scopes: ['scope1'],
        api_product_list: [ 'Test' ],
        test: 'test'
      };
      var token = jwt.sign(payload, privateKey, options);

      config.oauth.allowNoAuthorization = false;
      config.oauth.allowInvalidAuthorization = false;
      request(proxy)
        .get('/')
        .set('Authorization', 'Bearer ' + token)
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.exist(res.body.fromTarget);
          should.not.exist(res.headers.authorization);

          should.not.exist(res.body.headers['authorization']);
          should.exist(res.body.headers['x-authorization-claims']);
          var claims = JSON.parse(new Buffer(res.body.headers['x-authorization-claims'], 'base64').toString());
          claims.should.have.keys('scopes', 'test');

          done();
        });
    });

    it('should fail if missing required proxy path', function(done) {

      var options = { algorithm: 'RS256' };
      var payload = { test: 'test' };
      var token = jwt.sign(payload, privateKey, options);

      config.oauth.allowNoAuthorization = false;
      config.oauth.allowInvalidAuthorization = false;
      request(proxy)
        .get('/')
        .set('Authorization', 'Bearer ' + token)
        .expect(403)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.not.exist(res.body.fromTarget);
          done();
        });
    });

    it('should fail if expired', function(done) {

      var options = { algorithm: 'RS256', expiresInSeconds: 1 };
      var payload = { test: 'test' };
      var token = jwt.sign(payload, privateKey, options);

      setTimeout(function() {

        config.oauth.allowNoAuthorization = false;
        config.oauth.allowInvalidAuthorization = false;

        request(proxy)
          .get('/')
          .set('Authorization', 'Bearer ' + token)
          .expect(403)
          .end(function(err, res) {
            if (err) { return done(err); }
            should.not.exist(res.body.fromTarget);
            done();
          });
      }, 1000);
    });
  });

  describe('configured auth header', function() {

    before(function() {
      config.oauth.allowNoAuthorization = false;
      config.oauth.allowInvalidAuthorization = false;
      config.oauth['authorization-header'] = 'x-proxy-auth';
    });

    after(function() {
      delete(config.oauth['authorization-header']);
    });

    it('should succeed if in configured header', function(done) {

      var options = { algorithm: 'RS256' };
      var payload = {
        application_name: 'app',
        client_id: 'client',
        scopes: ['scope1'],
        api_product_list: [ 'Test' ],
        test: 'test'
      };
      var token = jwt.sign(payload, privateKey, options);

      request(proxy)
        .get('/')
        .set('Authorization', 'Whatever')
        .set('x-proxy-auth', 'Bearer ' + token)
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.exist(res.body.fromTarget);
          should.not.exist(res.headers.authorization);

          should.exist(res.body.headers['authorization']);
          should.exist(res.body.headers['x-authorization-claims']);
          var claims = JSON.parse(new Buffer(res.body.headers['x-authorization-claims'], 'base64').toString());
          claims.should.have.keys('scopes', 'test');

          done();
        });
    });

    it('should fail if in default header', function(done) {

      var options = { algorithm: 'RS256' };
      var payload = {
        application_name: 'app',
        client_id: 'client',
        scopes: ['scope1'],
        api_product_list: [ 'Test' ],
        test: 'test'
      };
      var token = jwt.sign(payload, privateKey, options);

      request(proxy)
        .get('/')
        .set('Authorization', 'Bearer ' + token)
        .expect(401)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.not.exist(res.body.fromTarget);
          done();
        });

    });
  });

  describe('apikey', function() {

    var verifier;

    var apiKey = '6gClRCKp0UCOZ8o9Q5S7X88nI5hgizGQ';
    var jwtTokenForApiKey =
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhcHBsaWNhdGlvbl9uYW1lIjoiSkRzIEFwcCIsImNsaWVudF9pZCI6IjZnQ2xSQ0twMFV' +
      'DT1o4bzlRNVM3WDg4bkk1aGdpekdRIiwic2NvcGVzIjpbXSwiYXBpX3Byb2R1Y3RfbGlzdCI6WyJ0cmF2ZWwtYXBwIl0sImlhdCI6MTQ0NTU' +
      '1MjYxMH0.glQTK-Nh0YFYbWK-pr8nbJuIvt51p6zmLe53CbZ3JLEcG0QjHYcKmUPLPgDOGYfyjnYMUVMMfIDDZlhemy84fKQMGRptCgUfmga' +
      '9roLNPKPujhxFXb9GhkQ94KXxm8GChuvjYxn8K7K_nAhnzn4wB84rczvm91ytOwFPCeS_t6KbLS3uMrj6Nj1gITGeZVlm2QLAvUlJ5Abua0t' +
      'OItHj7_nvzHHwClgN9Is1UZ7LW5f747kVWp10t1JbAmubyTP-01TSbaniDGfBCmi0JYOizUFZiMjdSVcZP-tqWvHAsLdQ2T9k4sKG1I1pKcK' +
      'vh3dmS3j8PWhTHIV3FM1x7L5hig';
    var apiPublicKey =
      '-----BEGIN CERTIFICATE-----\n' +
      'MIICpDCCAYwCCQDd9JO8DIvnqTANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDEwls\n' +
      'b2NhbGhvc3QwHhcNMTUwNjI1MDMxNTQ5WhcNMTUwNjI2MDMxNTQ5WjAUMRIwEAYD\n' +
      'VQQDEwlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDY\n' +
      'O0JHvd1m/H/VyGmQpuqY/CvZGbx/wRWrLG/YErYl1w30e615hJOBpT1neavXONGw\n' +
      '2kuiqjRon8WcWvjrmKSDitul1MhUqddEBC+JhMfZpgCr9axcrFgRxm4JcfrhWoqE\n' +
      'LXAYLo/VXzNCCkGz4SLcp/azpnnPBeTm5m4AJBMW0YrznBQrVMJHGXXvd1b9q5Hp\n' +
      'Ejui9VdIEknhNJ88bjP3Lq7j0efCbkj0IAYNigdbC+eIMbRHVHNyEaioUAU9pYAp\n' +
      '2v1tomnwlQbEhD3vVnWJprKWgLGtYf9pmwrffwtDu73gyO/qr+aVNSNlchQ4fOag\n' +
      '3xeYKmAUHOl6QpiIocjzAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAG9B1kST84u0\n' +
      'yR5/CNqHO6wx2SiYKOfrhkvKbxsql/u59qxYd6jHPyE4adLkp/PPWz6DN4ucRT4J\n' +
      '2UULFD2biRvPK9Ua3J7IKLUMOuVnwU7JFCiAf51e0A9Weqh6L0+ATTkZMddUfKTA\n' +
      'uLdVOBz43EPCizKAjUP39+RFuUhBJazNrXyibE4fP/r6pJ7EB4a57HnvTlNkPZXA\n' +
      'z24Ihg42rqDXgFmNPE6X9p/pSOzA87iGLrOznbFQzTHJg/wLqmPEPVrjFwXWfzoI\n' +
      'CAysSvrNWbfqSIoxxWPpkK+O10m2DqYaQMu3J73p9kgD0gV9KBSW2rMFDg6JnI4G\n' +
      'BDvtgIzP58M=\n' +
      '-----END CERTIFICATE-----';

    before(function(done) {
      verifier = http.createServer(function(req, res) {
        var key = req.headers['x-dna-api-key'];
        if (key === apiKey) {
          res.statusCode = 200;
          res.end(jwtTokenForApiKey);
        } else {
          res.statusCode = 401;
          res.end();
        }
      });
      verifier.listen(function(err) {
        if (err) { return done(err); }
        config.oauth.verify_api_key_url = 'http://127.0.0.1:' + verifier.address().port;
        config.oauth.public_key = apiPublicKey;
        config.oauth.product_to_proxy = {};
        config.oauth.product_to_proxy['travel-app'] = ['microgateway_test'];
        done();
      });
    });

    after(function() {
      verifier.close();
    });

    it('in header', function(done) {
      request(proxy)
        .get('/')
        .set('x-api-key', apiKey)
        .expect(200)
        .end(function(err, res) {
          debug(res.body);
          if (err) { return done(err); }
          done();
        });
    });

    it('in custom header', function(done) {
      config.oauth['api-key-header'] = 'custom-api-key-header';
      request(proxy)
        .get('/')
        .set('custom-api-key-header', apiKey)
        .expect(200)
        .end(function(err, res) {
          debug(res.body);
          delete config.oauth['api-key-header'];
          if (err) { return done(err); }
          done();
        });
    });

    it('in url param', function(done) {
      request(proxy)
        .get('/?x-api-key=' + apiKey)
        .expect(200)
        .end(function(err, res) {
          debug(res.body);
          if (err) { return done(err); }
          done();
        });
    });

    it('in custom url param', function(done) {
      config.oauth['api-key-header'] = 'custom-api-key-header';
      request(proxy)
        .get('/?custom-api-key-header=' + apiKey)
        .expect(200)
        .end(function(err, res) {
          debug(res.body);
          delete config.oauth['api-key-header'];
          if (err) { return done(err); }
          done();
        });
    });

    it('in header (invalid)', function(done) {
      request(proxy)
        .get('/')
        .set('x-api-key', (apiKey + 'x'))
        .expect(403)
        .end(function(err, res) {
          debug(res.body);
          if (err) { return done(err); }
          done();
        });
    });

    it('in url (invalid)', function(done) {
      request(proxy)
        .get('/?x-api-key=' + (apiKey + 'x'))
        .expect(403)
        .end(function(err, res) {
          debug(res.body);
          if (err) { return done(err); }
          done();
        });
    });

    it('expiration', function(done) {
      config.oauth.public_key = publicKey;

      var payload = {};
      var options = { algorithm: 'RS256' };

      var savedToken = jwtTokenForApiKey;
      var decoded = jwt.decode(jwtTokenForApiKey);
      Object.keys(decoded).forEach(function(key) { payload[key] = decoded[key] });
      options.expiresIn = -1; // expired already
      jwtTokenForApiKey = jwt.sign(payload, privateKey, options);

      request(proxy)
        .get('/')
        .set('x-api-key', apiKey)
        .set('cache-control', 'no-cache')
        .expect(403) // expired
        .end(function(err, res) {
          debug('expired: ' + util.inspect(res.body));
          if (err) { return done(err); }

          options.expiresIn = 30; // expires 30s from now
          jwtTokenForApiKey = jwt.sign(payload, privateKey, options);

          request(proxy) // should succeed now
            .get('/')
            .set('x-api-key', apiKey)
            .set('cache-control', 'no-cache')
            .expect(200)
            .end(function(err, res) {
              debug('restored: ' + util.inspect(res.body));
              jwtTokenForApiKey = savedToken; // restore token
              if (err) { return done(err); }
              done();
            });
        });
    });

    it('keep auth header', function(done) {
      config.oauth.keepAuthHeader = true;
      config.oauth.allowNoAuthorization = true;
      config.oauth.allowInvalidAuthorization = false;

      request(proxy)
        .get('/')
        .expect(200)
        .end(function(err, res) {
          if (err) { return done(err); }
          should.exist(res.body.fromTarget);
          should.exist(res.headers.authorization);

          should.not.exist(res.body.headers['authorization']);
          should.not.exist(res.body.headers['x-authorization-claims']);
          done();
        });

    });

  });

});
