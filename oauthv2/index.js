'use strict';

var debug = require('debug')('plugin:oauthv2');
var url = require('url');
var rs = require('jsrsasign');
const checkIfAuthorized = require('../lib/validateResourcePath');
var map = require('../emgCache');
var JWS = rs.jws.JWS;
//var requestLib = require('postman-request');
var _ = require('lodash');

const AuthorizationHelper = require('../lib/AuthorizationHelper');

const authHeaderRegex = /Bearer (.+)/;
const PRIVATE_JWT_VALUES = ['application_name', 'client_id', 'api_product_list', 'iat', 'exp'];
const LOG_TAG_COMP = 'oauthv2';

const acceptAlg = ['RS256'];

var acceptField = {};
acceptField.alg = acceptAlg;

var productOnly;
//setup cache for oauth tokens
var tokenCache = false;
map.setup({
    purgeInterval: 10000
});

var tokenCacheSize = 100;
let authorizationHelper = null;

module.exports.init = function(config, logger, stats) {

    if (config === undefined || !config) return (undefined);
    authorizationHelper = new AuthorizationHelper(debug);
    //var request = config.request ? requestLib.defaults(config.request) : requestLib;
    var keys = config.jwk_keys ? JSON.parse(config.jwk_keys) : null;

    var middleware = function(req, res, next) {

        var authHeaderName = config.hasOwnProperty('authorization-header') ? config['authorization-header'] : 'authorization';
        var keepAuthHeader = config.hasOwnProperty('keep-authorization-header') ? config['keep-authorization-header'] : false;
        //set grace period
        var gracePeriod = config.hasOwnProperty('gracePeriod') ? config.gracePeriod : 0;
        acceptField.gracePeriod = gracePeriod;
        //this flag will enable check against resource paths only
        productOnly = config.hasOwnProperty('productOnly') ? config.productOnly : false;
        //if local proxy is set, ignore proxies
        if (process.env.EDGEMICRO_LOCAL_PROXY === "1") {
            productOnly = true;
        }        
        //token cache settings
        tokenCache = config.hasOwnProperty('tokenCache') ? config.tokenCache : false;
        //max number of tokens in the cache
        tokenCacheSize = config.hasOwnProperty('tokenCacheSize') ? config.tokenCacheSize : 100;
        //
        var header = false;
        if (!req.headers[authHeaderName]) {
            if (config.allowNoAuthorization) {
                return next();
            } else {
                debug('missing_authorization');
                return sendError(req, res, next, logger, stats, 'missing_authorization', 'Missing Authorization header');
            }
        } else {
            header = authHeaderRegex.exec(req.headers[authHeaderName]);
            if (!(header) || (header.length < 2) ) {
                debug('Invalid Authorization Header');
                return sendError(req, res, next, logger, stats, 'invalid_request', 'Invalid Authorization header');
            }
        }

        if (!keepAuthHeader) {
            delete(req.headers[authHeaderName]); // don't pass this header to target
        }

        var token = '';
        if (header) {
            token = header[1];
        }
        verify(token, config, logger, stats, middleware, req, res, next);
    }

    var verify = function(token, config, logger, stats, middleware, req, res, next) {

        var isValid = false;
        var oauthtoken = token && token.token ? token.token : token;
		var decodedToken;
		try {
            decodedToken = JWS.parse(oauthtoken);
            req.token = decodedToken.payloadObj;
		} catch (err) {
            if (config.allowInvalidAuthorization) {
                logger.eventLog({level:'warn', req: req, res: res, err: err, component:LOG_TAG_COMP }, 'ignoring err');
                return next();
            } else {
                debug('invalid token');
                return sendError(req, res, next, logger, stats, 'invalid_token', 'invalid_token');
            }
		}
        
        if (tokenCache === true) {
            debug('token caching enabled')
            map.read(oauthtoken, function(err, tokenvalue) {
                if ( !err && (tokenvalue !== undefined) && (tokenvalue !== null) && (tokenvalue === oauthtoken) ) {
                    debug('found token in cache');
                    isValid = true;
                    if (ejectToken(decodedToken.payloadObj.exp)) {
                        debug('ejecting token from cache');
                        map.remove(oauthtoken);
                    }
                } else {
                    debug('token not found in cache');
                    try {
                        if (keys) {
                            debug('using jwk');
                            var pem = authorizationHelper.getPEM(decodedToken, keys);
                            isValid = JWS.verifyJWT(oauthtoken, pem, acceptField);
                        } else {
                            debug('validating jwt');
                            isValid = JWS.verifyJWT(oauthtoken, config.public_key, acceptField);
                        }
                    } catch (error) {
                        logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, 'error parsing jwt: ');
                    }
                }
                if (!isValid) {
                    if (config.allowInvalidAuthorization) {
                        logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, 'ignoring err in verify');
                        return next();
                    } else {
                        debug('invalid token');
                        return sendError(req, res, next, logger, stats,'invalid_token', 'invalid_token');
                    }
                } else {
                    if (tokenvalue === null || tokenvalue === undefined) {
                        map.size(function(err, sizevalue) {
                            if (!err && sizevalue !== null && sizevalue < tokenCacheSize) {
                                map.store(oauthtoken, oauthtoken, decodedToken.payloadObj.exp);
                            } else {
                                debug('too many tokens in cache; ignore storing token');
                            }
                        });
                    }
                    authorize(req, res, next, logger, stats, decodedToken.payloadObj);
                }
            });
        } else {
            try {
                if (keys) {
                    debug('using jwk');
                    var pem = authorizationHelper.getPEM(decodedToken, keys);
                    isValid = JWS.verifyJWT(oauthtoken, pem, acceptField);
                } else {
                    debug('validating jwt');
                    isValid = JWS.verifyJWT(oauthtoken, config.public_key, acceptField);
                }
            } catch (error) {
                logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, 'error parsing jwt: ');
            }
            if (!isValid) {
                if (config.allowInvalidAuthorization) {
                    logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, 'ignoring err in verify');
                    return next();
                } else {
                    debug('invalid token');
                    return sendError(req, res, next, logger, stats, 'invalid_token', 'invalid_token');
                }
            } else {
                authorize(req, res, next, logger, stats, decodedToken.payloadObj);
            }
        }
    };

    function authorize(req, res, next, logger, stats, decodedToken) {
        req.token = decodedToken;
        if (checkIfAuthorized(config, req, res, decodedToken, productOnly, logger, LOG_TAG_COMP)) {
            var authClaims = _.omit(decodedToken, PRIVATE_JWT_VALUES);
            req.headers['x-authorization-claims'] = Buffer.from(JSON.stringify(authClaims)).toString('base64');
            next();
        } else {
            return sendError(req, res, next, logger, stats, 'access_denied', 'access_denied');
        }
    }

    return {
        onrequest: function(req, res, next) {
            if (process.env.EDGEMICRO_LOCAL === "1") {
                debug ("MG running in local mode. Skipping OAuth");
                next();
            } else {
                middleware(req, res, next);
            }
        },

        shutdown() {
            // tests are needing shutdowns to remove services that keep programs running, etc.
        },

        // specifically a way of exporting support routines for coverage testing
        testing: {
            ejectToken
        }
    };

}

// this should be in a separate module. This code is being copied from instance to instance.
function ejectToken(expTimestampInSeconds) {
    var currentTimestampInSeconds = new Date().getTime() / 1000;
    var gracePeriod = parseInt(acceptField.gracePeriod)
    return currentTimestampInSeconds > expTimestampInSeconds + gracePeriod
}


function sendError(req, res, next, logger, stats, code, message) {

    authorizationHelper.setResponseCode(res,code);

    var response = {
        error: code,
        error_description: message
    };
    const err = Error(message)
    debug('auth failure', res.statusCode, code, message ? message : '', req.headers, req.method, req.url);
    logger.eventLog({level:'error', req: req, res: res, err:err, component:LOG_TAG_COMP }, message);

    //opentracing
    if (process.env.EDGEMICRO_OPENTRACE) {
        try {
            if (logger.traceHelper) {
                logger.traceHelper.setChildErrorSpan('oauthv2', req.headers);
            }
        } catch (err) { }
    }
    //

    if (!res.finished) res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(response));
    stats.incrementStatusCount(res.statusCode);
    next(code, message);
    return code;
}
