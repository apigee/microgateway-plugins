'use strict';

var debug = require('debug')('plugin:oauthv2');

var basicAuth = require('../lib/basicAuth')
//

module.exports.init = function(config, logger, stats) {

    if ( config === undefined || !config ) return(undefined);

    var authObj = new basicAuth.BasicAuthorizerPlugin(config, logger, stats,'oauthv2');

    // middleware
    var middleware = (req, res, next) => {

        if ( !req || !res ) return(-1); // need to check bad args 
        if ( !req.headers ) return(-1); // or throw -- means callers are bad

        authObj.updateConfig(config)
        //
        authObj.setNext(next);

        // PARAMETERS FROM REQUEST OBJECT
        var authHeader = req.headers[this.authHeaderName]
        var haveAuthHeader = (authHeader !== undefined) && authHeader;

        if ( !haveAuthHeader ) {
            if ( config.allowNoAuthorization ) {
                return next();
            } else {
                return(authObj.missingAuthorization(req, res, next));
            }
        } else {
            return( authObj.authFromToken(req,res,authHeader) )
        }

    } // end of middleware

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
        }

    };

}  // end of init

// from the product name(s) on the token, find the corresponding proxy
// then check if that proxy is one of the authorized proxies in bootstrap
//
module.exports.checkIfAuthorized = basicAuth.checkIfAuthorized;
module.exports.tests = basicAuth.tests
