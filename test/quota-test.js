const quota = require('../quota/index');
const assert = require('assert');
const denv = require('dotenv');
denv.config();



var emtProxy = () => {}

// TODO: this config format is incorrect, revist use of env vars in this test
var exampleConfig = { 
  EdgeMicroTestProduct: {
    allow: process.env.QUOTA_ALLOW,
    interval: Number(process.env.QUOTA_INTERVAL),
    timeUnit: process.env.QUOTA_TIMEUNIT,
    bufferSize: process.env.QUOTA_BUFFERSIZE,
    uri: process.env.QUOTA_URI,
    key: process.env.QUOTA_KEY,
    secret: process.env.QUOTA_SECRET 
  },
  product_to_proxy: {
    EdgeMicroTestProduct :  [
      'hello_world',
      'have_a_nice_day'
    ]
  },
  proxies: [
    {name: 'hello_world', base_path: 'up.to.here.interal' },
    {name: 'hello_have_a_nice_dayworld', base_path: 'up.to.there.interal' }
  ]
}



var exampleUselessConfig = { 
  EdgeMicroTestProduct: {
    allow: undefined,
    interval: undefined,
    timeUnit: undefined,
    bufferSize: undefined,
    uri: undefined,
    key: undefined,
    secret: undefined 
  }
}


var exampleBogusConfig_timeUnit = { 
  EdgeMicroTestProduct: {
    allow: process.env.QUOTA_ALLOW,
    interval: Number(process.env.QUOTA_INTERVAL),
    timeUnit: 'secs',
    bufferSize: process.env.QUOTA_BUFFERSIZE,
    uri: process.env.QUOTA_URI,
    key: process.env.QUOTA_KEY,
    secret: process.env.QUOTA_SECRET 
  },
  product_to_proxy: {
    EdgeMicroTestProduct :  [
      'hello_world',
      'have_a_nice_day'
    ]
  },
  proxies: [
    {name: 'hello_world', base_path: 'up.to.here.interal' },
    {name: 'hello_have_a_nice_dayworld', base_path: 'up.to.there.interal' }
  ]
}


