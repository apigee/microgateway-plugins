const accessControl = require('../accesscontrol/index');
const assert = require('assert');
const coreObject = require('./microgateway-core');
const logger = coreObject.logger;
const stats = coreObject.stats;


const net = require('net');

const testInputs = [
  {
    message: 'allows source IP by default with undefined config',
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'allows source IP by default with null config',
    config: null,
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'allows source IP by default with empty config',
    config: {},
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'finds host IP from DNS lookup',
    config: {},
    shouldAllow: true, sourceIP:'localhost'
  },
  {
    message: 'blocks source IP if error in DNS lookup',
    config: { allow: ['127.0.0.*']},
    shouldAllow: false, sourceIP:'xyz'
  },
  {
    message: 'blocks source IP if host is not present in request',
    config: { allow: ['127.0.0.*']},
    shouldAllow: false
  },
  {
    message: 'finds and allows host IP from DNS lookup, with allow list',
    config: { allow: ['127.0.0.*']},
    shouldAllow: true, sourceIP:'localhost'
  },
  {
    message: 'finds and denies host IP from DNS lookup, with allow list',
    config: { deny: ['127.0.0.*', '::1']},
    shouldAllow: false, sourceIP:'localhost'
  },
  {
    message: 'allows source IP by default with noRuleMatchAction:allow and no allow, deny list',
    config: { noRuleMatchAction: "allow" },
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'blocks source IP with noRuleMatchAction:deny and no allow, deny list',
    config: { noRuleMatchAction: "deny" },
    shouldAllow: false, sourceIP:'10.11.22.44'
  },
  {
    message: 'blocks source IP when stats object is missing',
    config: { noRuleMatchAction: "deny" }, stats: null,
    shouldAllow: false, sourceIP:'10.11.22.44'
  }, 
  {
    message: 'blocks source IP when res object does not have setHeader function',
    config: { noRuleMatchAction: "deny" }, stats: null,
    shouldAllow: false, sourceIP:'10.11.22.44', res: { end: ()=>{} }
  },
  {
    message: 'blocks source IP when res object is null',
    config: { noRuleMatchAction: "deny" }, stats: null,
    shouldAllow: false, sourceIP:'10.11.22.44', res: null
  },
  {
    message: 'allows source IP with allow list having same IP',
    config: { allow: ["10.11.22.44"] },
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'allows source IP with allow list having pattern matching source IP',
    config: { allow: ["10.11.*.*"] },
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'allows source IP when not matched and only allow list is defined',
    config: { allow: ["10.12.*.*"] },
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'blocks source IP with deny list having same IP',
    config: { deny: ["10.11.22.44"] },
    shouldAllow: false, sourceIP:'10.11.22.44'
  },
  {
    message: 'blocks source IP with deny list having pattern matching source IP',
    config: { deny: ["10.11.*.*"] },
    shouldAllow: false, sourceIP:'10.11.22.44'
  },
  {
    message: 'allows source IP when not matched and only deny list is defined',
    config: { deny: ["10.12.*.*"] },
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'allows source IP when noRuleMatchAction:allow not matched in allow, deny lists',
    config: { deny: ["10.12.*.*"], allow: ["10.14.*.*"], noRuleMatchAction: 'allow' },
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'blocks source IP when noRuleMatchAction:deny not matched in allow, deny lists',
    config: { deny: ["10.12.*.*"], allow: ["10.14.*.*"], noRuleMatchAction: 'deny' },
    shouldAllow: false, sourceIP:'10.11.22.44'
  },
  {
    message: 'allows source IP defined in both allow and deny lists, allow is defined first',
    config: { allow: ["10.11.*.*"], deny: ["10.11.*.*"] },
    shouldAllow: true, sourceIP:'10.11.22.44'
  },
  {
    message: 'blocks source IP defined in both allow and deny lists, denu is defined first',
    config: { deny: ["10.11.*.*"], allow: ["10.11.*.*"] },
    shouldAllow: false, sourceIP:'10.11.22.44'
  },
  {
    message: 'allows X-Forwarded-For IP',
    headers: { 'x-forwarded-for': '192.168.1.1' },
    config: { allow: ['192.168.1.*'] },
    shouldAllow: true
  },
  {
    message: 'handles IPv4-mapped IPv6 address',
    remoteAddress: '::ffff:10.11.22.44',
    config: { allow: ['10.11.22.44'] },
    shouldAllow: true
  },
  {
    message: 'supports exact IPv6 match',
    remoteAddress: '2001:db8::1',
    config: { allow: ['2001:db8::1'] },
    shouldAllow: true
  }
]


describe('accesscontrol plugin', () => {
  

  it('exposes an onrequest handler', (done) => {
    const config = {};
    let plugin = accessControl.init.apply(null, [config, logger, stats]);
    assert.ok(plugin.onrequest);
    done();
  });
  

  testInputs.forEach( testInput => {

    it(testInput.message, (done) => {
      let statsInput = stats;
      if ( testInput.hasOwnProperty('stats')  ){
        statsInput = testInput.stats;
      }
      let plugin = accessControl.init.apply(null, [testInput.config, logger, statsInput]);

      const onreq_cb = (err, result) => {
        let isAllowed = !err;
        if ( testInput.shouldAllow ) {
          assert.equal(isAllowed, true);
        } else {
          assert.equal(isAllowed, false);
        }
        done();
      }

      const req = {
        headers: testInput.headers || (testInput.sourceIP ? { host: testInput.sourceIP } : {}),
        connection: (testInput.remoteAddress !== undefined || (testInput.sourceIP && net.isIP(testInput.sourceIP))) ? {
           remoteAddress: testInput.remoteAddress || testInput.sourceIP
        } : {}
      };
      if (testInput.remoteAddress === null) delete req.connection.remoteAddress;

      const res = {
        setHeader: () => {},
        end: () => {}
      };

      let response = res;
      if ( testInput.hasOwnProperty('res')  ){
        response = testInput.res;
      }

      plugin.onrequest.apply(null, [req, response, onreq_cb]); 
    });

  })

})
