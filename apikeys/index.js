"use strict";

var debug = require("debug")("plugin:apikeys");
var url = require("url");
var rs = require("jsrsasign");
var fs = require("fs");
var path = require("path");
const checkIfAuthorized = require('../lib/validateResourcePath');
var cache = require('../emgCache');
var JWS = rs.jws.JWS;
var requestLib = require('postman-request');
var _ = require("lodash");

const AuthorizationHelper = require('../lib/AuthorizationHelper');

const PRIVATE_JWT_VALUES = ["application_name", "client_id", "api_product_list", "iat", "exp"];

const acceptAlg = ["RS256"];

var acceptField = {};
acceptField.alg = acceptAlg;

var productOnly;
var cacheKey = false;

const LOG_TAG_COMP = 'apikeys';
const CONSOLE_LOG_TAG_COMP = 'microgateway-plugins apikeys';
let authorizationHelper = null;

module.exports.init = function(config, logger, stats) {

    if (config === undefined || !config) return (undefined);
    authorizationHelper = new AuthorizationHelper(debug);

    var request = config.request ? requestLib.defaults(config.request) : requestLib;
    var keys = config.jwk_keys ? JSON.parse(config.jwk_keys) : null;

    var middleware = function(req, res, next) {

        if (!req || !res) return (-1); // need to check bad args 
        if (!req.headers) return (-1); // or throw -- means callers are bad

        var apiKeyHeaderName = config.hasOwnProperty("api-key-header") ? config["api-key-header"] : "x-api-key";
		//set to true retain the api key
		var keepApiKey = config.hasOwnProperty('keep-api-key') ? config['keep-api-key'] : false;
		//cache api keys
        cacheKey = config.hasOwnProperty("cacheKey") ? config.cacheKey : false;
        //store api keys here
        var apiKey;
        //this flag will enable check against resource paths only
        productOnly = config.hasOwnProperty("productOnly") ? config.productOnly : false;
        //if local proxy is set, ignore proxies
        if (process.env.EDGEMICRO_LOCAL_PROXY === "1") {
            productOnly = true;
        }        

        //leaving rest of the code same to ensure backward compatibility
        apiKey = req.headers[apiKeyHeaderName]
        if ( apiKey ) {
			if (!keepApiKey) {
				delete(req.headers[apiKeyHeaderName]); // don't pass this header to target
			}
            exchangeApiKeyForToken(req, res, next, config, logger, stats, middleware, apiKey);
        } else if (req.reqUrl && req.reqUrl.query && (apiKey = req.reqUrl.query[apiKeyHeaderName])) {
            exchangeApiKeyForToken(req, res, next, config, logger, stats, middleware, apiKey);
        } else {
            if (config.allowNoAuthorization) {
                return next();
            } else {
                debug('missing_authorization');
                return sendError(req, res, next, logger, stats, 'missing_authorization', 'Missing API Key header');
            }
        }
    }

    var exchangeApiKeyForToken = function(req, res, next, config, logger, stats, middleware, apiKey) {
        var cacheControl = req.headers["cache-control"] || 'no-cache';
        if (cacheKey || (cacheControl && cacheControl.indexOf("no-cache") < 0)) { // caching is allowed
            cache.read(apiKey, function(err, value) {
                if (value) {
                    if (Date.now() / 1000 < value.exp) { // not expired yet (token expiration is in seconds)
                        debug("api key cache hit", apiKey);
                        return authorize(req, res, next, logger, stats, value);
                    } else {
                        cache.remove(apiKey);
                        debug("api key cache expired", apiKey);
                        requestApiKeyJWT(req, res, next, config, logger, stats, middleware, apiKey);
                    }
                } else {
                    debug("api key cache miss", apiKey);
                    requestApiKeyJWT(req, res, next, config, logger, stats, middleware, apiKey);
                }
            });
        } else {
            requestApiKeyJWT(req, res, next, config, logger, stats, middleware, apiKey);
        }

    }

    function requestApiKeyJWT(req, res, next, config, logger, stats, middleware, apiKey) {

        if (!config.verify_api_key_url) return sendError(req, res, next, logger, stats, "invalid_request", "API Key Verification URL not configured");

        var api_key_options = {
            url: config.verify_api_key_url,
            method: "POST",
            json: {
                "apiKey": apiKey
            },
            headers: {
                "x-dna-api-key": apiKey
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
                try {
                    if (config.agentOptions.cert && config.agentOptions.key) {
                        api_key_options.key = fs.readFileSync(path.resolve(config.agentOptions.key), "utf8");
                        api_key_options.cert = fs.readFileSync(path.resolve(config.agentOptions.cert), "utf8");
                        if (config.agentOptions.ca) api_key_options.ca = fs.readFileSync(path.resolve(config.agentOptions.ca), "utf8");
                    } else if (config.agentOptions.pfx) {
                        api_key_options.pfx = fs.readFileSync(path.resolve(config.agentOptions.pfx));
                    }    
                } catch (e) {
                    logger.consoleLog('warn', {component: CONSOLE_LOG_TAG_COMP}, "apikeys plugin could not load key file");
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
        debug(api_key_options);
        request(api_key_options, function(err, response, body) {
            if (err) {
                debug("verify apikey gateway timeout");
                return sendError(req, res, next, logger, stats, "gateway_timeout", err.message);
            }
            if (response.statusCode !== 200) {
				if (config.allowInvalidAuthorization) {
                    logger.eventLog({level:'warn', req: req, res: res, err:err, component:LOG_TAG_COMP }, "ignoring err in requestApiKeyJWT");
					return next();
				} else {
	                debug("verify apikey access_denied");
	                return sendError(req, res, next, logger, stats, "access_denied", response.statusMessage);
				}
            }
            verify(body, config, logger, stats, middleware, req, res, next, apiKey);
        });
    }

    var verify = function(token, config, logger, stats, middleware, req, res, next, apiKey) {

        var isValid = false;
        var oauthtoken = token && token.token ? token.token : token;
        var decodedToken = {}
        try {
            decodedToken = JWS.parse(oauthtoken);
            req.token = decodedToken.payloadObj;
        } catch(e) {
            return sendError(req, res, next, logger, stats, "access_denied", 'apikeys plugin failed to parse token in verify');
        }
        debug(decodedToken)
        if (keys) {
            debug("using jwk");
            var pem = authorizationHelper.getPEM(decodedToken, keys);
            try {
                isValid = JWS.verifyJWT(oauthtoken, pem, acceptField);
            } catch (error) {
                logger.consoleLog('warn', {component: CONSOLE_LOG_TAG_COMP}, 'error parsing jwt: ');
            }
        } else {
            debug("validating jwt");
            debug(config.public_key)
            try {
                isValid = JWS.verifyJWT(oauthtoken, config.public_key, acceptField);
            } catch (error) {
                logger.consoleLog('warn', {component: CONSOLE_LOG_TAG_COMP}, 'error parsing jwt: ');
            }
        }
        if (!isValid) {
            if (config.allowInvalidAuthorization) {
                logger.eventLog({level:'warn', req: req, res: res, err:null, component:LOG_TAG_COMP }, "ignoring err in verify");
                return next();
            } else {
                debug("invalid token");
                return sendError(req, res, next, logger, stats, "invalid_token");
            }
        } else {
            authorize(req, res, next, logger, stats, decodedToken.payloadObj, apiKey);
        }
    };

    return {

        onrequest: function(req, res, next) {
            if (process.env.EDGEMICRO_LOCAL === "1") {
                debug ("MG running in local mode. Skipping OAuth");
                next();
            } else {
                middleware(req, res, next);
            }
        }
    };

    function authorize(req, res, next, logger, stats, decodedToken, apiKey) {
        req.token = decodedToken;
        if (checkIfAuthorized(config, req, res, decodedToken, productOnly, logger, LOG_TAG_COMP)) {
            var authClaims = _.omit(decodedToken, PRIVATE_JWT_VALUES);
            req.headers["x-authorization-claims"] = Buffer.from(JSON.stringify(authClaims)).toString("base64");

            if (apiKey) {
                var cacheControl = req.headers["cache-control"] || "no-cache";
                if (cacheKey || (cacheControl && cacheControl.indexOf("no-cache") < 0)) { // caching is toFixed
                    // default to now (in seconds) + 30m if not set
                    decodedToken.exp = decodedToken.exp || +(((Date.now() / 1000) + 1800).toFixed(0));
                    //apiKeyCache[apiKey] = decodedToken;
                    cache.store(apiKey, decodedToken);
                    debug("api key cache store", apiKey);
                } else {
                    debug("api key cache skip", apiKey);
                }
            }
            next();
        } else {
            return sendError(req, res, next, logger, stats, "access_denied");
        }
    }

}



function sendError(req, res, next, logger, stats, code, message) {

    authorizationHelper.setResponseCode(res,code)

    var response = {
        error: code,
        error_description: message
    };

    debug("auth failure", res.statusCode, code, message ? message : "", req.headers, req.method, req.url);
    const err = Error('auth failure');
    logger.eventLog({level:'error', req: req, res: res, err:err, component:LOG_TAG_COMP }, message);

    //opentracing
    if (process.env.EDGEMICRO_OPENTRACE) {
        try {
            if (logger.traceHelper) {
                logger.traceHelper.setChildErrorSpan('apikeys', req.headers);
            }
        } catch (err) { }
    }
    //

    if (!res.finished) res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(response));
    stats.incrementStatusCount(res.statusCode);
    next(code, message);
    return code;
}
