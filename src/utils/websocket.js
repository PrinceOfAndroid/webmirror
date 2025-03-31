export class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectCount = 0;
    this.maxReconnectCount = 5;
    this.reconnectInterval = 3000;
    this.status = 'disconnected'; // disconnected, connecting, connected, error
    this.messageHandlers = new Map();
    this.auth = null;
    this.heartbeatTimer = null;
    this.heartbeatInterval = 30000; // 30秒
    this.lastPongTime = null;
    this.pingTimeout = 50000; // 50秒内没有收到PONG就认为连接断开
    this.pingCheckTimer = null;
    this.rtcService = null; // 添加RTC服务引用
    this.mirrorCode = 0;
  }

  // 设置RTC服务
  setRTCService(rtcService) {
    this.rtcService = rtcService;
  }

  // 连接WebSocket
  connect(auth,mirrorCode) {
    if (this.ws) {
      this.disconnect();
    }

    this.auth = auth;
    this.status = 'connecting';
    this.mirrorCode = mirrorCode;

    // 创建WebSocket实例，将auth作为URL参数传递
    this.ws = new WebSocket(`wss://aw.aoscdn.com/base/support/apowermirror?auth=${encodeURIComponent(auth)}`);

    // 设置连接超时
    const connectionTimeout = setTimeout(() => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        this.ws.close();
        this.status = 'error';
      }
    }, 5000);

    this.ws.onopen = () => {
      clearTimeout(connectionTimeout);
      this.status = 'connected';
      this.reconnectCount = 0;
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        // 处理PONG字符串响应
        if (event.data === 'PONG') {
          this.lastPongTime = Date.now();
          this.messageHandlers.get('heartbeat')?.({ action: 'PONG' });
          this.messageHandlers.get('raw')?.(event.data);
          return;
        }

        // 处理其他JSON消息
        const data = JSON.parse(event.data);
        
        // 处理状态码消息
        if (data.status === 201) {
          // 发送接受分享的消息
          this.ws.send(JSON.stringify({
            action: 'acceptShare',
            data: {
              channel_name: data.data['channel_name'],
            }
          }));
          this.messageHandlers.get('raw')?.(event.data);
          return;
        }

        // 处理频道分配消息
        if (data.status === 110) {
          // 加入声网频道
          if (this.rtcService) {

            const channel_name = data.data['channel_name']
            const token = data.data['token']

            console.log('收到频道分配消息:', {
              channel: channel_name,
              token: token
            });
            
            // 通知UI更新
            this.messageHandlers.get('message')?.({
              type: 'channel',
              data: {
                channel: channel_name,
                token: token
              }
            });

            // 确保channel和token都存在
            if (!channel_name || !token) {
              console.error('频道信息不完整:', data.data);
              return;
            }

            // 加入频道
            this.rtcService.joinChannel(mirrorCode,channel_name, token)
              .then(success => {
                if (success) {
                  console.log('成功加入声网频道');
                  this.messageHandlers.get('message')?.({
                    type: 'rtc',
                    data: '成功加入声网频道'
                  });
                } else {
                  console.error('加入声网频道失败');
                  this.messageHandlers.get('message')?.({
                    type: 'error',
                    data: '加入声网频道失败'
                  });
                }
              })
              .catch(error => {
                console.error('加入声网频道出错:', error);
                this.messageHandlers.get('message')?.({
                  type: 'error',
                  data: `加入声网频道出错: ${error.message}`
                });
              });
          }
          this.messageHandlers.get('raw')?.(event.data);
          return;
        }

        // 处理连接成功响应
        if (data.status === 200 && data.message === 'connected') {
          this.status = 'connected';
          this.messageHandlers.get('raw')?.(event.data);
          return;
        }

        // 调用对应的消息处理器
        this.messageHandlers.forEach((handler, type) => {
          if (data.action === type) {
            handler(data);
          }
        });

        // 添加原始消息处理器
        this.messageHandlers.get('raw')?.(event.data);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
        // 如果解析失败，也发送原始消息
        this.messageHandlers.get('raw')?.(event.data);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.status = 'error';
      this.stopHeartbeat();
      this.reconnect();
    };

    this.ws.onclose = () => {
      clearTimeout(connectionTimeout);
      this.status = 'disconnected';
      this.stopHeartbeat();
      this.reconnect();
    };
  }

  // 开始心跳检测
  startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongTime = Date.now();
    
    // 定期发送PING
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('PING');
        
        // 设置PING超时检查
        if (this.pingCheckTimer) {
          clearTimeout(this.pingCheckTimer);
        }
        this.pingCheckTimer = setTimeout(() => {
          if (Date.now() - this.lastPongTime > this.pingTimeout) {
            console.error('Heartbeat timeout');
            this.ws.close();
            this.status = 'error';
          }
        }, this.pingTimeout);
      }
    }, this.heartbeatInterval);
  }

  // 停止心跳检测
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pingCheckTimer) {
      clearTimeout(this.pingCheckTimer);
      this.pingCheckTimer = null;
    }
  }

  // 重连机制
  reconnect() {
    if (this.reconnectCount >= this.maxReconnectCount) {
      this.status = 'error';
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectCount++;
    this.reconnectTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        return;
      }
      this.connect(this.auth);
    }, this.reconnectInterval);
  }

  // 断开连接
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.status = 'disconnected';
    this.reconnectCount = 0;
  }

  // 注册消息处理器
  on(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  // 移除消息处理器
  off(type) {
    this.messageHandlers.delete(type);
  }

  // 发送消息
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // 获取连接状态
  getStatus() {
    return this.status;
  }

  // 获取最后PONG时间
  getLastPongTime() {
    return this.lastPongTime;
  }
} 