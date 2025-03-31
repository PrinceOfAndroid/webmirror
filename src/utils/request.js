import axios from 'axios';

const BASE_URL = 'https://aw.aoscdn.com/base';

// 获取默认参数
export const getDefaultParams = () => {
  return {
    language: 'zh-CN',
    device_hash: generateDeviceId(),
    product_id: 'apowermirror_tv',
    os_version: '1.0',
    os_name: 'Android',
    platform: '5'
  };
};

// 生成设备ID
const generateDeviceId = () => {
  return 'web_' + Math.random().toString(36).substr(2, 9);
};

// 创建axios实例
const request = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
request.interceptors.request.use(
  config => {
    const defaultParams = getDefaultParams();
    // 如果是POST请求，将默认参数添加到请求体中
    if (config.method === 'post') {
      config.data = {
        ...defaultParams,
        ...config.data
      };
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 响应拦截器
request.interceptors.response.use(
  response => {
    return response.data;
  },
  error => {
    return Promise.reject(error);
  }
);

export default request; 