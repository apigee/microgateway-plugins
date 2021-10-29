'use strict';
/**
 *
 */

var debug = require('debug')('plugin:extauth');
var request = require('request');
var rs = require('jsrsasign');
var JWS = rs.jws.JWS;

const authHeaderRegex = /Bearer (.+)/;
const acceptAlg = ['RS256'];

var acceptField = {};
acceptField.alg = acceptAlg;
const CONSOLE_LOG_TAG_COMP = 'microgateway-plugins extauth';
const LOG_TAG_COMP = 'extauth';

module.exports.init = function(config, logger, stats) {

    var publickeys = {};
    var publickey_url = config["publickey_url"];
    var client_id = config.hasOwnProperty("client_id") ? config.client_id : 'client_id';
    var iss = config["iss"];
    //set keyType to pem if the endpoint returns a single pem file
    var keyType = config.hasOwnProperty("keyType") ? config.keyType : 'jwk';
    //check for jwt expiry
    var exp = config.hasOwnProperty('exp') ? config.exp : true;
    //return error from plugin
    var sendErr = config.hasOwnProperty("sendErr") ? config.sendErr : true;
    //preserve or delete the auth header
    var keepAuthHeader = config.hasOwnProperty('keep-authorization-header') ? config['keep-authorization-header'] : false;
    //get public key from config
    var public_keys = config.public_keys? config['public_keys'] : null;

    if (iss) {
        debug("Issuer " + iss);
        acceptField.iss = [];
        acceptField.iss[0] = iss;
    }

    if (public_keys) {
        if (keyType === 'jwk') {
            debug("keyType is jwk");
            try {
                publickeys = JSON.parse(public_keys);
            } catch(e) {
                logger.consoleLog('log', {component: CONSOLE_LOG_TAG_COMP}, e.message );
            }
        } else {
            //the body should contain a single pem
            publickeys = public_keys;
        }
    }

    function getJWK(kid) {
        if (publickeys.keys && publickeys.keys.constructor === Array) {
            for (var i = 0; i < publickeys.keys.length; i++) {
                if (publickeys.keys[i].kid === kid) {
                    return publickeys.keys[i];
                }
            }
            debug("no public key that matches kid found");
            return null;
        } else if (publickeys[kid]) { //handle cases like https://www.googleapis.com/oauth2/v1/certs
            return publickeys[kid];
        } else { //if the publickeys url does not return arrays, then use the only public key
            if (keyType === 'jwk' && !public_keys.keys) {
                return null;
            }
            debug("returning default public key");
            return publickeys;
        }
    }

    function validateJWT(pem, payload, exp) {
        var isValid = false;
        if (exp) {
            debug("JWT Expiry enabled");
            acceptField.verifyAt = rs.KJUR.jws.IntDate.getNow();
            try {
                isValid = rs.jws.JWS.verifyJWT(payload, pem, acceptField);
            } catch(e) {
                logger.consoleLog('log', {component: CONSOLE_LOG_TAG_COMP}, e.message );
            }
        } else {
            debug("JWT Expiry disabled");
            try {
                isValid = rs.jws.JWS.verify(payload, pem, acceptAlg);
            } catch(e) {
                logger.consoleLog('log', {component: CONSOLE_LOG_TAG_COMP}, e.message );
            }
        }
        return isValid;
    }

    return {
        onrequest: function(req, res, next) {
            debug('plugin onrequest');
            var isValid = false;
            try {
                var jwtpayload = authHeaderRegex.exec(req.headers['authorization']);

                if ( !(jwtpayload) || (jwtpayload.length < 2) ) {
                    debug("ERROR - JWT Token Missing in Auth header");
                    delete(req.headers['authorization']);
                    delete(req.headers['x-api-key']);
                    if (sendErr) {
                        return sendError(req, res, next, logger, stats, 'missing_authorization', 'missing_authorization');
                    }
                } else {
                    var jwtdecode = JWS.parse(jwtpayload[1]);
                    if ( jwtdecode.headerObj ) {
                        var kid = jwtdecode.headerObj.kid;
                        debug("Found jwt kid: " + kid);
                        if ( keyType !== 'jwk' ) {
                            debug("key type is PEM");
                            isValid = validateJWT(publickeys, jwtpayload[1], exp);
                            if (isValid) {
                                if (!keepAuthHeader) {
                                    delete(req.headers['authorization']);
                                }
                                req.headers['x-api-key'] = jwtdecode.payloadObj[client_id];
                            } else {
                                debug("ERROR - JWT is invalid");
                                delete(req.headers['authorization']);
                                delete(req.headers['x-api-key']);
                                if (sendErr) {
                                    return sendError(req, res, next, logger, stats, 'invalid_token','invalid_token');
                                }                                
                            }
                        } else if (!kid && keyType === 'jwk') {
                            debug("ERROR - JWT Missing kid in header");
                            delete(req.headers['authorization']);
                            delete(req.headers['x-api-key']);
                            if (sendErr) {
                                return sendError(req, res, next, logger, stats, 'invalid_token','invalid_token');
                            }
                        } else {
                            var jwk = getJWK(kid);
                            if (!jwk) {
                                debug("ERROR - Could not find public key to match kid");
                                delete(req.headers['authorization']);
                                delete(req.headers['x-api-key']);
                                if (sendErr) {
                                    return sendError(req, res, next, logger, stats, 'invalid_authorization','invalid_authorization');
                                }                                
                            } else {
                                debug("Found JWK");
                                var publickey = rs.KEYUTIL.getKey(jwk);
                                var pem = rs.KEYUTIL.getPEM(publickey);
                                isValid = validateJWT(pem, jwtpayload[1], exp);
                                if (isValid) {
                                    debug("JWT is valid");
                                    if (!keepAuthHeader) {
                                        delete(req.headers['authorization']);
                                    }
                                    req.headers['x-api-key'] = jwtdecode.payloadObj[client_id];
                                } else {
                                    debug("ERROR - JWT is invalid");
                                    delete(req.headers['authorization']);
                                    delete(req.headers['x-api-key']);
                                    if (sendErr) {
                                        return sendError(req, res, next, logger, stats, 'access_denied', 'JWT is invalid');
                                    }                                    
                                }
                            }
                        }
                    } else {
                        debug("ERROR - Missing header in JWT");
                        delete(req.headers['authorization']);
                        delete(req.headers['x-api-key']);
                        if (sendErr) {
                            return sendError(req, res, next, logger, stats,'missing_authorization', 'missing_authorization');
                        }
                    }
                }
            } catch (err) {
                debug("ERROR - " + err);
                delete(req.headers['authorization']);
                delete(req.headers['x-api-key']);
                if (sendErr) {
                    return sendError(req, res, next, logger, stats,'invalid_authorization', 'invalid_authorization');
                }
            }
            next();
        }
    };
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

function sendError(req, res, next, logger, stats, code, message) {

    setResponseCode(res,code)

    var response = {
        error: code,
        error_description: message
    };
    const err = Error(message)
    debug('auth failure', res.statusCode, code, message ? message : '', req.headers, req.method, req.url);
    logger.eventLog({level:'error', req: req, res: res, err:err, component:LOG_TAG_COMP }, message);

    //opentracing
    if (process.env.EDGEMICRO_OPENTRACE) {
        const traceHelper = require('../microgateway-core/lib/trace-helper');
        traceHelper.setChildErrorSpan('extauth', req.headers);    
    }
    //    

    if (!res.finished) res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(response));
    stats.incrementStatusCount(res.statusCode);
    next(code, message);
    return code;
}