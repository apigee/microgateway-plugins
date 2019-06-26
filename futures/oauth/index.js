'use strict';

var debug = require('debug')('plugin:oauth');

var basicAuth = require('../lib/basicAuth');
//
var fs = require('fs');
var path = require('path');
var requestLib = require('request');


class apiKeyAuthorization extends basicAuth.BasicAuthorizerPlugin {

    constructor(config, logger, stats, authType) {
        //
        super(config, logger, stats, authType);

        this.request = config.request ? requestLib.defaults(config.request) : requestLib;

        this.cacheKey = false;

        this.enableCache();

        this.updateConfig2(config);
    }

    updateConfig2(config) {
        super.updateConfig();
        //
        this.apiKeyHeaderName = config.hasOwnProperty('api-key-header') ? config['api-key-header'] : 'x-api-key';
        this.cacheKey = config.hasOwnProperty('cacheKey') ? config.cacheKey : false;

        //support for enabling oauth or api key only
        this.oauth_only = config.hasOwnProperty('allowOAuthOnly') ? config.allowOAuthOnly : false;
        this.apikey_only = config.hasOwnProperty('allowAPIKeyOnly') ? config.allowAPIKeyOnly : false;
    }

    // -------- -------- -------- -------- -------- --------

    missingApiKey(req,res) {
        debug('missing api key');
        return this.sendError(req, res, this.next, this.logger, this.stats, 'invalid_authorization', 'Missing API Key header');
    }

    apikeyGatewayTimeout(req, res, message) {
        debug('verify apikey gateway timeout');
        return this.sendError(req, res, this.next, this.logger, this.stats, 'gateway_timeout', message);
    }

    // -------- -------- -------- -------- -------- --------

    // 
    exchangeApiKeyForToken(req, res, apiKey) {

        this.setApiKey(apiKey)

        var cacheControl = req.headers['cache-control'] || 'no-cache';
        var cacheAllowed = ( !cacheControl || (cacheControl && cacheControl.indexOf('no-cache') < 0) );

        if ( this.cacheEnabled || cacheAllowed ) { // caching is allowed
            //
            this.cache.read(apiKey, function(err, value) {
                if ( err ) {
                    //
                }
                if ( value ) {
                    if ( (Date.now() / 1000) < value.exp ) { // not expired yet (token expiration is in seconds)
                        debug('api key cache hit', apiKey);
                        return this.authorize(req, res, value);
                    } else {
                        this.cache.remove(apiKey);
                        debug('api key cache expired', apiKey);
                        this.requestApiKeyJWT(req, res);
                    }
                } else {
                    debug('api key cache miss', apiKey);
                    this.requestApiKeyJWT(req, res);
                }
            });
        } else {
            this.requestApiKeyJWT(req, res);
        }

    }


    ifCachingCache(req,decodedToken) {
        if ( (this.apiKey !== undefined) && this.apiKey ) {
            var cacheControl = req.headers['cache-control'] || 'no-cache';
            if ( this.cacheEnabled || this.cacheKey || (!cacheControl || (cacheControl && cacheControl.indexOf('no-cache') < 0)) ) { // caching is allowed
                // default to now (in seconds) + 30m if not set
                decodedToken.exp = decodedToken.exp || +(((Date.now() / 1000) + 1800).toFixed(0));
                this.cache.store(this.apiKey, decodedToken,decodedToken.exp);
                debug('api key cache store', this.apiKey);
            } else {
                debug('api key cache skip', this.apiKey);
            }
        }
    }


