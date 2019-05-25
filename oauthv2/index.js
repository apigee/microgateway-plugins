'use strict';

var debug = require('debug')('plugin:oauthv2');
var url = require('url');
var rs = require('jsrsasign');
var fs = require('fs');
var path = require('path');
var map = require('memored');
var JWS = rs.jws.JWS;
var requestLib = require('request');
var _ = require('lodash');

const authHeaderRegex = /Bearer (.+)/;
const PRIVATE_JWT_VALUES = ['application_name', 'client_id', 'api_product_list', 'iat', 'exp'];
const SUPPORTED_DOUBLE_ASTERIK_PATTERN = "**";
const SUPPORTED_SINGLE_ASTERIK_PATTERN = "*";
const SUPPORTED_SINGLE_FORWARD_SLASH_PATTERN = "/";

const acceptAlg = ['RS256'];

var acceptField = {};
acceptField.alg = acceptAlg;

var productOnly;
//setup cache for oauth tokens
var tokenCache = false;
map.setup({
    purgeInterval: 10000
});

var tokenCacheSize = 100; //default cache size for access tokens
var tokenCacheTTL = 60000; //set default token cache TTL to 1 minute 

module.exports.init = function(config, logger, stats) {

    var request = config.request ? requestLib.defaults(config.request) : requestLib;
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
        if (process.env.EDGEMICRO_LOCAL_PROXY == "1") {
            productOnly = true;
        }        
        //token cache settings
        tokenCache = config.hasOwnProperty('tokenCache') ? config.tokenCache : false;
        //token cache ttl
        tokenCacheTTL = config.hasOwnProperty("tokenCacheTTL") ? config.cacheKeyTTL : tokenCacheTTL;
        //max number of tokens in the cache
        tokenCacheSize = config.hasOwnProperty('tokenCacheSize') ? config.tokenCacheSize : tokenCacheSize;
        //
        if (!req.headers[authHeaderName]) {
            if (config.allowNoAuthorization) {
                return next();
            } else {
                debug('missing_authorization');
                return sendError(req, res, next, logger, stats, 'missing_authorization', 'Missing Authorization header');
            }
        } else {
            var header = authHeaderRegex.exec(req.headers[authHeaderName]);
            if (!header || header.length < 2) {
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
		} catch (err) {
            if (config.allowInvalidAuthorization) {
                console.warn('ignoring err');
                return next();
            } else {
                debug('invalid token');
                return sendError(req, res, next, logger, stats, 'invalid_token');
            }
		}
        
        if (tokenCache == true) {
            debug('token caching enabled')
            map.read(oauthtoken, function(err, tokenvalue) {
                if (!err && tokenvalue != undefined && tokenvalue != null && tokenvalue == oauthtoken) {
                    debug('found token in cache');
                    isValid = true;
                    if (ejectToken(decodedToken.payloadObj.exp)) {
                        debug('ejecting token from cache');
                        map.remove(oauthtoken);
                    }
                } else {
                    debug('token not found in cache');
                    if (keys) {
                        debug('using jwk');
                        var pem = getPEM(decodedToken, keys);
                        isValid = JWS.verifyJWT(oauthtoken, pem, acceptField);
                    } else {
                        debug('validating jwt');
                        isValid = JWS.verifyJWT(oauthtoken, config.public_key, acceptField);
                    }
                }
                if (!isValid) {
                    if (config.allowInvalidAuthorization) {
                        console.warn('ignoring err');
                        return next();
                    } else {
                        debug('invalid token');
                        return sendError(req, res, next, logger, stats, 'invalid_token');
                    }
                } else {
                    if (tokenvalue == null || tokenvalue == undefined) {
                        map.size(function(err, sizevalue) {
                            if (!err && sizevalue != null && sizevalue < tokenCacheSize) {
                                map.store(oauthtoken, oauthtoken, tokenCacheTTL);
                            } else {
                                debug('too many tokens in cache; ignore storing token');
                            }
                        });
                    }
                    authorize(req, res, next, logger, stats, decodedToken.payloadObj);
                }
            });
        } else {
            if (keys) {
                debug('using jwk');
                var pem = getPEM(decodedToken, keys);
                isValid = JWS.verifyJWT(oauthtoken, pem, acceptField);
            } else {
                debug('validating jwt');
                isValid = JWS.verifyJWT(oauthtoken, config.public_key, acceptField);
            }
            if (!isValid) {
                if (config.allowInvalidAuthorization) {
                    console.warn('ignoring err');
                    return next();
                } else {
                    debug('invalid token');
                    return sendError(req, res, next, logger, stats, 'invalid_token');
                }
            } else {
                authorize(req, res, next, logger, stats, decodedToken.payloadObj);
            }
        }
    };

    return {

        onrequest: function(req, res, next) {
            if (process.env.EDGEMICRO_LOCAL == "1") {
                debug ("MG running in local mode. Skipping OAuth");
                next();
            } else {
                middleware(req, res, next);
            }
        }
    };

    function authorize(req, res, next, logger, stats, decodedToken) {
        if (checkIfAuthorized(config, req.reqUrl.path, res.proxy, decodedToken)) {
            req.token = decodedToken;
            var authClaims = _.omit(decodedToken, PRIVATE_JWT_VALUES);
            req.headers['x-authorization-claims'] = Buffer.from(JSON.stringify(authClaims)).toString('base64');
            next();
        } else {
            return sendError(req, res, next, logger, stats, 'access_denied');
        }
    }

}

