'use strict'
//export all modules
module.exports = {
  'accumulate-request':require('./accumulate-request'),
  'accumulate-response':require('./accumulate-response'),
  analytics:require('./analytics'),
  'header-uppercase':require('./header-uppercase'),
  oauth:require('./oauth'),
  quota:require('./quota'),
  'quota-memory':require('./quota-memory'),
  spikearrest:require('./spikearrest'),
  'transform-uppercase':require('./transform-uppercase'),
  accesscontrol:require('./accesscontrol'),
  eurekaclient:require('./eurekaclient'),
  json2xml: require('./json2xml'),
  healthcheck: require('./healthcheck'),
  'cloud-foundry-route-service': require('./cloud-foundry-route-service'),
  bauth: require('./bauth'),
  cors: require('./cors'),
  monitor: require('./monitor'),
  apikeys: require('./apikeys'),
  oauthv2: require('./oauthv2'),
  extauth: require('./extauth'),
  invalidHeader: require('./invalidHeader')
}
