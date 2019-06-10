'use strict';
/**
 *
 */

var _ = require('lodash');
var debug = require('debug')('plugin:extauth');
var request = require('request');
var rs = require('jsrsasign');
var JWS = rs.jws.JWS;

const authHeaderRegex = /Bearer (.+)/;
const acceptAlg = ['RS256'];

var acceptField = {};
acceptField.alg = acceptAlg;

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
    //extracts jwt claims from header authorization bearer jwt and adds them in a new header x-extauth-claims (default null for backward compatibility)
    var extauthClaimsHeader = config.hasOwnProperty('extauth-claims-header') ? config['extauth-claims-header'] : null;
    //sensitive claims to be omitted from extauth claims header, if enabled
    var PRIVATE_JWT_VALUES = config.hasOwnProperty('extauth-exclude-claims') ? config['extauth-exclude-claims'] : ['application_name', 'client_id', 'api_product_list', 'iat', 'exp'];
    
    if (iss) {
        debug("Issuer " + iss);
        acceptField.iss = [];
        acceptField.iss[0] = iss;
    }

    request({
        url: publickey_url,
        method: 'GET'
    }, function(err, response, body) {
        if (err) {
            debug('publickey gateway timeout');
            console.log(err);
        } else {
            debug("loaded public keys");
            if (keyType == 'jwk') {
                debug("keyType is jwk");
                publickeys = JSON.parse(body);
            } else {
                //the body should contain a single pem
                publickeys = body;
            }
        }
    });

    function getJWK(kid) {
        if (publickeys.keys && publickeys.keys.constructor == Array) {
            for (var i = 0; i < publickeys.keys.length; i++) {
                if (publickeys.keys[i].kid == kid) {
                    return publickeys.keys[i];
                }
            }
            debug("no public key that matches kid found");
            return null;
        } else if (publickeys[kid]) { //handle cases like https://www.googleapis.com/oauth2/v1/certs
            return publickeys[kid];
        } else { //if the publickeys url does not return arrays, then use the only public key
            debug("returning default public key");
            return publickeys;
        }
    }

    function validateJWT(pem, payload, exp) {
        var isValid = false;
        if (exp) {
            debug("JWT Expiry enabled");
            acceptField.verifyAt = rs.KJUR.jws.IntDate.getNow();
            isValid = rs.jws.JWS.verifyJWT(payload, pem, acceptField);
        } else {
            debug("JWT Expiry disabled");
            isValid = rs.jws.JWS.verify(payload, pem, acceptAlg);
        }
        return isValid;
    }

    return {
        onrequest: function(req, res, next) {
            debug('plugin onrequest');
            var isValid = false;
            try {
                var jwtpayload = authHeaderRegex.exec(req.headers['authorization']);

                if (!jwtpayload || jwtpayload.length < 2) {
                    debug("ERROR - JWT Token Missing in Auth header");
                    delete(req.headers['authorization']);
                    delete(req.headers['x-api-key']);
                    if (sendErr) {
                        return sendError(req, res, next, logger, stats, 'missing_authorization');
                    }
                } else {
                    var jwtdecode = JWS.parse(jwtpayload[1]);
                    if (jwtdecode.headerObj) {
                        var kid = jwtdecode.headerObj.kid;
                        debug("Found jwt kid: " + kid);
                        if (keyType != 'jwk') {
                            debug("key type is PEM");
                            isValid = validateJWT(publickeys, jwtpayload[1], exp);
                            if (isValid) {
                                if(extauthClaimsHeader) {
                                    var authClaims = _.omit(jwtdecode.payloadObj, PRIVATE_JWT_VALUES);
                                    req.headers[extauthClaimsHeader] = new Buffer(JSON.stringify(authClaims)).toString('base64');
                                }
                                if (!keepAuthHeader) {
                                    delete(req.headers['authorization']);
                                }
                                if (!sendErr) {
                                    //if this plugin is not sending errors, assume MG is not in local mode
                                    req.headers['x-api-key'] = jwtdecode.payloadObj[client_id];
                                }
                            } else {
                                debug("ERROR - JWT is invalid");
                                delete(req.headers['authorization']);
                                delete(req.headers['x-api-key']);
                                if (sendErr) {
                                    return sendError(req, res, next, logger, stats, 'invalid_token');
                                }                                
                            }
                        } else if (!kid && keyType == 'jwk') {
                            debug("ERROR - JWT Missing kid in header");
                            delete(req.headers['authorization']);
                            delete(req.headers['x-api-key']);
                            if (sendErr) {
                                return sendError(req, res, next, logger, stats, 'invalid_token');
                            }
                        } else {
                            var jwk = getJWK(kid);
                            if (!jwk) {
                                debug("ERROR - Could not find public key to match kid");
                                delete(req.headers['authorization']);
                                delete(req.headers['x-api-key']);
                                if (sendErr) {
                                    return sendError(req, res, next, logger, stats, 'invalid_authorization');
                                }                                
                            } else {
                                debug("Found JWK");
                                var publickey = rs.KEYUTIL.getKey(jwk);
                                var pem = rs.KEYUTIL.getPEM(publickey);
                                isValid = validateJWT(pem, jwtpayload[1], exp);
                                if (isValid) {
                                    debug("JWT is valid");
                                    if(extauthClaimsHeader) {
                                        var authClaims = _.omit(jwtdecode.payloadObj, PRIVATE_JWT_VALUES);
                                        req.headers[extauthClaimsHeader] = new Buffer(JSON.stringify(authClaims)).toString('base64');
                                    }
                                    if (!keepAuthHeader) {
                                        delete(req.headers['authorization']);
                                    }
                                    if (!sendErr) {
                                        //if this plugin is not sending errors, assume MG is not in local mode
                                        req.headers['x-api-key'] = jwtdecode.payloadObj[client_id];
                                    }
                                } else {
                                    debug("ERROR - JWT is invalid");
                                    delete(req.headers['authorization']);
                                    delete(req.headers['x-api-key']);
                                    if (sendErr) {
                                        return sendError(req, res, next, logger, stats, 'access_denied');
                                    }                                    
                                }
                            }
                        }
                    } else {
                        debug("ERROR - Missing header in JWT");
                        delete(req.headers['authorization']);
                        delete(req.headers['x-api-key']);
                        if (sendErr) {
                            return sendError(req, res, next, logger, stats, 'missing_authorization');
                        }
                    }
                }
            } catch (err) {
                debug("ERROR - " + err);
                delete(req.headers['authorization']);
                delete(req.headers['x-api-key']);
                if (sendErr) {
                    return sendError(req, res, next, logger, stats, 'invalid_authorization');
                }
            }
            next();
        }
    };
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
    }, 'extauth');

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