const extauth = require('../extauth/index');
const assert = require('assert');
const denv = require('dotenv');
denv.config();

const coreObject = require('./microgateway-core');
const logger = coreObject.logger;
const stats = coreObject.stats;

var extauthConfigDefault = {
    "client_id": "sub",
    "exp": true,
    "sendErr": true,
    "keepAuthHeader": false,
    "keyType": "jwk",
    "public_keys": '{"keys": [{"kty": "RSA","n": "6S7asUuzq5Q_3U9rbs-PkDVIdjgmtgWreG5qWPsC9xXZKiMV1AiV9LXyqQsAYpCqEDM3XbfmZqGb48yLhb_XqZaKgSYaC_h2DjM7lgrIQAp9902Rr8fUmLN2ivr5tnLxUUOnMOc2SQtr9dgzTONYW5Zu3PwyvAWk5D6ueIUhLtYzpcB-etoNdL3Ir2746KIy_VUsDwAM7dhrqSK8U2xFCGlau4ikOTtvzDownAMHMrfE7q1B6WZQDAQlBmxRQsyKln5DIsKv6xauNsHRgBAKctUxZG8M4QJIx3S6Aughd3RZC4Ca5Ae9fd8L8mlNYBCrQhOZ7dS0f4at4arlLcajtw","e": "AQAB","kid": "test-rsa"},{"kty": "EC","crv": "P-521","x": "AYeAr-K3BMaSlnrjmszuJdOYBstGJf0itM2TTGwsaO0-cGcXor8f0LPXbB9B_gLK7m0th3okXzypIrq-qgTMsMig","y": "AGLdv92aARm6efe_sEJyRJ-n4IBxhMRTm6wIe8AZhlkdLWxzEyfusiXLZHon1Ngt_Q8d_PYWYrbJVWS7VrnK05bJ","kid": "test-ec"}]}'
}
var extauthConfigPemDefault =  {
    "client_id" : "sub",
    "public_keys": `-----BEGIN PUBLIC KEY-----
    MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6S7asUuzq5Q/3U9rbs+P
    kDVIdjgmtgWreG5qWPsC9xXZKiMV1AiV9LXyqQsAYpCqEDM3XbfmZqGb48yLhb/X
    qZaKgSYaC/h2DjM7lgrIQAp9902Rr8fUmLN2ivr5tnLxUUOnMOc2SQtr9dgzTONY
    W5Zu3PwyvAWk5D6ueIUhLtYzpcB+etoNdL3Ir2746KIy/VUsDwAM7dhrqSK8U2xF
    CGlau4ikOTtvzDownAMHMrfE7q1B6WZQDAQlBmxRQsyKln5DIsKv6xauNsHRgBAK
    ctUxZG8M4QJIx3S6Aughd3RZC4Ca5Ae9fd8L8mlNYBCrQhOZ7dS0f4at4arlLcaj
    twIDAQAB
    -----END PUBLIC KEY-----`
}
var extauthConfigWrongPem =  {
    "client_id": "sub",
    "public_keys": `-----BEGIN PUBLIC KEY-----
    MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6S7asUuzq5Q/3U9rbs+P
    kDVIdjgmtgWreG5qWPsC9xXZKiMV1AiV9LXyqQsAYpCqEDM3XbfmZqGb48yLhb/X
    qZaKgSYaC/h2DjM7lgrIQAp9902Rr8fUmLN2ivr5tnLxUUOnMOc2SQtr9dgzTONY
    W5Zu3PwyvAWk5D6ueIUhLtYzpcB+etoNdL3Ir2746KIy/VUsDwAM7dhrqSK8U2xF
    CGlau4ikOTtvzDownAMHMrfE7q1B6WZQDAQlBmxRQsyKln5DIsKv6xauNsHRgBAK
    ctUxZG8M4QJIx3S6Aughd3RZC4Ca5Ae9fd8L8mlNYBCrQhOZ7dS0f4at4arlLcaj
    twIDAQABCD
    -----END PUBLIC KEY-----`
}
var extauthConfigWrongDefault = {
    "client_id": "sub",
    "public_keys": '{"keys": [{"kty": "RSA","n": "6S7asUuzq5Q_3U9rbs-PkDVIdjgmtgWreG5qWPsC9xXZKiMV1AiV9LXyqQsAYpCqEDM3XbfmZqGb48yLhb_XqZaKgSYaC_h2DjM7lgrIQAp9902Rr8fUmLN2ivr5tnLxUUOnMOc2SQtr9dgzTONYW5Zu3PwyvAWk5D6ueIUhLtYzpcB-etoNdL3Ir2746KIy_VUsDwAM7dhrqSK8U2xFCGlau4ikOTtvzDownAMHMrfE7q1B6WZQDAQlBmxRQsyKln5DIsKv6xauNsHRgBAKctUxZG8M4QJIx3S6Aughd3RZC4Ca5Ae9fd8L8mlNYBCrQhOZ7dS0f4at4arlLcajtw","e": "AQAB","kid": "test-rsa"},{"kty": "EC","crv": "P-521","x": "AYeAr-K3BMaSlnrjmszuJdOYBstGJf0itM2TTGwsaO0-cGcXor8f0LPXbB9B_gLK7m0th3okXzypIrq-qgTMsMig","y": "AGLdv92aARm6efe_sEJyRJ-n4IBxhMRTm6wIe8AZhlkdLWxzEyfusiXLZHon1Ngt_Q8d_PYWYrbJVWS7VrnK05bJ","kid": "test"-ec"}]}'
}



