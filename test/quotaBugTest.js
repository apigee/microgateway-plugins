// // quotaBugTest.js
// 'use strict';
// const request = require('request');
// let { user, password, key, secret, org, env, tokenSecret, tokenId } = require('./env.js');
// const assert = require('assert');

// quotaServer.js

// 'use strict';
// const http = require('http');
// const url = require('url');
// const quotaServer = http.createServer((req,res) => { 
//     console.log(req.headers);
//     // console.log('req.url', req.url);
//     let parsedURL = url.parse(req.url);
//     // console.log('parsedURL', parsedURL);
//     if(parsedURL.path==='/quota01') res.end('quota01');
//     else if(parsedURL.path==='/quota02') res.end('quota02');
//     else if(parsedURL.path==='/quotaBoth') res.end('quotaBoth');
//     else res.end('no url path');
// })

// quotaServer.listen(8881);

// function getJWTProm() {
//     return new Promise((resolve, reject) => {

//         request({
//                 uri: `https://${org}-${env}.apigee.net/edgemicro-auth/token`,
//                 method: 'POST',
//                 json: {
                   
//                     client_id: tokenId,
//                     client_secret: tokenSecret,
//                     grant_type: "client_credentials",
//                 }
//             },
//             function(err, resp, body) {
//                 if (err) reject({ err, msg: 'getjwt error' });
//                 else resolve({ resp, body });
              
//             }
//         );
//     })
// }

// function callProxyQuota01(tkn) {
//     return new Promise((resolve, reject) => {
//         request({
//             method: 'get',
//             uri: 'http://localhost:8000/edgemicro_quota01',
//             auth: {
//                 bearer: tkn
//             }
//         }, (err, resp, body) => {
//             if (err) reject({ err, msg: 'quota01 err' });
//             else {
//                 resolve({ resp: { statusCode: resp.statusCode, statusMessage: resp.statusMessage }, body });
//             }
//         })
//     })
// }

// function callProxyQuota02(tkn) {
//     return new Promise((resolve, reject) => {
//         request({
//             method: 'get',
//             uri: 'http://localhost:8000/edgemicro_quota02',
//             auth: {
//                 bearer: tkn
//             }
//         }, (err, resp, body) => {
//             if (err) reject({ err, msg: 'quota02 err' });
//             else {
//                 resolve({ resp: { statusCode: resp.statusCode, statusMessage: resp.statusMessage }, body });
//             }
//         })
//     });
// }

// function callProxyQuotaBoth(tkn) {
//     return new Promise((resolve, reject) => {
//         request({
//             method: 'get',
//             uri: 'http://localhost:8000/edgemicro_quotaBoth',
//             auth: {
//                 bearer: tkn
//             }
//         }, (err, resp, body) => {
//             if (err) reject({ err, msg: 'quotaBoth err' });
//             else {
//                 resolve({ resp: { statusCode: resp.statusCode, statusMessage: resp.statusMessage }, body });
//             }
//         })
//     });
// }


// function awaitTime(milli) {
//     if (isNaN(milli)) return 'not a number';
//     return new Promise(function(resolve, reject) {
//         setTimeout(function() {
//             resolve({});
//         }, Number(milli));
//     });
// }


// //quota2 product has 3 calls per minute quota
// //quota1 product has 15 calls per minute quota
// //app: quotaShared has both quota2 and quota1 added as products
// async function quotaBug() {
//     try {
//         let q1 = 0; //quota1 call count
//         let q2 = 0; //quota2 call count

//         const { body } = await getJWTProm();
//         const { token } = body;


//         // call quota2 4 times per buganizer scenario
//         // console.log(++q2
//           let q2_1 =  await callProxyQuota02(token)
//           assert.deepStrictEqual(q2_1.resp.statusCode, 200);
//         await awaitTime(100);

//         let q2_2 = await callProxyQuota02(token);
//           assert.deepStrictEqual(q2_2.resp.statusCode, 200);
//         await awaitTime(100);

//         // console.log(++q2, 
//             let q2_3= await callProxyQuota02(token);
//                       assert.deepStrictEqual(q2_3.resp.statusCode, 200);

//         await awaitTime(100);




//         //call quota1 multiple times without receiving 4xx response code
//         let q1_1 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_1.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_2 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_2.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_3 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_3.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_4 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_4.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_5 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_5.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_6 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_6.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_7 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_7.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_8 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_8.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_9 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_9.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_10 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_10.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_11 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_11.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_12 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_12.resp.statusCode, 200);
//         await awaitTime(150);

//         let q1_13 = await callProxyQuota01(token);
//         assert.deepStrictEqual(q1_13.resp.statusCode, 200);
//         await awaitTime(150);

//         // let q1_14 = await callProxyQuota01(token);
//         // assert.deepStrictEqual(q1_14.resp.statusCode, 200);
//         // await awaitTime(150);


//         await callProxyQuota01(token);
//         await awaitTime(150);

//         await callProxyQuota01(token);
//         await awaitTime(150);

//         await callProxyQuota01(token);
//         await awaitTime(150);
//         await callProxyQuota01(token);

//         let q1_x = await callProxyQuota01(token);
//         console.log('q1_x-', q1_x);
//         assert.deepStrictEqual(q1_x.resp.statusCode, 403);
//         await awaitTime(150);

       

//     } catch (err) {
//         console.error('quotabug err', err);
//     }
// }



// quotaBug();