// from the product name(s) on the token, find the corresponding proxy
// then check if that proxy is one of the authorized proxies in bootstrap
const checkIfAuthorized = module.exports.checkIfAuthorized = function checkIfAuthorized(config, urlPath, proxy, decodedToken) {

    var parsedUrl = url.parse(urlPath);
    //
    debug('product only: ' + productOnly);
    //

    if (!decodedToken.api_product_list) {
        debug('no api product list');
        return false;
    }

    return decodedToken.api_product_list.some(function(product) {

        const validProxyNames = config.product_to_proxy[product];

        if (!productOnly) {
            if (!validProxyNames) {
                debug('no proxies found for product');
                return false;
            }
        }


        const apiproxies = config.product_to_api_resource[product];

        var matchesProxyRules = false;
        if (apiproxies && apiproxies.length) {
            apiproxies.forEach(function(tempApiProxy) {
                if (matchesProxyRules) {
                    //found one
                    debug('found matching proxy rule');
                    return;
                }

                urlPath = parsedUrl.pathname;
                const apiproxy = tempApiProxy.includes(proxy.base_path) ?
                    tempApiProxy :
                    proxy.base_path + (tempApiProxy.startsWith("/") ? "" : "/") + tempApiProxy
                if (apiproxy.endsWith("/") && !urlPath.endsWith("/")) {
                    urlPath = urlPath + "/";
                }

                if (apiproxy.includes(SUPPORTED_DOUBLE_ASTERIK_PATTERN)) {
                    const regex = apiproxy.replace(/\*\*/gi, ".*")
                    matchesProxyRules = urlPath.match(regex)
                } else {
                    if (apiproxy.includes(SUPPORTED_SINGLE_ASTERIK_PATTERN)) {
                        const regex = apiproxy.replace(/\*/gi, "[^/]+");
                        matchesProxyRules = urlPath.match(regex)
                    } else {
                        // if(apiproxy.includes(SUPPORTED_SINGLE_FORWARD_SLASH_PATTERN)){
                        // }
                        matchesProxyRules = urlPath == apiproxy;

                    }
                }
            })

        } else {
            matchesProxyRules = true
        }

        debug("matches proxy rules: " + matchesProxyRules);
        //add pattern matching here
        if (!productOnly)
            return matchesProxyRules && validProxyNames.indexOf(proxy.name) >= 0;
        else
            return matchesProxyRules;
    });
}

function getPEM(decodedToken, keys) {
    var i = 0;
    debug('jwk kid ' + decodedToken.headerObj.kid);
    for (; i < keys.length; i++) {
        if (keys.kid == decodedToken.headerObj.kid) {
            break;
        }
    }
    var publickey = rs.KEYUTIL.getKey(keys.keys[i]);
    return rs.KEYUTIL.getPEM(publickey);
}

function ejectToken(expTimestamp) {
    var currentTimestampInSeconds = new Date().getTime() / 1000;
    var timeDifferenceInSeconds = (expTimestamp - currentTimestampInSeconds);

    if (Math.abs(timeDifferenceInSeconds) <= parseInt(acceptField.gracePeriod)) {
        return true;
    } else {
        return false;
    }
}

function sendError(req, res, next, logger, stats, code, message) {

    switch (code) {
        case 'invalid_request':
            res.statusCode = 400;
            break;
        case 'access_denied':
            res.statusCode = 403;
            break;
        case 'invalid_token':
        case 'missing_authorization':
        case 'invalid_authorization':
            res.statusCode = 401;
            break;
        case 'gateway_timeout':
            res.statusCode = 504;
            break;
        default:
            res.statusCode = 500;
    }

    var response = {
        error: code,
        error_description: message
    };

    debug('auth failure', res.statusCode, code, message ? message : '', req.headers, req.method, req.url);
    logger.error({
        req: req,
        res: res
    }, 'oauthv2');

    //opentracing
    if (process.env.EDGEMICRO_OPENTRACE) {
        try {
            const traceHelper = require('../microgateway-core/lib/trace-helper');
            traceHelper.setChildErrorSpan('oauthv2', req.headers);        
        } catch (err) {}
    }
    //

    if (!res.finished) res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(response));
    stats.incrementStatusCount(res.statusCode);
    next(code, message);
    return code;
}
