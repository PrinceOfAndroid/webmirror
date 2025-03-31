import request from '../utils/request';

// 匿名登录
export const anonymousLogin = () => {
  return request({
    url: '/passport/v2/login/anonymous',
    method: 'post',
    data: {
      cli_os: 'android',
      os_name: 'android',
      os_version: '1.0',
      device_hash: generateDeviceId()
    }
  });
};

// 获取投屏码
export const getMirrorCode = (apiToken) => {
  return request({
    url: '/support/apowermirror/mirror/code',
    method: 'post',
    data: {
      api_token: apiToken,
      hash: generateDeviceId(),
      device: 'android',
      region: 'cn',
      name: 'Web Browser'
    }
  });
};

// 获取认证令牌
// export const getAuthToken = () => {
//   return request({
//     url: '/support/apowermirror/mirror/auth',
//     method: 'post',
//     data: {
//       hash: generateDeviceId(),
//       device: 'android',
//       region: 'cn',
//       name: 'Web Browser'
//     }
//   });
// };

// 生成设备ID
const generateDeviceId = () => {
  return 'web_' + Math.random().toString(36).substr(2, 9);
}; 