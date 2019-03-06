'use strict';

var async = require('async');
var Quota = require('volos-quota-apigee');
var debug = require('debug')('gateway:quota');

module.exports.init = function(config, logger, stats) {

    const { product_to_proxy, proxies } = config;
    const prodsObj = {};
    var quotas = {}; // productName -> connectMiddleware
    var options = {
        key: function(req) {
            return req.token.application_name;
        }
    };

    Object.keys(config).forEach(function(productName) {
        var product = config[productName];
        if (!product.uri && !product.key && !product.secret && !product.allow && !product.interval || product.interval === "null") {
            // skip non-quota config
            debug('Quota not configured on the API product, skipping. This message is safe to ignore');
            return;
        }

        if(product.timeUnit === 'month') {
            product.timeUnit === '30days';
        };

        const prodProxiesArr = product_to_proxy[productName];

        const prodObj = {};
        if (Array.isArray(prodProxiesArr)) {
            prodProxiesArr.reduce((acc, val) => {
                acc[val] = true;
                return acc;
            }, prodObj);
        }

        const basePaths = {};
        if (Array.isArray(proxies)) {
            proxies.reduce((acc, prox) => {
                if (prox.name !== 'edgemicro-auth' && prodObj[prox.name] === true) acc[prox.base_path] = true;
                return acc;
            }, basePaths);
        }

        prodObj.basePaths = basePaths;
        prodsObj[productName] = prodObj;

        config[productName].request = config.request;
        var quota = Quota.create(config[productName]);
        quotas[productName] = quota.connectMiddleware().apply(options);
        debug('created quota for', productName);
    });

    var middleware = function(req, res, next) {

        if (!req.token || !req.token.api_product_list || !req.token.api_product_list.length) {
            return next();
        }

        debug('quota checking products', req.token.api_product_list);

        req.originalUrl = req.originalUrl || req.url; // emulate connect

        const prodList = [];
        if (Array.isArray(req.token.api_product_list)) {
            req.token.api_product_list.reduce((acc, prod) => {
                if (prodsObj[prod] && 
                    prodsObj[prod].basePaths && 
                    prodsObj[prod].basePaths[req.url] === true) acc.push(prod);
                return acc;
            }, prodList);

            debug('prodList');
            debug(prodList);
        }

        // this is arbitrary, but not sure there's a better way?
        // async.eachSeries(req.token.api_product_list,
        async.eachSeries(prodList,
            function(productName, cb) {
                var connectMiddleware = quotas[productName];
                debug('applying quota for', productName);
                connectMiddleware ? connectMiddleware(req, res, cb) : cb();
            },
            function(err) {
                next(err);
            }
        );
    }

    return {

        testprobe: function() {
            return quotas
        },

        onrequest: function(req, res, next) {
            if (process.env.EDGEMICRO_LOCAL) {
                debug("MG running in local mode. Skipping Quota");
                next();
            } else {
                middleware(req, res, next);
            }
        }

    }
};
