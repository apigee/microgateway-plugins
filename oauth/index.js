'use strict';

var debug = require('debug')('plugin:oauth');
var url = require('url');
var rs = require('jsrsasign');
var fs = require('fs');
var path = require('path');
const memoredpath = '../third_party/memored/index';
var sharedMemoryCache = require(memoredpath);

//creating aliases for apiKeyCache and validTokenCache for readability
//both the apiKeyCache and the validTokenCache point to the same 
//instance of shared memory cache
const apiKeyCache = sharedMemoryCache;
const validTokenCache = sharedMemoryCache;

var JWS = rs.jws.JWS;
var requestLib = require('request');
var _ = require('lodash');

const authHeaderRegex = /Bearer (.+)/;
const PRIVATE_JWT_VALUES = ['application_name', 'client_id', 'api_product_list', 'iat', 'exp'];
const SUPPORTED_TOKEN_ASTERISK_PATTERN = "/*/2/**";
const SUPPORTED_DOUBLE_ASTERISK_PATTERN = "**";
const SUPPORTED_SINGLE_ASTERISK_PATTERN = "*";
// const SUPPORTED_SINGLE_FORWARD_SLASH_PATTERN = "/";

const LOG_TAG_COMP = 'oauth';

const acceptAlg = ['RS256'];

var acceptField = {};
acceptField.alg = acceptAlg;

var productOnly;
var cacheKey = false;
//setup cache for oauth tokens
var tokenCache = false;
sharedMemoryCache.setup({
    purgeInterval: 10000
});

var tokenCacheSize = 100;

let oauthConfigObj = null;

