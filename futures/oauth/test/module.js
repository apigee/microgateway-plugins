var assert = require('assert')
var oauth = require('../index.js')
var config = {
  "verify_api_key_url":"https://sfeldmanmicro-test.apigee.net/edgemicro-auth/verifyApiKey",
  "product_to_proxy":{"EdgeMicroTestProduct":["edgemicro_weather"]},
  "product_to_api_resource":{"EdgeMicroTestProduct":["/hello/blah/*/foo*","/hello/some/**","/hello/blah"]}
};
var config2 = {
  "verify_api_key_url":"https://sfeldmanmicro-test.apigee.net/edgemicro-auth/verifyApiKey",
  "product_to_proxy":{"EdgeMicroTestProduct":["edgemicro_weather"]},
  "product_to_api_resource":{"EdgeMicroTestProduct":[]}
};
var config3 = {
  "verify_api_key_url":"https://sfeldmanmicro-test.apigee.net/edgemicro-auth/verifyApiKey",
  "product_to_proxy":{"EdgeMicroTestProduct":["edgemicro_weather"]},
  "product_to_api_resource":{"EdgeMicroTestProduct":["/blah/*/foo*","/some/**","blah"]}
};

var proxy = {name:'edgemicro_weather',base_path:'/hello'}

var token = {api_product_list:['EdgeMicroTestProduct']}
describe('test oauth',function(){
  it('checkIfAuthorized',function (done) {
    var contains;
    contains = oauth.checkIfAuthorized(config,'/hello',proxy,token);
    assert(!contains)
    contains = oauth.checkIfAuthorized(config,'/hello/blah',proxy,token);
    assert(contains)
    contains = oauth.checkIfAuthorized(config,'/hello/blah/somerule/foosomething',proxy,token);
    assert(contains)
    contains = oauth.checkIfAuthorized(config,'/hello/blah/somerule/ifoosomething',proxy,token);
    assert(!contains)
    contains = oauth.checkIfAuthorized(config,'/hello/some/somerule/foosomething',proxy,token);
    assert(contains)
    done()
  })
  it('checkIfAuthorizedNoConfig',function (done) {
    var contains;
    contains = oauth.checkIfAuthorized(config2,'/hello',proxy,token);
    assert(contains)
    contains = oauth.checkIfAuthorized(config2,'/hello/blah',proxy,token);
    assert(contains)
    contains = oauth.checkIfAuthorized(config2,'/hello/blah/somerule/foosomething',proxy,token);
    assert(contains)
    contains = oauth.checkIfAuthorized(config2,'/hello/blah/somerule/ifoosomething',proxy,token);
    assert(contains)
    contains = oauth.checkIfAuthorized(config2,'/hello/some/somerule/foosomething',proxy,token);
    assert(contains)
    done()
  })
  it('checkIfAuthorized3',function (done) {
    var contains;
    contains = oauth.checkIfAuthorized(config3,'/hello',proxy,token);
    assert(!contains)
    contains = oauth.checkIfAuthorized(config3,'/hello/blah',proxy,token);
    assert(contains)
    contains = oauth.checkIfAuthorized(config3,'/hello/blah/somerule/foosomething',proxy,token);
    assert(contains)
    contains = oauth.checkIfAuthorized(config3,'/hello/blah/somerule/ifoosomething',proxy,token);
    assert(!contains)
    contains = oauth.checkIfAuthorized(config3,'/hello/some/somerule/foosomething',proxy,token);
    assert(contains)
    done()
  })
})
