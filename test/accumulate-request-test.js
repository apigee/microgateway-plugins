const accumulateRequest = require('../accumulate-request/index');
const assert = require('assert');
const coreObject = require('./microgateway-core');
const logger = coreObject.logger;
const stats = coreObject.stats;

describe('accumulate request plugin', () => {
  var plugin = null;

  beforeEach(() => {
    var config = {};

    plugin = accumulateRequest.init.apply(null, [config, logger, stats]);
  });

  it('exposes an ondata_request handler', () => {
    assert.ok(plugin.ondata_request);
  });

  it('exposes an onend_request handler', () => {
    assert.ok(plugin.onend_request);
  });

  it('calls back with two null function arguments in the ondata_request handler', (done) => {
    var cb = (err, result) => {
      assert.equal(err, null);
      assert.equal(result, null);
      done();
    }


    plugin.ondata_request.apply(null, [{}, {}, Buffer.alloc(5, 'a'), cb]);
  });

  it('will collect all buffers provided to ondata_request handler, concatenate them, and return them as a single buffer', (done) => {
    var desiredResult = 'aaaaaaaaaaaaaaa';
    
    var ondata_cb = (err, result) => {
      assert.equal(err, null);
      assert.equal(result, null);
      assert.ok(req._chunks);
    }

    var onend_cb = (err, result) => {
      assert.equal(err, null);
      assert.equal(result.toString(), desiredResult); 
      done();
    } 

    var req = {};

    plugin.ondata_request.apply(null, [req, {}, Buffer.alloc(5, 'a'), ondata_cb]);
    plugin.ondata_request.apply(null, [req, {}, Buffer.alloc(5, 'a'), ondata_cb]);
    plugin.ondata_request.apply(null, [req, {}, Buffer.alloc(5, 'a'), ondata_cb]);
    
    plugin.onend_request.apply(null, [req, {}, null, onend_cb]);  
  });

  it('will append data included in the end call to the buffer', (done) => {
    var desiredResult = 'aaaaaaaaaaaaaaaaaaaa';
    
    var ondata_cb = (err, result) => {
      assert.equal(err, null);
      assert.equal(result, null);
      assert.ok(req._chunks);
    }

    var onend_cb = (err, result) => {
      assert.equal(err, null);
      assert.equal(result.toString(), desiredResult); 
      done();
    } 

    var req = {};

    plugin.ondata_request.apply(null, [req, {}, Buffer.alloc(5, 'a'), ondata_cb]);
    plugin.ondata_request.apply(null, [req, {}, Buffer.alloc(5, 'a'), ondata_cb]);
    plugin.ondata_request.apply(null, [req, {}, Buffer.alloc(5, 'a'), ondata_cb]);
    
    plugin.onend_request.apply(null, [req, {}, Buffer.alloc(5, 'a'), onend_cb]);  
  });

  it('will create a req._chunks object on the request object', (done) => {
    var req = {};
    var cb = (err, result) => {
      assert.equal(err, null);
      assert.equal(result, null);
      assert.ok(req._chunks);
      assert.equal(req._chunks.toString(), 'aaaaa');
      done();
    }

    plugin.ondata_request.apply(null, [req, {}, Buffer.alloc(5, 'a'), cb]);
  });

  it('will call the callback with null if no data events are provided.', (done) => {
    var onend_cb = (err, result) => {
      assert.equal(err, null);
      assert.equal(result, null); 
      done();
    } 

    var req = {};

    plugin.onend_request.apply(null, [req, {}, null, onend_cb]);  

  });
})