module.exports.init = function(config, logger, stats) {

    if ( config === undefined || !config ) return(undefined);

    oauthConfigObj = config;

    var request = config.request ? requestLib.defaults(config.request) : requestLib;
    var keys = config.jwk_keys ? JSON.parse(config.jwk_keys) : null;

    let failopenGraceInterval = 0;
    let isFailOpen = false;
    let gracePeriod = 0;

    var middleware = function(req, res, next) {

        if ( !req || !res ) return(-1); // need to check bad args 
        if ( !req.headers ) return(-1); // or throw -- means callers are bad

        var authHeaderName = config.hasOwnProperty('authorization-header') ? config['authorization-header'] : 'authorization';
        var apiKeyHeaderName = config.hasOwnProperty('api-key-header') ? config['api-key-header'] : 'x-api-key';
        var keepAuthHeader = config.hasOwnProperty('keep-authorization-header') ? config['keep-authorization-header'] : false;
        cacheKey = config.hasOwnProperty('cacheKey') ? config.cacheKey : false;
        //set grace period
        gracePeriod = config.hasOwnProperty('gracePeriod') ? config.gracePeriod : 0;
        acceptField.gracePeriod = gracePeriod;
        //support for enabling oauth or api key only
        var oauth_only = config.hasOwnProperty('allowOAuthOnly') ? config.allowOAuthOnly : false;
        var apikey_only = config.hasOwnProperty('allowAPIKeyOnly') ? config.allowAPIKeyOnly : false;
        //
        var apiKey;
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

        failopenGraceInterval = config.hasOwnProperty('failopenGraceInterval') ? config.failopenGraceInterval : 0;
        isFailOpen = config.hasOwnProperty('failOpen') ? config.failOpen : false;
        //
        //support for enabling oauth or api key only
        var header = false;
        if (oauth_only) {
            if (!req.headers[authHeaderName]) {
                if (config.allowNoAuthorization) {
                    return next();
                } else {
                    debug('missing_authorization');
                    return sendError(req, res, next, logger, stats, 'missing_authorization', 'Missing Authorization header');
                }
            } else {
                header = authHeaderRegex.exec(req.headers[authHeaderName]);
                if ( !(header) || (header.length < 2) ) {
                    debug('Invalid Authorization Header');
                    return sendError(req, res, next, logger, stats, 'invalid_request', 'Invalid Authorization header');
                }
            }
        } else if (apikey_only) {
            if (!req.headers[apiKeyHeaderName]) {
                debug('missing api key');
                return sendError(req, res, next, logger, stats, 'invalid_authorization', 'Missing API Key header');
            }
        }

        //leaving rest of the code same to ensure backward compatibility
        if (!(req.headers[authHeaderName]) || config.allowAPIKeyOnly) {
            apiKey = req.headers[apiKeyHeaderName]
            if ( apiKey ) {
                exchangeApiKeyForToken(req, res, next, config, logger, stats, middleware, apiKey);
            } else if (req.reqUrl && req.reqUrl.query && (apiKey = req.reqUrl.query[apiKeyHeaderName])) {
                exchangeApiKeyForToken(req, res, next, config, logger, stats, middleware, apiKey);
            } else if (config.allowNoAuthorization) {
                return next();
            } else {
                debug('missing_authorization');
                return sendError(req, res, next, logger, stats, 'missing_authorization', 'Missing Authorization header');
            }
        } else {
            
            header = authHeaderRegex.exec(req.headers[authHeaderName]);
            if (!config.allowInvalidAuthorization) {
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
    }

    var exchangeApiKeyForToken = function(req, res, next, config, logger, stats, middleware, apiKey) {
        var cacheControl = req.headers['cache-control'] || 'no-cache';
        if (cacheKey || (!cacheControl || (cacheControl && cacheControl.indexOf('no-cache') < 0))) { // caching is allowed
            apiKeyCache.read(apiKey, function(err, value) {
                if (value) {
                    if (Date.now() / 1000 < value.exp) { // not expired yet (token expiration is in seconds)
                        debug('api key cache hit', apiKey);
                        return authorize(req, res, next, logger, stats, value);
                    } else {
                        if ( isFailOpen === true  && failopenGraceInterval ) {
                            debug('api key expired, using failopen', apiKey);
                            requestApiKeyJWT(req, res, next, config, logger, stats, middleware, apiKey, value);
                        } else {
                            apiKeyCache.remove(apiKey);
                            debug('api key cache expired', apiKey);
                            requestApiKeyJWT(req, res, next, config, logger, stats, middleware, apiKey);
                        }
                    }
                } else {
                    debug('api key cache miss', apiKey);
                    requestApiKeyJWT(req, res, next, config, logger, stats, middleware, apiKey);
                }
            });
        } else {
            requestApiKeyJWT(req, res, next, config, logger, stats, middleware, apiKey);
        }

    }

    function requestApiKeyJWT(req, res, next, config, logger, stats, middleware, apiKey, oldToken) {

        if (!config.verify_api_key_url) return sendError(req, res, next, logger, stats, 'invalid_request', 'API Key Verification URL not configured');

        var api_key_options = {
            url: config.verify_api_key_url,
            method: 'POST',
            json: {
                'apiKey': apiKey
            },
            headers: {
                'x-dna-api-key': apiKey
            }
        };
        
        if( config.key && config.secret) {
            api_key_options['auth']= {
              user: config.key,
              pass: config.secret,
              sendImmediately: true
            }
        }

        if (config.agentOptions) {
            if (config.agentOptions.requestCert) {
                api_key_options.requestCert = true;
                if (config.agentOptions.cert && config.agentOptions.key) {
                    api_key_options.key = fs.readFileSync(path.resolve(config.agentOptions.key), 'utf8');
                    api_key_options.cert = fs.readFileSync(path.resolve(config.agentOptions.cert), 'utf8');
                    if (config.agentOptions.ca) api_key_options.ca = fs.readFileSync(path.resolve(config.agentOptions.ca), 'utf8');
                } else if (config.agentOptions.pfx) {
                    api_key_options.pfx = fs.readFileSync(path.resolve(config.agentOptions.pfx));
                }
                if (config.agentOptions.rejectUnauthorized) {
                    api_key_options.rejectUnauthorized = true;
                }
                if (config.agentOptions.secureProtocol) {
                    api_key_options.secureProtocol = true;
                }
                if (config.agentOptions.ciphers) {
                    api_key_options.ciphers = config.agentOptions.ciphers;
                }
                if (config.agentOptions.passphrase) api_key_options.passphrase = config.agentOptions.passphrase;
            }
        }
        //debug(api_key_options);
        request(api_key_options, function(err, response, body) {
            if ( !err && !response)  {
                debug('empty response received from verify apikey call');
                return sendError(req, res, next, logger, stats, 'internal_server_error', 'empty response received');
            }
            if ( isFailOpen === true &&  oldToken ) {
                if ( err || parseInt(response.statusCode/100) === 5 ) {
                    if ( Date.now() / 1000 < ( oldToken.exp + ( gracePeriod + failopenGraceInterval )*1000 ) ) { // cache should have been expired but adding manual handling
                        req['oauth-failed-open'] = true; // pass the flag to next plugins
                        debug('failed-open set to true for apiKey: %s',apiKey);
                        logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, "failed-open set to true due for apiKey:"+apiKey);
                        return authorize(req, res, next, logger, stats, oldToken); // use old token for failopenGraceInterval if 5XX
                    } else {
                        debug('not failing open as fail open grace time has expired for apiKey: %s', apiKey);
                    }
                } else {
                    // api response is non 5XX, so dont failopen, remove expired token from cache
                    apiKeyCache.remove(apiKey);
                }
            }
            if (err) {
                debug('verify apikey gateway timeout');
                return sendError(req, res, next, logger, stats, 'gateway_timeout', err.message);
            }
            if (response.statusCode !== 200) {
                debug('verify apikey failure',response.statusCode, response.statusMessage, body);
                return sendError(req, res, next, logger, stats, 'access_denied', response.statusMessage,response);
            }
            verify(body, config, logger, stats, middleware, req, res, next, apiKey);
        });
    }

    var verify = function(token, config, logger, stats, middleware, req, res, next, apiKey) {

        var isValid = false;
        var oauthtoken = token && token.token ? token.token : token;
        var decodedToken = null;
        //
        try {
            decodedToken = JWS.parse(oauthtoken);
        } catch(e) {
            // 'invalid_token'
            return sendError(req, res, next, logger, stats, 'invalid_token','token could not be parsed');
        }
        //
        if (tokenCache === true) {
            debug('token caching enabled')
            validTokenCache.read(oauthtoken, function(err, tokenvalue) {
                if (!err && tokenvalue !== undefined && tokenvalue !== null && tokenvalue === 'Y') {
                    debug('found token in cache');
                    isValid = true;
                    if (ejectToken(decodedToken.payloadObj.exp)) {
                        debug('ejecting token from cache');
                        validTokenCache.remove(oauthtoken);
                    }
                } else {
                    debug('token not found in cache');
                    try {
                        if (keys) {
                            debug('using jwk');
                            var pem = getPEM(decodedToken, keys);
                            isValid = JWS.verifyJWT(oauthtoken, pem, acceptField);
                        } else {
                            debug('validating jwt');
                            isValid = JWS.verifyJWT(oauthtoken, config.public_key, acceptField);
                        }                            
                    } catch (error) {
                        logger.eventLog({level:'warn', req: req, res: res, err:err, component:LOG_TAG_COMP }, 'error parsing jwt: ' + oauthtoken);
                    }
                }
                if (!isValid) {
                    if (config.allowInvalidAuthorization) {
                        logger.eventLog({level:'warn', req: req, res: res, err:err, component:LOG_TAG_COMP }, 'ignoring err in verify');
                        return next();
                    } else {
                        debug('invalid token');
                        return sendError(req, res, next, logger, stats, 'invalid_token', 'invalid_token');
                    }
                } else {
                    if (tokenvalue === null || tokenvalue === undefined) {
                        validTokenCache.size(function(err, sizevalue) {
                            if (!err && sizevalue !== null && sizevalue < tokenCacheSize) {
                                let tokenCacheTtl = ( ( decodedToken.payloadObj.exp - new Date().getTime() / 1000) + gracePeriod ) * 1000;
                                validTokenCache.store(oauthtoken, 'Y' , tokenCacheTtl);
                            } else {
                                debug('too many tokens in cache; ignore storing token');
                            }
                        });
                    }
                    authorize(req, res, next, logger, stats, decodedToken.payloadObj, apiKey);
                }
            });
        } else {
            try {
                if (keys) {
                    debug('using jwk');
                    var pem = getPEM(decodedToken, keys);
                    isValid = JWS.verifyJWT(oauthtoken, pem, acceptField);
                } else {
                    debug('validating jwt');
                    isValid = JWS.verifyJWT(oauthtoken, config.public_key, acceptField);
                }
            } catch (error) {
                logger.eventLog({level:'warn', req: req, res: res, err:error, component:LOG_TAG_COMP }, 'error parsing jwt: ' + oauthtoken);
            }
            if (!isValid) {
                if (config.allowInvalidAuthorization) {
                    logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, 'ignoring err');
                    return next();
                } else {
                    debug('invalid token');
                    return sendError(req, res, next, logger, stats, 'invalid_token', 'invalid_token');
                }
            } else {
                authorize(req, res, next, logger, stats, decodedToken.payloadObj, apiKey);
            }
        }
    };

    function authorize(req, res, next, logger, stats, decodedToken, apiKey) {
        if (checkIfAuthorized(config, req.reqUrl.path, res.proxy, decodedToken)) {
            req.token = decodedToken;

            var authClaims = _.omit(decodedToken, PRIVATE_JWT_VALUES);
            req.headers['x-authorization-claims'] = new Buffer(JSON.stringify(authClaims)).toString('base64');

            if (apiKey) {
                var cacheControl = req.headers['cache-control'] || 'no-cache';
                if (cacheKey || (!cacheControl || (cacheControl && cacheControl.indexOf('no-cache') < 0))) { // caching is allowed
                    // default to now (in seconds) + 30m if not set
                    decodedToken.exp = decodedToken.exp || +(((Date.now() / 1000) + 1800).toFixed(0));
                    //apiKeyCache[apiKey] = decodedToken;
                    let cacheTtl = ( ( decodedToken.exp - new Date().getTime() / 1000  ) + gracePeriod ) * 1000;
                    if ( isFailOpen === true  && failopenGraceInterval ) {
                        cacheTtl += failopenGraceInterval * 1000; // will be useful if verifyApiKey call fails for 5XX.
                    }
                    apiKeyCache.store(apiKey, decodedToken, cacheTtl);
                    debug('api key cache store', apiKey);
                } else {
                    debug('api key cache skip', apiKey);
                }
            }
            next();
        } else {
            return sendError(req, res, next, logger, stats, 'access_denied','access_denied');
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

        testing: {
            ejectToken
        }
    };

}  // end of init
// from the product name(s) on the token, find the corresponding proxy
// then check if that proxy is one of the authorized proxies in bootstrap
const checkIfAuthorized = module.exports.checkIfAuthorized = function checkIfAuthorized(config, urlPath, proxy, decodedToken) {

    var parsedUrl = url.parse(urlPath);
    debug('product only: ' + productOnly);
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

                if (apiproxy.includes(SUPPORTED_DOUBLE_ASTERISK_PATTERN) || 
                   apiproxy.includes(SUPPORTED_SINGLE_ASTERISK_PATTERN) ||
                   apiproxy.includes(SUPPORTED_TOKEN_ASTERISK_PATTERN) ) {
                    const proxyRegEx = new RegExp(`^${proxy.base_path
                        .replace(/\//g,'\\/')}${tempApiProxy
                        .replace(/(\w+)\/\*\*/g,'$1/.*')
                        .replace(/\/\*\*/g,'/\\w+.*')
                        .replace( /\"/, '')
                        .replace(/\//g,'\\/')
                        .replace(/\/\*(.*?)(?=\/|$)/g,'\/\\w+\\/*') }$`, 'ig');                       
                        matchesProxyRules = urlPath.match(proxyRegEx)
                } else {
                        // implies case: SUPPORTED_SINGLE_FORWARD_SLASH_PATTERN
                        const proxyRegEx = new RegExp(`^${proxy.base_path
                            .replace(/\//g,'\\/')}\/\\w+|\\W+$`, 'ig');
                        matchesProxyRules = urlPath.match(proxyRegEx);
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
        if (keys.kid === decodedToken.headerObj.kid) {
            break;
        }
    }
    var publickey = rs.KEYUTIL.getKey(keys.keys[i]);
    return rs.KEYUTIL.getPEM(publickey);
}

// this should be in a separate module. This code is being copied from instance to instance.
function ejectToken(expTimestampInSeconds) {
    var currentTimestampInSeconds = new Date().getTime() / 1000;
    var gracePeriod = parseInt(acceptField.gracePeriod)
    return currentTimestampInSeconds > expTimestampInSeconds + gracePeriod
}

function setResponseCode(res,code) {
    switch ( code ) {
        case 'invalid_request': {
            res.statusCode = 400;
            break;
        }
        case 'access_denied':{
            res.statusCode = 403;
            break;
        }
        case 'invalid_token':
        case 'missing_authorization':
        case 'invalid_authorization': {
            res.statusCode = 401;
            break;
        }
        case 'gateway_timeout': {
            res.statusCode = 504;
            break;
        }
        default: {
            res.statusCode = 500;
            break;
        }
    }
}

function sendError(req, res, next, logger, stats, code, message, upstreamResp) {

    if ( upstreamResp && oauthConfigObj.hasOwnProperty('useUpstreamResponse') && oauthConfigObj.useUpstreamResponse === true ) {
        res.statusCode = upstreamResp.statusCode;
        res.statusMessage = upstreamResp.statusMessage;
        code = 'upstream_error';
    } else {
        setResponseCode(res,code);
    }

    var response = {
        error: code,
        error_description: message
    };
    const err = Error(message);
    debug('auth failure', res.statusCode, code, message ? message : '', req.headers, req.method, req.url);
    logger.eventLog({ level:'error', req: req, res: res, err: err,component:'oauth'}, message);

    //opentracing
    if (process.env.EDGEMICRO_OPENTRACE) {
        try {
            const traceHelper = require('../microgateway-core/lib/trace-helper');
            traceHelper.setChildErrorSpan('oauth', req.headers);        
        } catch (err) {}
    }
    //

    if ( !res.finished ) {
        try {
            res.setHeader('content-type', 'application/json');
        } catch (e) {
            logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, "ouath response object lacks setHeader");
        }
    }

    try {
        res.end(JSON.stringify(response));
    } catch (e) {
        logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, "ouath response object is not supplied by runtime");
    }
    
    try {
        stats.incrementStatusCount(res.statusCode);
    } catch (e) {
        logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, "ouath stats object is not supplied by runtime");
    }
    
    next(code, message);
    return code;
}
