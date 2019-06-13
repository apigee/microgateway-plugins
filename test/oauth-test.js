const oauth = require('../oauth/index');
const assert = require('assert');
const denv = require('dotenv');
denv.config();


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






var default_onrequest_cb = (err) => {
    assert.ok(!(err instanceof Error));
    done();
};

var generic_req = {
  token: {
    application_name: '0e7762f4-ea67-4cc1-ae4a-21598c35b18f',
    api_product_list: ['EdgeMicroTestProduct']       
  }
}

var generic_res = {
  headers: {},
  setHeader: (key, val) => {
    res.headers[key] = val;
  }
}


// var generic_req_params = [generic_req, generic_res, default_onrequest_cb];


describe('oauth plugin', function() {
  var plugin = null;

  //this.timout(0)

  before(() => {
    //
    
  })
  
  beforeEach(() => {
    // environment variables....
    process.env.EDGEMICRO_LOCAL_PROXY = "0"
    process.env.EDGEMICRO_LOCAL = "0"
    process.env.EDGEMICRO_OPENTRACE = false
    //
  });


  after((done) => {
    if ( plugin ) plugin.shutdown();
    done();
  })

  it('will not initialize without a well formed config',(done) => {
    var logger = {};
    var stats = {};

    var myplugin = oauth.init(undefined, logger, stats);
    assert(myplugin === undefined)

    myplugin = oauth.init(null, logger, stats);
    assert(myplugin === undefined)

    done();
  })
 
  it('exposes an onrequest handler', (done) => {
    var logger = {};
    var stats = {};
    //
    var pluginT = oauth.init(oauthConfiigDefaults, logger, stats);
    assert.ok(pluginT.onrequest);
    //
    done();
  });

  it('runs in local mode',(done) => {
    //
    process.env.EDGEMICRO_LOCAL = "1"
    var logger = {};
    var stats = {};

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
    var logger = {};
    var stats = {};
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

  it('req and res are empty and default config ', (done) => {
    // 
    var logger = {};
    var stats = {};
    //
    var req = {
      headers : {}
    };
    var res = {};
    //
    process.env.EDGEMICRO_LOCAL_PROXY = "1"
    //
    var cb_called = false;
    //
    var cb = () => {
      cb_called = true;
      assert(true)
      done();
    }
    //
    try {
      var pluginT = oauth.init(oauthConfiigDefaults, logger, stats);
      pluginT.onrequest(req,res,cb)
      if ( !cb_called ) {
        assert(false);
        done();
      }
    //
    } catch(e) {
      console.log(e);
      assert(false)
      done()
    }

  })


});
