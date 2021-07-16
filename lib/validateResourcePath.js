'use strict';

var url = require('url');
var debug_ = require('debug');
const debugs = {};
const DOUBLE_STAR_PLACEHOLDER = '@@@@';
const SUPPORTED_SINGLE_FORWARD_SLASH_PATTERN = "/";

module.exports = function (config, req, res, decodedToken, productOnly, logger, componentName) {

    if (config === undefined || !config) return (undefined);
    if (req === undefined || !req) return (undefined);
    if (res === undefined || !res) return (undefined);

    const proxy = res.proxy;
    let urlPath = req.reqUrl.path;

    // Cache the dynamic debug instances, to avoid a memory leak due to a bug currently present in the debug package.
    // See https://github.com/visionmedia/debug/issues/678
    var debug = debugs[componentName];
    if (!debug) {
        debug = debug_('plugin:' + componentName);
        debugs[componentName] = debug;
    }

    var parsedUrl = url.parse(urlPath);
    debug('product only: ' + productOnly);
    if (!decodedToken.api_product_list) {
        debug('no api product list');
        return false;
    }

    return decodedToken.api_product_list.some(function (product) {

        const validProxyNames = config.product_to_proxy[product];

        if (!productOnly) {
            if (!validProxyNames) {
                debug('no proxies found for product');
                return false;
            }
        }

        const resourcePaths = config.product_to_api_resource[product];
        var matchesProxyRules = false;
        if (resourcePaths && resourcePaths.length) {
            resourcePaths.forEach(function (productResourcePath) {
                if (matchesProxyRules) {
                    //found one
                    debug('found matching proxy rule');
                    return;
                }
                if (productResourcePath === SUPPORTED_SINGLE_FORWARD_SLASH_PATTERN) {
                    matchesProxyRules = true;
                } else {
                    urlPath = parsedUrl.pathname;

                    let apiproxy = productResourcePath.includes(proxy.base_path) ?
                        productResourcePath :
                        proxy.base_path + (productResourcePath.startsWith("/") ? "" : "/") + productResourcePath;

                    if (!apiproxy.endsWith("/") && urlPath.endsWith("/") && (productResourcePath.lastIndexOf("/") === 0)) {
                        apiproxy = apiproxy + "/";
                    }

                    let placeholder = DOUBLE_STAR_PLACEHOLDER;

                    while (apiproxy.indexOf(placeholder) !== -1) {
                        placeholder = '_' + DOUBLE_STAR_PLACEHOLDER + '_' + placeholder + '_';
                    }

                    let regExPatternStr = apiproxy.replace(/\*\*/g, placeholder);
                    regExPatternStr = regExPatternStr.replace(/\*/g, '[^/]+');
                    placeholder = new RegExp(placeholder, "g");

                    regExPatternStr = regExPatternStr.replace(placeholder, '.*');

                    try {
                        var proxyRegEx = new RegExp(`^${regExPatternStr}$`, 'ig');
                        matchesProxyRules = urlPath.match(proxyRegEx);
                    } catch (e) {
                        debug('Exception in generating regex for the pattern :', proxyRegEx);
                        logger.eventLog({ level: 'warn', req: req, res: res, err: e, component: componentName }, 'Exception in generating regex for the pattern');
                    }

                }
            })

        } else {
            matchesProxyRules = true;
        }

        debug("matches proxy rules: " + matchesProxyRules);

        //add pattern matching here
        if (!productOnly) {
            return matchesProxyRules && validProxyNames.indexOf(proxy.name) >= 0;
        } else {
            return matchesProxyRules;
        }
    });
}
