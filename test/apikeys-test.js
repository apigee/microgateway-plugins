const apikey = require('../apikeys/index');
const assert = require('assert');
const denv = require('dotenv');

denv.config();

const coreObject = require('./microgateway-core');
const logger = coreObject.logger;
const stats = coreObject.stats;

var apikeyConfiigDefaults = {
    "api-key-header": 'x-api-key',
    "cacheKey": false,
    "gracePeriod": 0,
    "productOnly": false,
    "allowNoAuthorization": false,
}

describe('apikey plugin', function () {

    var plugin = null;

    before(() => {
        //
    })

    beforeEach(() => {
        process.env.EDGEMICRO_LOCAL_PROXY = "0"
        process.env.EDGEMICRO_LOCAL = "0"
        delete process.env.EDGEMICRO_OPENTRACE
    });

    after((done) => {
        if (plugin) plugin.shutdown();
        done();
    })

    it('will not initialize without a well formed config', (done) => {

        var myplugin = apikey.init(undefined, logger, stats);
        assert(myplugin === undefined)
        myplugin = apikey.init(null, logger, stats);
        assert(myplugin === undefined)
        done();
    })

    it('exposes an onrequest handler', (done) => {
        var pluginT = apikey.init(apikeyConfiigDefaults, logger, stats);
        assert.ok(pluginT.onrequest);
        done();
    });

    it('runs in local mode', (done) => {
        process.env.EDGEMICRO_LOCAL = "1"
        var req = null;
        var res = null;

        var myplugin = apikey.init(apikeyConfiigDefaults, logger, stats);
        myplugin.onrequest(req, res, () => {
            process.env.EDGEMICRO_LOCAL = "0"
            assert(true)
            done();
        })
    })

    it('takes a default config and bad req and res', (done) => {
        var req = null;
        var res = null;

        var cb_called = false;
        var cb = () => {
            cb_called = true;
            assert(false)
            done();
        }

        try {
            var pluginT = apikey.init(apikeyConfiigDefaults, logger, stats);
            pluginT.onrequest(req, res, cb)
            if (!cb_called) {
                assert(true);
            }
            req = {}
            res = {}
            pluginT.onrequest(req, res, cb)
            if (!cb_called) {
                assert(true);
                done();
            }
        } catch (e) {
            console.log(e);
            assert(false)
            done()
        }

    })

    it('req and res are empty and default config ', (done) => {
        var req = {
            headers: {}
        };
        var res = {
            setHeader: function () { },
            end: function () { }
        };

        process.env.EDGEMICRO_LOCAL_PROXY = "1"

        var cb_called = false;
        var cb = () => {
            cb_called = true;
            assert(true)
            done();
        }
        try {
            var pluginT = apikey.init(apikeyConfiigDefaults, logger, stats);
            pluginT.onrequest(req, res, cb)
            if (!cb_called) {
                assert(false);
                done();
            }
        } catch (e) {
            console.log(e);
            assert(false)
            done()
        }
    })

}); 