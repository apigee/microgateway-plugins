'use strict';

var debug = require('debug')('plugin:basicAuth');

var url = require('url');

//
var rs = require('jsrsasign');
var JWS = rs.jws.JWS;

//
const memoredpath = '../third_party/memored/index';
var map = require(memoredpath);

function _enableCache() {
    return(require(memoredpath));
}

map.setup({
    purgeInterval: 10000
});

const CONSOLE_LOG_TAG_COMP = 'microgateway-plugins basicAuth';
//
//
const acceptAlg = ['RS256'];

const SUPPORTED_DOUBLE_ASTERIK_PATTERN = "**";
const SUPPORTED_SINGLE_ASTERIK_PATTERN = "*";
//const SUPPORTED_SINGLE_FORWARD_SLASH_PATTERN = "/";

const AUTH_HEADER_REGEX = /Bearer (.+)/;
const PRIVATE_JWT_VALUES = ['application_name', 'client_id', 'api_product_list', 'iat', 'exp'];

//
const DEFAULT_TOKEN_CACHE_SIZE = 100;
const DEFAULT_HAS_TOKEN_CACHE = false;


// from Babel .. then changed
function _objectWithoutProperties(obj, keys) {
    var target = {};
    var objkeys = Object.keys(obj);

    var useKeys = objkeys.filter(key => {
        return(keys.indexOf(key) < 0)
    });
    
    var n = useKeys.length;
    for ( var i = 0; i < n; i++ ) {
        var ky = useKeys[i];
        target[ky] = obj[ky];
    }

    return target;
}



class BasicAuthorizerPlugin {

    // ---- 
    constructor(config, logger, stats, authType) {
        //
        this.config = config;
        this.logger = logger;
        this.stats = stats;
        this.authType = authType;

        // should this be done?
        for ( var k in config ) {
            this[k] = config[k]
        }

        this.cacheEnabled = false;
        this.authType = authType;

        this.keys = config.jwk_keys ? JSON.parse(config.jwk_keys) : null;

        //
        this.acceptField = {};
        this.acceptField.alg = acceptAlg;
        //

        this.productOnly = false;

        this.updateConfig(config)
        //
    }

   

    updateConfig(config) {

        this.code = '200';

        this.authHeaderName = config.hasOwnProperty('authorization-header') ? config['authorization-header'] : 'authorization';
        this.keepAuthHeader = config.hasOwnProperty('keep-authorization-header') ? config['keep-authorization-header'] : false;

        //token cache settings
        this.tokenCache = config.hasOwnProperty('tokenCache') ? config.tokenCache : DEFAULT_HAS_TOKEN_CACHE;
        //max number of tokens in the cache
        this.tokenCacheSize = config.hasOwnProperty('tokenCacheSize') ? config.tokenCacheSize : DEFAULT_TOKEN_CACHE_SIZE;

        //
        var gracePeriod = config.hasOwnProperty('gracePeriod') ? config.gracePeriod : 0;
        this.acceptField.gracePeriod = gracePeriod;
        this.i_gracePeriod = parseInt(this.acceptField.gracePeriod);
        //

        //this flag will enable check against resource paths only
        this.productOnly = config.hasOwnProperty('productOnly') ? config.productOnly : false;
        //if local proxy is set, ignore proxies
        if ( process.env.EDGEMICRO_LOCAL_PROXY === "1" ) {
            this.productOnly = true;
        }

        this.apiKey = false;
       

    }

    setNext(next) {
        this.next = next;
    }

    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    enableCache() {
        this.cacheEnabled = true;
        this.cache =_enableCache();
    }

    // this should be in a separate module. This code is being copied from instance to instance.
    ejectToken(expTimestampInSeconds) {
        var currentTimestampInSeconds = new Date().getTime() / 1000;
        var gracePeriod = this.i_gracePeriod;
        return currentTimestampInSeconds > (expTimestampInSeconds + gracePeriod);
    }

    // -------- -------- -------- -------- -------- --------

    missingAuthorization(req, res) {
        debug('missing_authorization');
        return this.sendError(req, res, this.next, this.logger, this.stats, 'missing_authorization', 'Missing Authorization header');
    }

    invalidAuthorization(req, res) {
        debug('Invalid Authorization Header');
        return this.sendError(req, res, this.next, this.logger, this.stats, 'invalid_request', 'Invalid Authorization header');
    }

    invalidToken(req, res) {
        debug('invalid token');
        return this.sendError(req, res, this.next, this.logger, this.stats, 'invalid_token','token could not be parsed');
    }

    accessDenied(req, res, message){
        debug('access_denied:: ' + message);
        return this.sendError(req, res, this.next, this.logger, this.stats, 'access_denied', message);
    }


    // -------- -------- -------- -------- -------- --------