var exampleBogusConfig_NoURI_NOKEY = { 
  EdgeMicroTestProduct: {
    allow: process.env.QUOTA_ALLOW,
    interval: Number(process.env.QUOTA_INTERVAL),
    timeUnit: 'secs',
    bufferSize: process.env.QUOTA_BUFFERSIZE,
    uri: undefined,
    key: undefined,
    secret: process.env.QUOTA_SECRET 
  },
  product_to_proxy: {
    EdgeMicroTestProduct :  emtProxy
  },
  proxies: [emtProxy]
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

var generic_req_params = [generic_req, generic_res, default_onrequest_cb];


describe('quota plugin', function() {
  var plugin = null;

  //this.timout(0)

  before(() => {
    //
    var logger = {};
    var stats = {};

    plugin = quota.init.apply(null, [exampleConfig, logger, stats]);
    
  })
  
  beforeEach(() => {
  });


  after((done) => {
    plugin.shutdown();
    done();
  })


  it('will not initialize without a well formed config',(done) => {
    var logger = {};
    var stats = {};

    var myplugin = quota.init.apply(null, [exampleUselessConfig, logger, stats]);
    assert(myplugin === undefined)
    done();
    
  })
 
  it('exposes an onrequest handler', (done) => {
    assert.ok(plugin.onrequest);
    done();
  });
 

  it('will throw on bad time unit',(done) => {
    try {
      quota.init.apply(null, [exampleBogusConfig_timeUnit, logger, stats]);
    } catch(e) {
      assert(true);
    }
    done();
  })


  it('will throw on no URI',(done) => {
    try {
      quota.init.apply(null, [exampleBogusConfig_NoURI_NOKEY, logger, stats]);
    } catch(e) {
      assert(true);
    }
    done();
  })
  

  it('will throw on no KEY',(done) => {
    try {
      exampleBogusConfig_NoURI_NOKEY.EdgeMicroTestProduct.uri = exampleConfig.EdgeMicroTestProduct.uri
      quota.init.apply(null, [exampleBogusConfig_NoURI_NOKEY, logger, stats]);
    } catch(e) {
      assert(true);
    }
    done();
  })

  it('defers to a local handler',(done) => {
    //
    var pars = [].concat(generic_req_params)
    pars[2] = () => {
      delete process.env.EDGEMICRO_LOCAL;
      done();
    }
    process.env.EDGEMICRO_LOCAL = "This is a test"
    plugin.onrequest.apply(null, pars);
    //
  })

  it('will throw on bad time unit',(done) => {
    try {
      quota.init.apply(null, [exampleBogusConfig_timeUnit, logger, stats]);
    } catch(e) {
      assert(true);
    }
    done();
  })


  it('will throw on no URI',(done) => {
    try {
      quota.init.apply(null, [exampleBogusConfig_NoURI_NOKEY, logger, stats]);
    } catch(e) {
      assert(true);
    }
    done();
  })
  

  it('will throw on no KEY',(done) => {
    try {
      exampleBogusConfig_NoURI_NOKEY.EdgeMicroTestProduct.uri = exampleConfig.EdgeMicroTestProduct.uri
      quota.init.apply(null, [exampleBogusConfig_NoURI_NOKEY, logger, stats]);
    } catch(e) {
      assert(true);
    }
    done();
  })

  it('defers to a local handler',(done) => {
    //
    var pars = [].concat(generic_req_params)
    pars[2] = () => {
      delete process.env.EDGEMICRO_LOCAL;
      done();
    }
    process.env.EDGEMICRO_LOCAL = "This is a test"
    plugin.onrequest.apply(null, pars);
    //
  })




it('will quota limit after 3 API calls', (done) => {
    var count = 0;
    var onrequest_cb = (err) => {
      count++;
      if ( err && (count >= 4) ) {
        assert(true);
        assert.equal(err.message, 'exceeded quota');
        done();
      } else {
        if ( count >= 4 ) {
          assert(false);
          done();
        }
      }
    };

    var req = {
      token: {
        application_name: '0e7762f4-ea67-4cc1-ae4a-21598c35b18f',
        api_product_list: ['EdgeMicroTestProduct']       
      }
    }

    var res = {
      headers: {},
      setHeader: (key, val) => {
        res.headers[key] = val;
      },
      proxy : {
        base_path : 'up.to.here.interal'
      }
    }

    plugin.onrequest.apply(null, [req, res, onrequest_cb]);
    plugin.onrequest.apply(null, [req, res, onrequest_cb]);
    plugin.onrequest.apply(null, [req, res, onrequest_cb]);
    plugin.onrequest.apply(null, [req, res, onrequest_cb]);
  });


  it('will not quota limit before 3 API calls', (done) => {
    var count = 0;
    var onrequest_cb = (err) => {
      count++;
      if(count == 3) {
        assert.equal(count, 3);
        assert.ok(!(err instanceof Error));
        done();
      } 
    };

    var req = {
      token: {
        application_name: '0e7762f4-ea67-4cc1-ae4a-21598c35b18f',
        api_product_list: ['EdgeMicroTestProduct']       
      }
    }

    var res = {
      headers: {},
      setHeader: (key, val) => {
        res.headers[key] = val;
      }
    }

    plugin.onrequest.apply(null, [req, res, onrequest_cb]);
    plugin.onrequest.apply(null, [req, res, onrequest_cb]);
    plugin.onrequest.apply(null, [req, res, onrequest_cb]);
  });



  it('it will not operate when there is no product list', (done) => {
    var count = 0;
    var onrequest_cb = (err) => {
      assert(err === undefined)
      done();
    };

    var req = {
      token: {
        application_name: '0e7762f4-ea67-4cc1-ae4a-21598c35b18f'   
      }
    }

    var res = {
      headers: {},
      setHeader: (key, val) => {
        res.headers[key] = val;
      }
    }

    plugin.onrequest.apply(null, [req, res, onrequest_cb]);

  });


  it('will use time unit as month',(done) => {
    var logger = {};
    var stats = {};

    exampleBogusConfig_timeUnit.EdgeMicroTestProduct.timeUnit = 'month';

    var myplugin = quota.init.apply(null, [exampleBogusConfig_timeUnit, logger, stats]);
    assert(myplugin !== undefined)
    myplugin.shutdown()
    done();
    
  });



  it('it has test probe',(done) => {
    var logger = {};
    var stats = {};

    exampleBogusConfig_timeUnit.EdgeMicroTestProduct.timeUnit = 'month';

    var myplugin = quota.init.apply(null, [exampleBogusConfig_timeUnit, logger, stats]);
    assert(myplugin !== undefined)

    if ( myplugin.testprobe ) {
      var qs = myplugin.testprobe();
      assert(qs !== undefined )
    }
    
    myplugin.shutdown()
    done();
    
  });

});
