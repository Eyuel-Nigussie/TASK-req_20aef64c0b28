'use strict';

// WeChat OAuth adapter.
//
// This repository targets offline-first deployments and therefore does NOT
// ship the network client that would call WeChat's OAuth endpoints. The
// adapter below documents the shape of the integration so that a production
// deployment can wire it up without changing callers.
//
// Required environment configuration (see src/config/index.js):
//   WECHAT_OAUTH_ENABLED=true      — toggle this feature on
//   WECHAT_APP_ID=<AppID>          — issued by WeChat Open Platform
//   WECHAT_APP_SECRET=<AppSecret>  — keep out of source control; use a secret manager
//   WECHAT_REDIRECT_URI=<url>      — must match the URI registered in the Open Platform
//
// Expected OAuth flow when enabled:
//   1. Frontend redirects the user to
//        https://open.weixin.qq.com/connect/qrconnect?
//          appid={WECHAT_APP_ID}&redirect_uri={WECHAT_REDIRECT_URI}
//          &response_type=code&scope=snsapi_login&state={csrfToken}#wechat_redirect
//   2. WeChat calls the redirect URI with ?code=...&state=...
//   3. The frontend POSTs { code } to /api/auth/wechat/exchange.
//   4. `exchangeCode(code)` is expected to:
//        a. POST to https://api.weixin.qq.com/sns/oauth2/access_token with
//           appid / secret / code / grant_type=authorization_code
//        b. Receive { access_token, openid, unionid, expires_in, refresh_token }
//        c. Look up or create the linked user (wechatBound = { openid, unionid })
//        d. Return { token: <our JWT>, user, nav, permissions } — same shape
//           as /api/auth/login.
//   5. `bindMobile(userId, mobile, otp)` runs after a first login to attach a
//       mobile number; OTP delivery must use your carrier/SMS provider.
//
// Until a production deployment replaces this adapter, all calls throw a
// WECHAT_NOT_CONFIGURED error so it is impossible to silently fall through
// into an authenticated state with no real identity check.

const config = require('../config');
const { forbidden, bad } = require('../utils/errors');

function isEnabled() {
  return Boolean(config.wechatOAuthEnabled);
}

function ensureEnabled() {
  if (!isEnabled()) {
    throw forbidden('WeChat OAuth is disabled in offline deployments', 'WECHAT_DISABLED');
  }
}

async function exchangeCode(code) {
  ensureEnabled();
  if (!code) throw bad('code is required', 'VALIDATION');
  // Production adapters plug in here, using:
  //   config.wechatAppId / config.wechatAppSecret / config.wechatRedirectUri
  //   const tokenResp = await fetch('https://api.weixin.qq.com/sns/oauth2/access_token?...');
  //   const { openid, unionid } = await tokenResp.json();
  //   ...link or create user, sign our JWT, return { token, user, nav, permissions }
  throw forbidden(
    'WeChat integration adapter is a stub; replace exchangeCode() with a production implementation',
    'WECHAT_NOT_CONFIGURED'
  );
}

async function bindMobile(userId, mobile, otp) {
  ensureEnabled();
  if (!userId || !mobile || !otp) throw bad('userId, mobile, otp required', 'VALIDATION');
  // Production adapter verifies the OTP against your SMS provider, then
  // persists { wechatBound: { mobile, verifiedAt } } on the user record.
  throw forbidden(
    'WeChat integration adapter is a stub; replace bindMobile() with a production implementation',
    'WECHAT_NOT_CONFIGURED'
  );
}

module.exports = { isEnabled, exchangeCode, bindMobile };