    setApiKeyOptions() {

        var api_key_options = {
            url: this.config.verify_api_key_url,
            method: 'POST',
            json: {
                'apiKey': this.apiKey
            },
            headers: {
                'x-dna-api-key': this.apiKey
            }
        };

        var agentOptions = this.config.agentOptions;

        if ( agentOptions ) {
            if ( agentOptions.requestCert ) {
                api_key_options.requestCert = true;
                if ( agentOptions.cert && agentOptions.key ) {
                    var keyPath = path.resolve(agentOptions.key)
                    api_key_options.key = fs.readFileSync(keyPath, 'utf8');
                    var certPath = path.resolve(agentOptions.cert)
                    api_key_options.cert = fs.readFileSync(certPath,'utf8');
                    if ( agentOptions.ca ) {
                        var caPath = path.resolve(agentOptions.ca)
                        api_key_options.ca = fs.readFileSync(caPath, 'utf8');
                    }
                } else if ( agentOptions.pfx ) {
                    var pfxPath = path.resolve(agentOptions.pfx)
                    api_key_options.pfx = fs.readFileSync(pfxPath);
                }
                if ( agentOptions.rejectUnauthorized ) {
                    api_key_options.rejectUnauthorized = true;
                }
                if ( agentOptions.secureProtocol ) {
                    api_key_options.secureProtocol = true;
                }
                if ( agentOptions.ciphers ) {
                    api_key_options.ciphers = agentOptions.ciphers;
                }
                if ( agentOptions.passphrase ) api_key_options.passphrase = agentOptions.passphrase;
            }
        }

        return(api_key_options)
    }
    
    requestApiKeyJWT(req, res) {

        if ( !(this.config.verify_api_key_url) ) return this.sendError(req, res, 'invalid_request', 'API Key Verification URL not configured');

        var api_key_options = this.setApiKeyOptions();

        var request = this.request;
        var self = this;
        
        request(api_key_options, function(err, keyRes, body) {
            if ( err ) {
                return this.apikeyGatewayTimeout(req, res, err.message)
            }
            if ( keyRes.statusCode !== 200 ) {
                return this.accessDenied(req, res, "api key:: " + keyRes.message)
            }
            self.verify(body, req, res);
        });


    }
}



module.exports.init = function(config, logger, stats) {

    if ( config === undefined || !config ) return(undefined);
    //
    var authObj = new apiKeyAuthorization(config, logger, stats,'oauth');

    var middleware = function(req, res, next) {

        if ( !req || !res ) return(-1); // need to check bad args 
        if ( !req.headers ) return(-1); // or throw -- means callers are bad

        authObj.updateConfig2(config)
        //
        authObj.setNext(next);

        // PARAMETERS FROM REQUEST OBJECT
        // prefer an authorization header if available
        var authHeader = req.headers[this.authHeaderName]
        var haveAuthHeader = (authHeader !== undefined) && authHeader;

        //  attempt to get a valid api key
        var apiKey = req.headers[this.apiKeyHeaderName]
        var haveApiKey =  (apiKey !== undefined) && apiKey;
        if ( !(haveApiKey) ) { // try alternative
            if ( req.reqUrl && req.reqUrl.query  ) {
                apiKey = req.reqUrl.query[this.apiKeyHeaderName];
                haveApiKey = (apiKey !== undefined) && apiKey;
            }
        }

        //
        //support for enabling oauth or api key only
        if ( authObj.oauth_only ) {
            if ( haveAuthHeader ) {
                var [matches,code] = authObj.matchHeader(authHeader)
                if ( !(matches) ) return(code)
            } else {
                // no header give it a chance to bipass
                if ( authObj.allowNoAuthorization ) {
                    return next();
                } else {
                    return( authObj.missingAuthorization(req, res) );
                }
            }
        } else if ( authObj.apikey_only ) {
            if ( !(haveApiKey) ) {
                return( authObj.missingApiKey(req,res) );
            }
        }

        //leaving rest of the code same to ensure backward compatibility
        if ( !(haveAuthHeader) || authObj.allowAPIKeyOnly ) {
            if ( haveApiKey ) {
                // API KEY ALTERNATIVE
                authObj.exchangeApiKeyForToken(req, res, apiKey);
                //
            } else if ( authObj.allowNoAuthorization ) {
                return next();
            } else {
                return( authObj.missingAuthorization(req, res) );
            }
        } else {
            return( authObj.authFromToken(req,res,authHeader) )
        }
    } // end of middleware

    return {

        onrequest: function(req, res, next) {
            if ( process.env.EDGEMICRO_LOCAL === "1" ) {
                debug ("MG running in local mode. Skipping OAuth");
                next();
            } else {
                middleware(req, res, next);
            }
        },

        shutdown() {
            // tests are needing shutdowns to remove services that keep programs running, etc.
        }

    };

}  // end of init

// from the product name(s) on the token, find the corresponding proxy
// then check if that proxy is one of the authorized proxies in bootstrap
//
module.exports.checkIfAuthorized = basicAuth.checkIfAuthorized;
module.exports.tests = basicAuth.tests
