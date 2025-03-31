# 云投屏接收端实现文档
WebSocket服务地址："wss://aw.aoscdn.com/base/support/apowermirror"

## 一、接收端初始化

### 1.1 获取投屏码
匿名登录
- 接口地址: POST https://aw.aoscdn.com/base/passport/v2/login/anonymous

- 请求参数:
  - cli_os:  "Web"
  - os_name: "Web"
  - os_version: "1.0"
  - device_hash: 设备唯一标识
- 响应数据:
```json
{
    "status": 200,
    "message": "success",
    "data": {
        "api_token": "v2,2701869219,277,5710e3e1db6463a5a22aa4ea52082e1c0",
        "device_id": 2701869219
    }
}
```

请求投屏码接口
- 接口地址: POST https://aw.aoscdn.com/base/support/apowermirror/mirror/code
- 请求参数:
  - api_token: 用户token
  - hash: 设备唯一标识
  - device: 设备类型(android)
  - region: 地区信息
  - name: 设备名称
- 响应数据:
```json
{
    "status": 200,
    "message": "Success",
    "data": {
        "code": "991426058",
        "auth": "ec3f271badbb61b4c03c9049029f4b48",
        "uid": 0,
        "hash": "web_c17tbxej3",
        "device": "android",
        "name": "Web Browser"
    }
}
```

投屏码刷新机制
- 监听网络状态变化
- 网络可用时检查用户登录状态
- 用户已登录则请求新的投屏码
- 网络断开时停止云投屏服务

错误处理机制
- WebSocket认证失败(101)时重新获取授权
- 请求失败时记录错误日志
- 解析失败时记录异常信息

### 1.2 WebSocket连接建立
1. 连接流程
- 使用auth_token发起WebSocket连接
- 接收连接成功响应(status: 200)

2. 通信消息结构
```json
// 请求消息格式
{
    "action": "action_name",    // 操作类型
    "data": {                   // 请求参数
        "key": "value"
    }
}

// 响应消息格式
{
    "status": 200,             // 状态码
    "data": {                  // 响应数据
        "key": "value"
    },
    "message": "success"       // 状态描述
}

// 认证消息格式
{
    "Auth": "auth_token"       // 认证token
}

// 连接成功响应
{
    "status": 200,
    "message": "connected"
}
```

3. 投屏码显示
- 从CloudCodeManager获取投屏码
- 格式化显示(每3位添加空格)

## 二、接收分享请求流程


### 2.1 频道分配
1. 消息格式
```json
// 频道分配消息 (状态码: 110)
{
    "status": 110,
    "data": {
        "channel_name": "channel_id",      // 频道ID
        "token": "rtc_token",              // RTC令牌
        "receiver": "receiver_id",         // 接收端ID
        "receiver_name": "device_name"     // 设备名称
    }
}
```

2. 身份验证
- 验证接收端ID与本地投屏码匹配
- 匹配成功则进入接收模式

## 三、声网SDK初始化

### 3.1 启动接收Activity
- 传入用户ID、房间号和RTC令牌
- 启动RTCRoomswActivity

### 3.2 配置接收端参数
1. 基础配置
- 设置频道场景为直播模式
- 设置用户角色为观众
- 加入指定频道

### 3.3 视频渲染设置
- 创建远端视图渲染器
- 配置视频显示模式

## 四、状态监听与异常处理

### 4.1 连接状态监听
1. WebSocket状态监听
- 204: 停止分享
- STATUS_RECONNECT: 重连
- STATUS_LOSE_CONNECT: 断连

2. 声网事件监听
- 首帧解码完成时设置远端视图
- 离开频道时停止云投屏
- 发送端离线时停止云投屏

### 4.2 异常处理机制
1. 断线重连处理
- 15秒重连保护机制
- 等待对方重连或超时退出

2. 停止投屏处理
- 退出频道
- 通知服务器停止分享
- 清理资源并退出

## 五、状态码说明

### 5.1 接收端状态码
| 状态码 | 说明 | 处理方式 |
|--------|------|----------|
| 205 | 接收端在线 | 响应发送端验证请求 |
| 110 | 频道分配成功 | 初始化声网SDK |
| 204 | 停止分享 | 清理资源退出 |
| 206 | 发送端异常断连 | 等待重连或超时退出 |
| 207 | 发送端重新连接 | 重置重连计时器 |

### 5.2 错误状态码
| 状态码 | 说明 | 处理方式 |
|--------|------|----------|
| 101 | 认证失败 | 重新获取授权 |
| 106 | 区域限制 | 提示用户并退出 |

## 六、资源释放

### 6.1 退出处理
1. 状态清理
- 重置云投屏状态标记
- 移除定时器回调
- 移除事件监听
- 更新投屏设置

### 6.2 异常退出保护
- 15秒重连保护机制
- 网络状态监听
- 资源释放确认
- 状态回调清理 