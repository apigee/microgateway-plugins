const oauth = require('../oauth/index');
const oauthv2 = require('../oauthv2/index');
const assert = require('assert');
const denv = require('dotenv');
denv.config();

const coreObject = require('./microgateway-core');
const logger = coreObject.logger;
const stats = coreObject.stats;

var oauthConfiigDefaults = {
  "authorization-header" : "authorization",
  "api-key-header" : 'x-api-key',
  "keep-authorization-header" : false,
  "cacheKey" : false,
  "gracePeriod" : 0,
  "allowOAuthOnly" : false,
  "allowAPIKeyOnly" : false,
  "productOnly" : false,
  "tokenCache" : false,
  "tokenCacheSize" : 100,
  "allowNoAuthorization" : false,
  "jwk_keys" : undefined,
  "request" : undefined
}

describe('oauth plugin', function() {
  var plugin = null;

  before(() => {
    //
    
  })
  
  beforeEach(() => {
    // environment variables....
    process.env.EDGEMICRO_LOCAL_PROXY = "0"
    process.env.EDGEMICRO_LOCAL = "0"
    delete process.env.EDGEMICRO_OPENTRACE
    //
  });

  after((done) => {
    if ( plugin ) plugin.shutdown();
    done();
  })
 
  it('exposes an onrequest handler', (done) => {

    //
    var pluginT = oauth.init(oauthConfiigDefaults, logger, stats);
    assert.ok(pluginT.onrequest);
    //
    done();
  });

  it('runs in local mode',(done) => {
    //
    process.env.EDGEMICRO_LOCAL = "1"

    var req = null;
    var res = null;

    var myplugin = oauth.init(oauthConfiigDefaults, logger, stats);
    myplugin.onrequest(req,res,()=>{
      process.env.EDGEMICRO_LOCAL = "0"
      assert(true)
      done();
    })

  })

  it('takes a default config and bad req and res',(done) => {
    // 
    var req = null;
    var res = null;
    //
    var cb_called = false;
    //
    var cb = () => {
      cb_called = true;
      assert(false)
      done();
    }
    //
    try {
      var pluginT = oauth.init(oauthConfiigDefaults, logger, stats);
      pluginT.onrequest(req,res,cb)
      if ( !cb_called ) {
        assert(true);
      }
      req = {}
      res = {}
      pluginT.onrequest(req,res,cb)
      if ( !cb_called ) {
        assert(true);
        done();
      }
    //
    } catch(e) {
      console.log(e);
      assert(false)
      done()
    }

  })

  // should be identical for these tests
  var modules = { oauth, oauthv2 }
  for (var name in modules) {

    describe(name, function() {

      var package = modules[name]

      it('exposes an onrequest handler', function() {
          var config = {}
          var plugin = package.init.apply(null, [config, logger, stats]);
          assert.ok(plugin.onrequest);
        });
      
        it('ejectToken where gracePeriod == 0', function() {
          var config = {
              allowOAuthOnly: true,
              allowNoAuthorization: true,
              gracePeriod: 0,
          }
          var plugin = package.init.apply(null, [config, logger, stats])
              
          var cb = (err) => {}
          var req = {headers: {}}
          var res = {}
          plugin.onrequest.apply(null, [req, res, cb]); // called to init vars

          // not expired
          var exp = (new Date().getTime() / 1000) + 5
          assert.ok(!plugin.testing.ejectToken(exp), "should not eject")
      
          // expired
          var exp = new Date().getTime() / 1000 - 5
          assert.ok(plugin.testing.ejectToken(exp), "should eject")
        });
      
        it('ejectToken where gracePeriod != 0', function() {
          var config = {
              allowOAuthOnly: true,
              allowNoAuthorization: true,
              gracePeriod: 5,
          }
          var plugin = package.init.apply(null, [config, logger, stats])
      
          var cb = (err) => {}
          var req = {headers: {}}
          var res = {}
          plugin.onrequest.apply(null, [req, res, cb]); // called to init vars
      
          // not expired
          var exp = (new Date().getTime() / 1000) + 5
          assert.ok(!plugin.testing.ejectToken(exp), "should not eject")
      
          // expired, inside of grace period
          var exp = new Date().getTime() / 1000 - 3
          assert.ok(!plugin.testing.ejectToken(exp), "should not eject")
      
          // expired, outside of grace period
          var exp = new Date().getTime() / 1000 - 6
          assert.ok(plugin.testing.ejectToken(exp), "should eject")
        });

        it('will not initialize without a well formed config',(done) => {

          var myplugin = package.init(undefined, logger, stats);
          assert(myplugin === undefined)
      
          myplugin = package.init(null, logger, stats);
          assert(myplugin === undefined)
          done();
        })

        it('req and res are empty and default config ', (done) => {
          var req = {
            headers : {}
          };
          var res = {
            setHeader: function () { },
            end: function () { }, 
          };
          process.env.EDGEMICRO_LOCAL_PROXY = "1"
          var cb_called = false;
          var cb = () => {
            cb_called = true;
            assert(true)
            done();
          }
          try {
            var pluginT = package.init(oauthConfiigDefaults, logger, stats);
            pluginT.onrequest(req,res,cb)
            if ( !cb_called ) {
              assert(false);
              done();
            }
          } catch(e) {
            console.log(e);
            assert(false)
            done()
          }
        })
    })
  }
});