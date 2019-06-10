const quota = require('../quota/index');
const assert = require('assert');

describe('quota plugin', () => {
  var plugin = null;
  
  beforeEach(() => {
    var logger = {};
    var stats = {};

    var exampleConfig = { 
      EdgeMicroTestProduct: {
        allow: process.env.QUOTA_ALLOW,
        interval: Number(process.env.QUOTA_INTERVAL),
        timeUnit: process.env.QUOTA_TIMEUNIT,
        bufferSize: process.env.QUOTA_BUFFERSIZE,
        uri: process.env.QUOTA_URI,
        key: process.env.QUOTA_KEY,
        secret: process.env.QUOTA_SECRET 
      }
    }
    
    plugin = quota.init.apply(null, [exampleConfig, logger, stats]);
  });
 
  it('exposes an onrequest handler', () => {
    assert.ok(plugin.onrequest);
  });

/*  it('will quota limit after 3 API calls', (done) => {
    var count = 0;
    var onrequest_cb = (err) => {
      count++;
      if(count == 4) {
        assert.equal(count, 4);
        assert.equal(err.message, 'exceeded quota');
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
    plugin.onrequest.apply(null, [req, res, onrequest_cb]);
  }); */

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
});