    matchHeader(req, res, authHeader) {
        //
        var header = AUTH_HEADER_REGEX.exec(authHeader);
        //
        if ( !this.allowInvalidAuthorization ) {
            if ( !header || (header.length < 2) ) {
                debug('Invalid Authorization Header');
                var code = this.invalidAuthorization(req, res);
                return([false,code])
            }
        }

        return([true,header])
    }

    tokenFromHeader(req,res,authHeader) {

        if ( (authHeader === undefined) || !(authHeader) ) return(false);

        var [matches,header] = this.matchHeader(req,res,authHeader)

        if ( matches ) {
            //
            if ( !this.keepAuthHeader ) {
                delete(req.headers[this.authHeaderName]); // don't pass this header to target
            }
            //
            var token = '';
            if ( header ) {
                token = header[1];
            }
            //
            return(token)
        }

        return(false)
    }

    authFromToken(req,res,authHeader) {
        var token = this.tokenFromHeader(req,res,authHeader);
        if ( token ) {
            this.verify(token, req, res);
            return(true);
        } else {
            // another failed authorization...
            return(false);
        }
    }

    validateOutOfCacheToken(decodedToken,oauthtoken) {
        var isValid = false;
        try {
            if ( this.keys ) {
                debug('using jwk');
                var pem = this.getPEM(decodedToken, this.keys );
                isValid = JWS.verifyJWT(oauthtoken, pem, this.acceptField);
            } else {
                debug('validating jwt');
                isValid = JWS.verifyJWT(oauthtoken, this.config.public_key, this.acceptField);
            }
        } catch (error) {
            // TODO: convert to logger.eventLog
            this.logger.consoleLog('warn',{component: CONSOLE_LOG_TAG_COMP}, 'error parsing jwt: ' + oauthtoken);
        }
        return(isValid)
    }

    tryValidationBipass(req, res) {
        if ( this.allowInvalidAuthorization ) {
            // TODO: convert to logger.eventLog
            this.logger.consoleLog('warn', {component: CONSOLE_LOG_TAG_COMP}, 'ignoring err in verify no valid JWT');
            return this.next();
        } else {
            return this.invalidToken(req, res);
        }
    }


    // -------- -------- -------- -------- -------- --------


    manageTokenExpiration(decodedToken,oauthtoken) {
        if ( this.ejectToken(decodedToken.payloadObj.exp) ) {
            debug('ejecting token from cache');
            map.remove(oauthtoken);
        }
    }

    storeOrUpdateToken(tokenvalue,decodedToken) {
        if ( (tokenvalue === null) || (tokenvalue === undefined) ) {
            map.size(function(err, sizevalue) {
                if ( !err && (sizevalue !== null) && (sizevalue < this.tokenCacheSize) ) {
                    map.store(tokenvalue, tokenvalue, decodedToken.payloadObj.exp);
                } else {
                    debug('too many tokens in cache; ignore storing token');
                }
            });
        }
    }


    ifCachingCache(/*req,decodedToken*/) {    // override with these parameters
        // override
    }



    // -------- -------- -------- -------- -------- --------


     
    verify(token, req, res) {

        var next = this.next;

        var isValid = false;
        var oauthtoken = (token && token.token) ? token.token : token;
        var decodedToken = null;
        //
        try {
			decodedToken = JWS.parse(oauthtoken);
		} catch (err) {
            if ( this.allowInvalidAuthorization ) {
                // TODO: convert to logger.eventLog
                this.logger.consoleLog('warn', {component: CONSOLE_LOG_TAG_COMP},'ignoring err');
                return next();
            } else {
                return this.invalidToken(req, res);
            }
		}
        //
        if ( this.tokenCache === true ) {
            debug('token caching enabled')
            map.read(oauthtoken, (err, tokenvalue) => {
                //
                isValid = false;
                var cachedTokenMatches = (tokenvalue !== undefined) && (tokenvalue !== null) && (tokenvalue === oauthtoken);
                //
                if ( !err && cachedTokenMatches ) {
                    debug('found token in cache');
                    isValid = true;
                    this.manageTokenExpiration(decodedToken,oauthtoken)
                } else {
                    debug('token not found in cache');
                    isValid = this.validateOutOfCacheToken(decodedToken,oauthtoken);
                    if ( !isValid ) {
                        return(this.tryValidationBipass(req, res))
                    } else {
                        tokenvalue = oauthtoken
                    }
                }

                if ( isValid ) {
                    //
                    this.storeOrUpdateToken(tokenvalue,decodedToken)
                    this.authorize(req, res, decodedToken.payloadObj)
                    //
                }
            });
        } else {
            debug('token cache not in use');
            isValid = this.validateOutOfCacheToken(decodedToken,oauthtoken);
            if ( !isValid ) {
                return(this.tryValidationBipass(req, res))
            } else {
                this.authorize(req, res, decodedToken.payloadObj);
            }
        }
    }

    
    // -------- -------- -------- -------- -------- --------