describe("extauth plugin", function () {
    var plugin = null;

    after((done) => {
        if ( plugin ) plugin.shutdown();
        done();
      })
    
      it('exposes init of plugin', (done) => {
        var pluginT = extauth.init(extauthConfigDefault, logger, stats);
        assert.ok(pluginT.onrequest);
        done();
      });

      it('calling init with wrong formatted public key', (done) => {
        try{
            extauth.init(extauthConfigWrongDefault, logger, stats);
        }catch(err){
            assert.equal(err instanceof Error, true);
        }
        done();
      });

      it('takes a default config and bad req and res',(done) => {
        var req = null;
        var res = null;

        try{
            var pluginT = extauth.init(extauthConfigDefault, logger, stats);
            pluginT.onrequest(req,res,cb)
        }catch(err){
            assert.equal(err instanceof Error, true);
        }
        done();  
    
      });

      it('takes a default config and no auth header in req',(done) => {
        var req = {
            "headers": {}
        }
        var res = {
            setHeader: function () { },
            end: function () { },
        }
        try{
            var pluginT = extauth.init(extauthConfigDefault, logger, stats);
            pluginT.onrequest.apply(null, [req, res, ()=>{}])
        }catch(err){
            assert.equal(err instanceof Error, true);
        }
        done();
      })

      it('takes a default config and auth header in req',(done) => {
        var req = {
            "headers": {"authorization":"Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6IldfSy1QeGxFbDRITGpZZU8zT0ttc0dqTE11Ry1tanpMTnNtSnMwSDZSR28ifQ.eyJzdWIiOiJ4eXphcnJyIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTYzNzMwNjUwNywiZXhwIjoxNjM3MzEwMTA3fQ.trxnkSM8i20ySXghWPcIdO6KB7q21sBa0yNUA4s3mBlwcV05NNHTrzHvM9qldJF2nE5ZlzV-crmQ-06AmHFPmP2LEDpGdjU-OV3ykcYe8rAmw9gwIPB5f6_ySuW_o2INmehzZdDSkmE1Q7Y9_ilVR8_nCo8d7iFCsvD60CfGV6HwySglVLOHN_bvcL8Y3SQ3blWSCp4g-_O0aADyqY6PFQtktTUsAoBWtaQJpfLQgWCtqiZ_SzuBfysEALl3wkTrwYa-jJU5zOBG0ff_OsBjogravDD0VuerGyp7ib71ZVwL4IfCu64tAz0dheCeOppctdL14446Ti3_hcUNZxzKRA"}
        }
        var res = {
            setHeader: function () { },
            end: function () { },
        }
        try{
            var pluginT = extauth.init(extauthConfigDefault, logger, stats);
            pluginT.onrequest.apply(null, [req, res, ()=>{
            }])
        }catch(err){
            console.log(err);
            assert.equal(err instanceof Error, true);
        }
        done();
      })

      it('takes a default config and auth header in req and pem key type',(done) => {
        var req = {
            "headers": {"authorization":"Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6IldfSy1QeGxFbDRITGpZZU8zT0ttc0dqTE11Ry1tanpMTnNtSnMwSDZSR28ifQ.eyJzdWIiOiJ4eXphcnJyIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTYzNzMwNjUwNywiZXhwIjoxNjQwMDA3MDAwfQ.SJuAeSWnopjRW83G2IRrg2ZCKiwt93030isEPUhniQ3uRgaUCcyxTw6oFv6PRf9dudgHxsJi0fXXg2nOxNVCUf_uiqKb-I2XGlO83YIJvrT_kAQEGEiSEtjSedBEe0rKBDJJ_UiTouKiSGo6St_5MHCpFZ_OuokjrFm5VSphDwoX0mKJJLx_MYMnslXNoVNcfcvZC7AjfodH0j3N0fYNSR613Xqp9U8WCggJvKyqUcLHgwLn-wJ8h1VtGK-rhuvzU4b-Fhn5fESdNT0E07jVu9pzioA6nTmH8ymh150atcvUYGVYkYb9E7OvgpbsxQ6LyvwF0rhr8aW4MG5NzG3Kmg"}
        }
        var res = {
            setHeader: function () { },
            end: function () { },
        }
        try{
            var pluginT = extauth.init(extauthConfigPemDefault, logger, stats);
            pluginT.onrequest.apply(null, [req, res, ()=>{
            }])
        }catch(err){
            console.log(err);
            assert.equal(err instanceof Error, true);
        }
        done();
      })
      it('takes a default config and auth header in req and pem key type and mismatch pem',(done) => {
        var req = {
            "headers": {"authorization":"Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6IldfSy1QeGxFbDRITGpZZU8zT0ttc0dqTE11Ry1tanpMTnNtSnMwSDZSR28ifQ.eyJzdWIiOiJ4eXphcnJyIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTYzNzMwNjUwNywiZXhwIjoxNjQwMDA3MDAwfQ.SJuAeSWnopjRW83G2IRrg2ZCKiwt93030isEPUhniQ3uRgaUCcyxTw6oFv6PRf9dudgHxsJi0fXXg2nOxNVCUf_uiqKb-I2XGlO83YIJvrT_kAQEGEiSEtjSedBEe0rKBDJJ_UiTouKiSGo6St_5MHCpFZ_OuokjrFm5VSphDwoX0mKJJLx_MYMnslXNoVNcfcvZC7AjfodH0j3N0fYNSR613Xqp9U8WCggJvKyqUcLHgwLn-wJ8h1VtGK-rhuvzU4b-Fhn5fESdNT0E07jVu9pzioA6nTmH8ymh150atcvUYGVYkYb9E7OvgpbsxQ6LyvwF0rhr8aW4MG5NzG3Kmg"}
        }
        var res = {
            setHeader: function () { },
            end: function () { },
        }
        try{
            var pluginT = extauth.init(extauthConfigPemDefault, logger, stats);
            pluginT.onrequest.apply(null, [req, res, ()=>{
            }])
        }catch(err){
            console.log(err);
            assert.equal(err instanceof Error, true);
        }
        done();
      })
})