    getPEM(decodedToken, keys) {
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


    authorize(req, res, decodedToken) {
        //
        if ( this.checkIfAuthorized(this.config, req.reqUrl.path, res.proxy, decodedToken) ) {
            req.token = decodedToken;
            //
            var authClaims = _objectWithoutProperties(decodedToken, PRIVATE_JWT_VALUES);
            req.headers['x-authorization-claims'] = new Buffer(JSON.stringify(authClaims)).toString('base64');
            //
            this.ifCachingCache(req,decodedToken)
            //
            this.next();
        } else {
            return this.accessDenied(req, res, 'authorize: access_denied')
        }
        //
    }

    /// --------

    checkIfAuthorized(urlPath, proxy, decodedToken) {

        var parsedUrl = url.parse(urlPath);
        //
        debug('product only: ' + this.productOnly);
        //

        if ( !decodedToken.api_product_list ) {
            debug('no api product list');
            return false;
        }

        // return true if one is found
        return decodedToken.api_product_list.some((product) => {

            const validProxyNames = this.config.product_to_proxy[product];

            if ( !this.productOnly ) {
                if ( !validProxyNames ) {
                    debug('no proxies found for product');
                    return false;
                }
            }

            const apiproxies = this.config.product_to_api_resource[product];

            var matchesProxyRules = false;  // return value

            if ( apiproxies && apiproxies.length ) {

                //  an implementation of some...
                matchesProxyRules = apiproxies.some( tempApiProxy => {
                    
                    urlPath = parsedUrl.pathname;
                    const apiproxy = tempApiProxy.includes(proxy.base_path) ?
                                                            tempApiProxy :
                                                            proxy.base_path + (tempApiProxy.startsWith("/") ? "" : "/") + tempApiProxy
                    
                    if (apiproxy.endsWith("/") && !urlPath.endsWith("/")) {
                        urlPath = urlPath + "/";
                    }

                    if ( apiproxy.includes(SUPPORTED_DOUBLE_ASTERIK_PATTERN) ) {
                        const regex = apiproxy.replace(/\*\*/gi, ".*")
                        return(urlPath.match(regex) !== null )
                    } else {
                        if ( apiproxy.includes(SUPPORTED_SINGLE_ASTERIK_PATTERN) ) {
                            const regex = apiproxy.replace(/\*/gi, "[^/]+");
                            return(urlPath.match(regex) !== null )
                        } else {
                            // if(apiproxy.includes(SUPPORTED_SINGLE_FORWARD_SLASH_PATTERN)){
                            // }
                            return(urlPath === apiproxy);
                        }
                    }

                });

            } else {
                matchesProxyRules = true
            }

            //debug("matches proxy rules: " + matchesProxyRules);
            //add pattern matching here
            if ( !(this.productOnly) )
                return matchesProxyRules && (validProxyNames.indexOf(proxy.name) >= 0);
            else
                return matchesProxyRules;
        });

    }  // end of checkIfAuthorized


    setResponseCode(res,code) {
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
    

    // General error handling for authorization failures.
    sendError(req, res, next, logger, stats, code, message) {

        this.setResponseCode(res,code);
    
        var response = {
            error: code,
            error_description: message
        };
        const err = Error(message);
        debug('auth failure', res.statusCode, code, message ? message : '', req.headers, req.method, req.url);
        if ( logger && logger.error && (typeof logger.error === 'function') ) {
            logger.eventLog({level:'error', req: req, res: res, err:err, component:'basicAuth' }, 'oauth');
        }
    
        //opentracing
        if ( process.env.EDGEMICRO_OPENTRACE ) {
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
                // TODO: convert to logger.eventLog
                logger.consoleLog('warn',{component: CONSOLE_LOG_TAG_COMP}, "oath response object lacks setHeader");
            }
        }
    
        try {
            res.end(JSON.stringify(response));
        } catch (e) {
            // TODO: convert to logger.eventLog
            logger.consoleLog('warn',{component: CONSOLE_LOG_TAG_COMP}, "oath response object is not supplied by runtime");
        }
        
        try {
            stats.incrementStatusCount(res.statusCode);
        } catch (e) {
            // TODO: convert to logger.eventLog
            logger.consoleLog('warn',{component: CONSOLE_LOG_TAG_COMP}, "oath stats object is not supplied by runtime");
        }
    
        next(code, message);
        return code;
    }
    
}  // end of BasicAuthorizerPlugin class definition.




module.exports.BasicAuthorizerPlugin = BasicAuthorizerPlugin;


module.exports.tests = {
    initTest : (authType, config, logger, stats) => {
        var authObj = new BasicAuthorizerPlugin(config, logger, stats, authType);
        return(authObj);
    },
    test_objectWithoutProperties : _objectWithoutProperties
}
